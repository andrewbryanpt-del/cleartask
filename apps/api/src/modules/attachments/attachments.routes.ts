import type { FastifyInstance } from "fastify";
import { hasPermission } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { fileStream, saveFile } from "../../lib/storage";
import { recordAudit } from "../audit/audit.service";
import { canManageTask, getVisibleTask } from "../tasks/tasks.service";

export default async function attachmentsRoutes(app: FastifyInstance) {
  app.post<{ Params: { taskId: string } }>(
    "/tasks/:taskId/attachments",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const task = await getVisibleTask(req.auth, req.params.taskId);
      if (!canManageTask(req.auth, task)) {
        throw forbidden("You cannot attach files to this task");
      }
      const file = await req.file();
      if (!file) throw badRequest("No file uploaded");

      const key = await saveFile(await file.toBuffer(), file.filename);
      const attachment = await prisma.attachment.create({
        data: {
          organizationId: req.auth.organizationId,
          taskId: task.id,
          uploadedByMembershipId: req.auth.membershipId,
          fileName: file.filename,
          storageKey: key,
          mimeType: file.mimetype,
          sizeBytes: file.file.bytesRead,
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "attachment.uploaded",
        entityType: "Attachment",
        entityId: attachment.id,
        detail: { taskId: task.id, fileName: attachment.fileName },
      });
      return reply.status(201).send({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl: `/api/v1/attachments/${attachment.id}/download`,
      });
    },
  );

  app.post<{ Params: { templateId: string } }>(
    "/task-templates/:templateId/attachments",
    { preHandler: app.requirePermission("template.manage") },
    async (req, reply) => {
      const template = await prisma.taskTemplate.findFirst({
        where: {
          id: req.params.templateId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!template) throw notFound("Template not found");
      const file = await req.file();
      if (!file) throw badRequest("No file uploaded");

      const key = await saveFile(await file.toBuffer(), file.filename);
      const attachment = await prisma.attachment.create({
        data: {
          organizationId: req.auth.organizationId,
          templateId: template.id,
          uploadedByMembershipId: req.auth.membershipId,
          fileName: file.filename,
          storageKey: key,
          mimeType: file.mimetype,
          sizeBytes: file.file.bytesRead,
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "attachment.uploaded",
        entityType: "Attachment",
        entityId: attachment.id,
        detail: { templateId: template.id, fileName: attachment.fileName },
      });
      return reply.status(201).send({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      });
    },
  );

  // Downloading through this route is what records the view — the
  // "has this staff member opened the training material" requirement.
  // Only the first view per member is kept (AttachmentView is unique per
  // attachment + membership).
  app.get<{ Params: { attachmentId: string } }>(
    "/attachments/:attachmentId/download",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const attachment = await prisma.attachment.findFirst({
        where: {
          id: req.params.attachmentId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!attachment) throw notFound("Attachment not found");
      // Task attachments follow task visibility; template attachments are
      // visible to any member of the organisation.
      if (attachment.taskId) {
        await getVisibleTask(req.auth, attachment.taskId);
      }

      await prisma.attachmentView.upsert({
        where: {
          attachmentId_membershipId: {
            attachmentId: attachment.id,
            membershipId: req.auth.membershipId,
          },
        },
        create: {
          attachmentId: attachment.id,
          membershipId: req.auth.membershipId,
        },
        update: {},
      });

      return reply
        .header("content-type", attachment.mimeType)
        .header(
          "content-disposition",
          `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
        )
        .send(fileStream(attachment.storageKey));
    },
  );

  // Who has viewed an attachment — for managers checking that staff read
  // the SOP / watched the training video.
  app.get<{ Params: { attachmentId: string } }>(
    "/attachments/:attachmentId/views",
    { preHandler: app.authenticate },
    async (req) => {
      const attachment = await prisma.attachment.findFirst({
        where: {
          id: req.params.attachmentId,
          organizationId: req.auth.organizationId,
        },
        include: { task: true },
      });
      if (!attachment) throw notFound("Attachment not found");
      const allowed = attachment.task
        ? canManageTask(req.auth, attachment.task)
        : hasPermission(req.auth, "template.manage") || req.auth.isOwner;
      if (!allowed) throw forbidden("You cannot view attachment analytics");

      const views = await prisma.attachmentView.findMany({
        where: { attachmentId: attachment.id },
        include: {
          membership: {
            select: { id: true, user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { viewedAt: "asc" },
      });
      return views.map((v) => ({
        membershipId: v.membership.id,
        name: v.membership.user.name,
        viewedAt: v.viewedAt,
        acknowledgedAt: v.acknowledgedAt,
      }));
    },
  );

  // Explicit "I have read and understood this" acknowledgement for SOPs/docs.
  app.post<{ Params: { attachmentId: string } }>(
    "/attachments/:attachmentId/acknowledge",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const attachment = await prisma.attachment.findFirst({
        where: {
          id: req.params.attachmentId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!attachment) throw notFound("Attachment not found");
      if (attachment.taskId) {
        await getVisibleTask(req.auth, attachment.taskId);
      }

      const now = new Date();
      const view = await prisma.attachmentView.upsert({
        where: {
          attachmentId_membershipId: {
            attachmentId: attachment.id,
            membershipId: req.auth.membershipId,
          },
        },
        create: {
          attachmentId: attachment.id,
          membershipId: req.auth.membershipId,
          acknowledgedAt: now,
        },
        update: { acknowledgedAt: now },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "attachment.acknowledged",
        entityType: "Attachment",
        entityId: attachment.id,
        detail: { taskId: attachment.taskId, fileName: attachment.fileName },
      });
      return reply.status(201).send({
        acknowledgedAt: view.acknowledgedAt,
      });
    },
  );

  app.delete<{ Params: { attachmentId: string } }>(
    "/attachments/:attachmentId",
    { preHandler: app.authenticate },
    async (req) => {
      const attachment = await prisma.attachment.findFirst({
        where: {
          id: req.params.attachmentId,
          organizationId: req.auth.organizationId,
        },
        include: { task: true },
      });
      if (!attachment) throw notFound("Attachment not found");
      const allowed = attachment.task
        ? canManageTask(req.auth, attachment.task)
        : hasPermission(req.auth, "template.manage") || req.auth.isOwner;
      if (!allowed) throw forbidden("You cannot delete this attachment");

      await prisma.attachment.delete({ where: { id: attachment.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "attachment.deleted",
        entityType: "Attachment",
        entityId: attachment.id,
        detail: {
          fileName: attachment.fileName,
          taskId: attachment.taskId,
          templateId: attachment.templateId,
        },
      });
      return { ok: true };
    },
  );
}
