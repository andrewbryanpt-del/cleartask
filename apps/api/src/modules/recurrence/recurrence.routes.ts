import type { FastifyInstance } from "fastify";
import {
  createRecurrenceRuleSchema,
  updateRecurrenceRuleSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { nextOccurrence, parseRule } from "../../lib/recurrence";
import { badRequest, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";
import { expandAssignees } from "../tasks/tasks.service";

function validateRrule(rrule: string, timezone: string, dtstart: Date): void {
  try {
    parseRule(rrule, timezone, dtstart);
  } catch (err) {
    throw badRequest(
      `Invalid recurrence rule: ${err instanceof Error ? err.message : "unparseable"}`,
    );
  }
}

const ruleInclude = {
  template: { select: { id: true, title: true } },
  location: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} as const;

export default async function recurrenceRoutes(app: FastifyInstance) {
  app.get(
    "/recurrence-rules",
    { preHandler: app.authenticate },
    async (req) => {
      return prisma.recurrenceRule.findMany({
        where: { organizationId: req.auth.organizationId },
        include: ruleInclude,
        orderBy: { createdAt: "asc" },
      });
    },
  );

  app.post(
    "/recurrence-rules",
    { preHandler: app.requirePermission("template.manage") },
    async (req, reply) => {
      const input = createRecurrenceRuleSchema.parse(req.body);
      const orgId = req.auth.organizationId;

      const template = await prisma.taskTemplate.findFirst({
        where: { id: input.templateId, organizationId: orgId },
      });
      if (!template) throw badRequest("Unknown template");

      if (input.departmentId) {
        const department = await prisma.department.findFirst({
          where: { id: input.departmentId, organizationId: orgId },
        });
        if (!department) throw badRequest("Unknown department");
      }
      if (input.locationId) {
        const location = await prisma.location.findFirst({
          where: { id: input.locationId, organizationId: orgId },
        });
        if (!location) throw badRequest("Unknown location");
      }
      // Validates the assignees exist in this organization; the targets
      // themselves are re-resolved at each materialization.
      await expandAssignees(
        orgId,
        input.assigneeMembershipIds,
        input.assigneeDepartmentIds,
      );

      const now = new Date();
      validateRrule(input.rrule, input.timezone, now);
      const nextRunAt = nextOccurrence(input.rrule, input.timezone, now, now);
      if (!nextRunAt) {
        throw badRequest("The rule has no future occurrences");
      }

      const rule = await prisma.recurrenceRule.create({
        data: {
          organizationId: orgId,
          templateId: template.id,
          rrule: input.rrule,
          timezone: input.timezone,
          locationId: input.locationId,
          departmentId: input.departmentId,
          assigneeMembershipIds: input.assigneeMembershipIds,
          assigneeDepartmentIds: input.assigneeDepartmentIds,
          nextRunAt,
        },
        include: ruleInclude,
      });
      await recordAudit({
        organizationId: orgId,
        actorMembershipId: req.auth.membershipId,
        action: "recurrence.created",
        entityType: "RecurrenceRule",
        entityId: rule.id,
        detail: {
          templateId: template.id,
          rrule: input.rrule,
          timezone: input.timezone,
          nextRunAt: nextRunAt.toISOString(),
        },
      });
      return reply.status(201).send(rule);
    },
  );

  app.patch<{ Params: { ruleId: string } }>(
    "/recurrence-rules/:ruleId",
    { preHandler: app.requirePermission("template.manage") },
    async (req) => {
      const input = updateRecurrenceRuleSchema.parse(req.body);
      const orgId = req.auth.organizationId;
      const rule = await prisma.recurrenceRule.findFirst({
        where: { id: req.params.ruleId, organizationId: orgId },
      });
      if (!rule) throw notFound("Recurrence rule not found");

      if (input.departmentId) {
        const department = await prisma.department.findFirst({
          where: { id: input.departmentId, organizationId: orgId },
        });
        if (!department) throw badRequest("Unknown department");
      }
      if (input.locationId) {
        const location = await prisma.location.findFirst({
          where: { id: input.locationId, organizationId: orgId },
        });
        if (!location) throw badRequest("Unknown location");
      }
      if (input.assigneeMembershipIds || input.assigneeDepartmentIds) {
        await expandAssignees(
          orgId,
          input.assigneeMembershipIds ?? [],
          input.assigneeDepartmentIds ?? [],
        );
      }

      // Editing the schedule (or reactivating) recomputes nextRunAt from
      // now — already-materialized occurrences are never touched.
      const rrule = input.rrule ?? rule.rrule;
      const timezone = input.timezone ?? rule.timezone;
      const active = input.active ?? rule.active;
      const scheduleChanged =
        rrule !== rule.rrule ||
        timezone !== rule.timezone ||
        (active && !rule.active);

      let nextRunAt = rule.nextRunAt;
      if (scheduleChanged) {
        validateRrule(rrule, timezone, rule.createdAt);
        nextRunAt = nextOccurrence(rrule, timezone, new Date(), rule.createdAt);
        if (!nextRunAt) {
          throw badRequest("The rule has no future occurrences");
        }
      }

      const updated = await prisma.recurrenceRule.update({
        where: { id: rule.id },
        data: {
          rrule,
          timezone,
          active,
          nextRunAt,
          ...(input.locationId !== undefined
            ? { locationId: input.locationId }
            : {}),
          ...(input.departmentId !== undefined
            ? { departmentId: input.departmentId }
            : {}),
          ...(input.assigneeMembershipIds
            ? { assigneeMembershipIds: input.assigneeMembershipIds }
            : {}),
          ...(input.assigneeDepartmentIds
            ? { assigneeDepartmentIds: input.assigneeDepartmentIds }
            : {}),
        },
        include: ruleInclude,
      });
      await recordAudit({
        organizationId: orgId,
        actorMembershipId: req.auth.membershipId,
        action: "recurrence.updated",
        entityType: "RecurrenceRule",
        entityId: rule.id,
        detail: input,
      });
      return updated;
    },
  );

  app.delete<{ Params: { ruleId: string } }>(
    "/recurrence-rules/:ruleId",
    { preHandler: app.requirePermission("template.manage") },
    async (req) => {
      const rule = await prisma.recurrenceRule.findFirst({
        where: {
          id: req.params.ruleId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!rule) throw notFound("Recurrence rule not found");
      // Task.recurrenceRuleId is SetNull on delete — materialized tasks
      // survive.
      await prisma.recurrenceRule.delete({ where: { id: rule.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "recurrence.deleted",
        entityType: "RecurrenceRule",
        entityId: rule.id,
        detail: { rrule: rule.rrule },
      });
      return { ok: true };
    },
  );
}
