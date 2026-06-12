import type { FastifyInstance } from "fastify";
import {
  createTaskTemplateSchema,
  updateTaskTemplateSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { notFound } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";

const templateInclude = {
  attachments: {
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
  },
  _count: { select: { tasks: true } },
} as const;

export default async function taskTemplatesRoutes(app: FastifyInstance) {
  // Listing is open to all members — anyone with task.create picks from
  // templates; managing them requires template.manage.
  app.get(
    "/task-templates",
    { preHandler: app.authenticate },
    async (req) => {
      const templates = await prisma.taskTemplate.findMany({
        where: { organizationId: req.auth.organizationId },
        include: templateInclude,
        orderBy: { createdAt: "asc" },
      });
      return templates.map((t) => ({ ...t, taskCount: t._count.tasks, _count: undefined }));
    },
  );

  app.get<{ Params: { templateId: string } }>(
    "/task-templates/:templateId",
    { preHandler: app.authenticate },
    async (req) => {
      const template = await prisma.taskTemplate.findFirst({
        where: {
          id: req.params.templateId,
          organizationId: req.auth.organizationId,
        },
        include: templateInclude,
      });
      if (!template) throw notFound("Template not found");
      return { ...template, taskCount: template._count.tasks, _count: undefined };
    },
  );

  app.post(
    "/task-templates",
    { preHandler: app.requirePermission("template.manage") },
    async (req, reply) => {
      const input = createTaskTemplateSchema.parse(req.body);
      const template = await prisma.taskTemplate.create({
        data: {
          organizationId: req.auth.organizationId,
          title: input.title,
          description: input.description,
          reminderOffsetsMinutes: input.reminderOffsetsMinutes ?? [],
          createdByMembershipId: req.auth.membershipId,
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "template.created",
        entityType: "TaskTemplate",
        entityId: template.id,
        detail: { title: template.title },
      });
      return reply.status(201).send(template);
    },
  );

  app.patch<{ Params: { templateId: string } }>(
    "/task-templates/:templateId",
    { preHandler: app.requirePermission("template.manage") },
    async (req) => {
      const input = updateTaskTemplateSchema.parse(req.body);
      const template = await prisma.taskTemplate.findFirst({
        where: {
          id: req.params.templateId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!template) throw notFound("Template not found");

      const updated = await prisma.taskTemplate.update({
        where: { id: template.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.reminderOffsetsMinutes !== undefined
            ? { reminderOffsetsMinutes: input.reminderOffsetsMinutes }
            : {}),
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "template.updated",
        entityType: "TaskTemplate",
        entityId: template.id,
        detail: input,
      });
      return updated;
    },
  );

  app.delete<{ Params: { templateId: string } }>(
    "/task-templates/:templateId",
    { preHandler: app.requirePermission("template.manage") },
    async (req) => {
      const template = await prisma.taskTemplate.findFirst({
        where: {
          id: req.params.templateId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!template) throw notFound("Template not found");
      // Task.templateId is SetNull on delete — existing tasks survive.
      await prisma.taskTemplate.delete({ where: { id: template.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "template.deleted",
        entityType: "TaskTemplate",
        entityId: template.id,
        detail: { title: template.title },
      });
      return { ok: true };
    },
  );
}
