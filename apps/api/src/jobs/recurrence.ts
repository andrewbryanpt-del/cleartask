import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { nextOccurrence } from "../lib/recurrence";
import { resolveAssignmentTargets } from "../modules/tasks/tasks.service";
import { recordAudit } from "../modules/audit/audit.service";
import { enqueueTaskAssigned, scheduleTaskReminders } from "./boss";

// Occurrences are materialized this far ahead at minimum, extended per rule
// so the earliest reminder of an occurrence can always be scheduled.
const MIN_LOOKAHEAD_MINUTES = 24 * 60;
// Safety valve against rules that would flood a sweep (e.g. FREQ=MINUTELY).
const MAX_OCCURRENCES_PER_SWEEP = 50;

type RuleWithTemplate = Prisma.RecurrenceRuleGetPayload<{
  include: {
    template: { include: { attachments: true } };
    department: true;
  };
}>;

export async function materializeDueRules(
  now: Date = new Date(),
): Promise<void> {
  const rules = await prisma.recurrenceRule.findMany({
    where: { active: true, nextRunAt: { not: null } },
    include: {
      template: { include: { attachments: true } },
      department: true,
    },
  });

  for (const rule of rules) {
    try {
      await materializeRule(rule, now);
    } catch (err) {
      console.error(`[recurrence] rule ${rule.id} failed:`, err);
    }
  }
}

async function materializeRule(
  rule: RuleWithTemplate,
  now: Date,
): Promise<void> {
  const lookaheadMinutes = Math.max(
    MIN_LOOKAHEAD_MINUTES,
    ...rule.template.reminderOffsetsMinutes,
  );
  const horizon = new Date(now.getTime() + lookaheadMinutes * 60_000);

  let nextRunAt: Date | null = rule.nextRunAt;
  let produced = 0;
  while (
    nextRunAt &&
    nextRunAt.getTime() <= horizon.getTime() &&
    produced < MAX_OCCURRENCES_PER_SWEEP
  ) {
    await materializeOccurrence(rule, nextRunAt);
    produced += 1;
    nextRunAt = nextOccurrence(
      rule.rrule,
      rule.timezone,
      nextRunAt,
      rule.createdAt,
    );
  }

  if (
    produced > 0 ||
    (nextRunAt?.getTime() ?? null) !== (rule.nextRunAt?.getTime() ?? null)
  ) {
    await prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextRunAt, ...(nextRunAt ? {} : { active: false }) },
    });
  }
}

async function materializeOccurrence(
  rule: RuleWithTemplate,
  dueAt: Date,
): Promise<void> {
  // Idempotency: if a previous sweep crashed between creating the task and
  // advancing nextRunAt, don't create the occurrence twice.
  const existing = await prisma.task.findFirst({
    where: { recurrenceRuleId: rule.id, dueAt },
    select: { id: true },
  });
  if (existing) return;

  // Tolerant assignee resolution — members or departments removed since
  // the rule was created are skipped, not fatal.
  const members =
    rule.assigneeMembershipIds.length > 0
      ? await prisma.membership.findMany({
          where: {
            id: { in: rule.assigneeMembershipIds },
            organizationId: rule.organizationId,
          },
          select: { id: true },
        })
      : [];
  const departments =
    rule.assigneeDepartmentIds.length > 0
      ? await prisma.department.findMany({
          where: {
            id: { in: rule.assigneeDepartmentIds },
            organizationId: rule.organizationId,
          },
          include: { memberships: { select: { id: true } } },
        })
      : [];
  const targets = resolveAssignmentTargets(
    members.map((m) => m.id),
    departments.map((d) => ({
      departmentId: d.id,
      membershipIds: d.memberships.map((m) => m.id),
    })),
  );

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        organizationId: rule.organizationId,
        title: rule.template.title,
        description: rule.template.description,
        dueAt,
        locationId: rule.locationId ?? rule.department?.locationId,
        departmentId: rule.departmentId,
        templateId: rule.templateId,
        recurrenceRuleId: rule.id,
        reminderOffsetsMinutes: rule.template.reminderOffsetsMinutes,
      },
    });
    if (targets.length > 0) {
      await tx.taskAssignment.createMany({
        data: targets.map((t) => ({
          taskId: created.id,
          membershipId: t.membershipId,
          sourceDepartmentId: t.sourceDepartmentId,
        })),
      });
    }
    if (rule.template.attachments.length > 0) {
      await tx.attachment.createMany({
        data: rule.template.attachments.map((att) => ({
          organizationId: rule.organizationId,
          taskId: created.id,
          uploadedByMembershipId: att.uploadedByMembershipId,
          fileName: att.fileName,
          storageKey: att.storageKey,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
        })),
      });
    }
    return created;
  });

  await recordAudit({
    organizationId: rule.organizationId,
    actorMembershipId: null,
    action: "task.materialized",
    entityType: "Task",
    entityId: task.id,
    detail: {
      recurrenceRuleId: rule.id,
      templateId: rule.templateId,
      dueAt: dueAt.toISOString(),
      assigneeCount: targets.length,
    },
  });
  await enqueueTaskAssigned(
    task.id,
    targets.map((t) => t.membershipId),
  );
  await scheduleTaskReminders(task);
}
