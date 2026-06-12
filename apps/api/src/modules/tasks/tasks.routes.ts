import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { Prisma } from "@prisma/client";
import {
  PROOF_TYPES,
  addAssigneesSchema,
  createTaskCommentSchema,
  createTaskSchema,
  hasPermission,
  listTasksQuerySchema,
  updateAssignmentStatusSchema,
  updateTaskSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { fileUrl, saveFile } from "../../lib/storage";
import { recordAudit } from "../audit/audit.service";
import {
  enqueueTaskAssigned,
  scheduleTaskReminders,
} from "../../jobs/boss";
import type { AuthContext } from "../../plugins/auth";
import {
  canManageTask,
  expandAssignees,
  getVisibleTask,
  taskDetailInclude,
  type TaskDetail,
} from "./tasks.service";

function serializeTaskDetail(task: TaskDetail, auth: AuthContext) {
  const manager = canManageTask(auth, task);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueAt: task.dueAt,
    reminderOffsetsMinutes: task.reminderOffsetsMinutes,
    location: task.location,
    department: task.department,
    template: task.template,
    createdByMembershipId: task.createdByMembershipId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignments: task.assignments.map((a) => ({
      id: a.id,
      status: a.status,
      completedAt: a.completedAt,
      sourceDepartmentId: a.sourceDepartmentId,
      membership: {
        id: a.membership.id,
        user: {
          id: a.membership.user.id,
          name: a.membership.user.name,
          avatarUrl: fileUrl(a.membership.user.avatarKey),
        },
      },
      proofs: a.proofs.map((p) => ({
        id: p.id,
        type: p.type,
        fileName: p.fileName,
        mimeType: p.mimeType,
        url: fileUrl(p.storageKey),
        createdAt: p.createdAt,
      })),
    })),
    comments: task.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      author: {
        membershipId: c.membership.id,
        name: c.membership.user.name,
        avatarUrl: fileUrl(c.membership.user.avatarKey),
      },
    })),
    attachments: task.attachments.map((att) => ({
      id: att.id,
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      downloadUrl: `/api/v1/attachments/${att.id}/download`,
      viewedByMe: att.views.some((v) => v.membershipId === auth.membershipId),
      viewCount: att.views.length,
      // Who-has-viewed detail is for managers (the training-material check).
      views: manager ? att.views : undefined,
    })),
  };
}

function multipartField(
  file: MultipartFile,
  name: string,
): string | undefined {
  const field = file.fields[name];
  const single = Array.isArray(field) ? field[0] : field;
  return single && "value" in single && typeof single.value === "string"
    ? single.value
    : undefined;
}

export default async function tasksRoutes(app: FastifyInstance) {
  app.post(
    "/tasks",
    { preHandler: app.requirePermission("task.create") },
    async (req, reply) => {
      const input = createTaskSchema.parse(req.body);
      const orgId = req.auth.organizationId;

      const template = input.templateId
        ? await prisma.taskTemplate.findFirst({
            where: { id: input.templateId, organizationId: orgId },
            include: { attachments: true },
          })
        : null;
      if (input.templateId && !template) throw badRequest("Unknown template");

      const department = input.departmentId
        ? await prisma.department.findFirst({
            where: { id: input.departmentId, organizationId: orgId },
          })
        : null;
      if (input.departmentId && !department) {
        throw badRequest("Unknown department");
      }
      // Tasks inherit their location from the department unless set
      // explicitly.
      const locationId = input.locationId ?? department?.locationId;
      if (input.locationId) {
        const location = await prisma.location.findFirst({
          where: { id: input.locationId, organizationId: orgId },
        });
        if (!location) throw badRequest("Unknown location");
      }

      const title = input.title ?? template?.title;
      if (!title) throw badRequest("Either a title or a template is required");

      const targets = await expandAssignees(
        orgId,
        input.assigneeMembershipIds,
        input.assigneeDepartmentIds,
      );

      const task = await prisma.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            organizationId: orgId,
            title,
            description: input.description ?? template?.description,
            dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
            locationId,
            departmentId: input.departmentId,
            templateId: template?.id,
            reminderOffsetsMinutes:
              input.reminderOffsetsMinutes ??
              template?.reminderOffsetsMinutes ??
              [],
            createdByMembershipId: req.auth.membershipId,
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
        // Template attachments are copied per task (same stored file) so
        // view tracking is recorded against this task's copy.
        if (template && template.attachments.length > 0) {
          await tx.attachment.createMany({
            data: template.attachments.map((att) => ({
              organizationId: orgId,
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
        organizationId: orgId,
        actorMembershipId: req.auth.membershipId,
        action: "task.created",
        entityType: "Task",
        entityId: task.id,
        detail: {
          title,
          templateId: template?.id ?? null,
          assigneeCount: targets.length,
        },
      });
      await enqueueTaskAssigned(
        task.id,
        targets.map((t) => t.membershipId),
      );
      await scheduleTaskReminders(task);

      const detail = await getVisibleTask(req.auth, task.id);
      return reply.status(201).send(serializeTaskDetail(detail, req.auth));
    },
  );

  app.get("/tasks", { preHandler: app.authenticate }, async (req) => {
    const query = listTasksQuerySchema.parse(req.query);
    const manager = hasPermission(req.auth, "task.manage");

    const where: Prisma.TaskWhereInput = {
      organizationId: req.auth.organizationId,
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: "insensitive" } }
        : {}),
    };
    if (query.assignedToMe) {
      where.assignments = {
        some: {
          membershipId: req.auth.membershipId,
          ...(query.status ? { status: query.status } : {}),
        },
      };
    } else if (query.status) {
      where.assignments = { some: { status: query.status } };
    }
    // Non-managers only see tasks they created or are assigned to.
    if (!manager) {
      where.OR = [
        { createdByMembershipId: req.auth.membershipId },
        { assignments: { some: { membershipId: req.auth.membershipId } } },
      ];
    }

    const rows = await prisma.task.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        location: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        assignments: {
          select: { id: true, membershipId: true, status: true },
        },
        _count: { select: { comments: true, attachments: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      location: task.location,
      department: task.department,
      createdAt: task.createdAt,
      commentCount: task._count.comments,
      attachmentCount: task._count.attachments,
      assigneeCount: task.assignments.length,
      completedCount: task.assignments.filter((a) => a.status === "COMPLETED")
        .length,
      myStatus:
        task.assignments.find((a) => a.membershipId === req.auth.membershipId)
          ?.status ?? null,
    }));
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    };
  });

  app.get<{ Params: { taskId: string } }>(
    "/tasks/:taskId",
    { preHandler: app.authenticate },
    async (req) => {
      const task = await getVisibleTask(req.auth, req.params.taskId);
      return serializeTaskDetail(task, req.auth);
    },
  );

  app.patch<{ Params: { taskId: string } }>(
    "/tasks/:taskId",
    { preHandler: app.authenticate },
    async (req) => {
      const input = updateTaskSchema.parse(req.body);
      const task = await getVisibleTask(req.auth, req.params.taskId);
      if (!canManageTask(req.auth, task)) {
        throw forbidden("You cannot edit this task");
      }

      const orgId = req.auth.organizationId;
      let locationId = input.locationId;
      if (input.departmentId) {
        const department = await prisma.department.findFirst({
          where: { id: input.departmentId, organizationId: orgId },
        });
        if (!department) throw badRequest("Unknown department");
        locationId = locationId ?? department.locationId;
      }
      if (input.locationId) {
        const location = await prisma.location.findFirst({
          where: { id: input.locationId, organizationId: orgId },
        });
        if (!location) throw badRequest("Unknown location");
      }

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.dueAt !== undefined
            ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
            : {}),
          ...(input.departmentId !== undefined
            ? { departmentId: input.departmentId }
            : {}),
          ...(locationId !== undefined ? { locationId } : {}),
          ...(input.reminderOffsetsMinutes !== undefined
            ? { reminderOffsetsMinutes: input.reminderOffsetsMinutes }
            : {}),
        },
      });
      await recordAudit({
        organizationId: orgId,
        actorMembershipId: req.auth.membershipId,
        action: "task.updated",
        entityType: "Task",
        entityId: task.id,
        detail: input,
      });
      // A new dueAt (or new offsets) schedules a fresh reminder set; jobs
      // from the old schedule see a dueAt mismatch and drop themselves.
      if (
        input.dueAt !== undefined ||
        input.reminderOffsetsMinutes !== undefined
      ) {
        await scheduleTaskReminders(updated);
      }
      const detail = await getVisibleTask(req.auth, task.id);
      return serializeTaskDetail(detail, req.auth);
    },
  );

  app.delete<{ Params: { taskId: string } }>(
    "/tasks/:taskId",
    { preHandler: app.authenticate },
    async (req) => {
      const task = await getVisibleTask(req.auth, req.params.taskId);
      if (!canManageTask(req.auth, task)) {
        throw forbidden("You cannot delete this task");
      }
      await prisma.task.delete({ where: { id: task.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "task.deleted",
        entityType: "Task",
        entityId: task.id,
        detail: { title: task.title },
      });
      return { ok: true };
    },
  );

  // ----- Assignments -----

  app.post<{ Params: { taskId: string } }>(
    "/tasks/:taskId/assignees",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const input = addAssigneesSchema.parse(req.body);
      const task = await getVisibleTask(req.auth, req.params.taskId);
      if (!canManageTask(req.auth, task)) {
        throw forbidden("You cannot assign this task");
      }

      const targets = await expandAssignees(
        req.auth.organizationId,
        input.membershipIds,
        input.departmentIds,
      );
      // skipDuplicates keeps existing assignments (and their status) intact.
      const result = await prisma.taskAssignment.createMany({
        data: targets.map((t) => ({
          taskId: task.id,
          membershipId: t.membershipId,
          sourceDepartmentId: t.sourceDepartmentId,
        })),
        skipDuplicates: true,
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "task.assigned",
        entityType: "Task",
        entityId: task.id,
        detail: { addedCount: result.count },
      });
      // Only people who weren't already assigned get the notification.
      const alreadyAssigned = new Set(
        task.assignments.map((a) => a.membershipId),
      );
      await enqueueTaskAssigned(
        task.id,
        targets
          .map((t) => t.membershipId)
          .filter((id) => !alreadyAssigned.has(id)),
      );
      const detail = await getVisibleTask(req.auth, task.id);
      return reply.status(201).send(serializeTaskDetail(detail, req.auth));
    },
  );

  app.delete<{ Params: { assignmentId: string } }>(
    "/assignments/:assignmentId",
    { preHandler: app.authenticate },
    async (req) => {
      const assignment = await prisma.taskAssignment.findFirst({
        where: {
          id: req.params.assignmentId,
          task: { organizationId: req.auth.organizationId },
        },
        include: { task: true },
      });
      if (!assignment) throw notFound("Assignment not found");
      if (!canManageTask(req.auth, assignment.task)) {
        throw forbidden("You cannot unassign this task");
      }
      await prisma.taskAssignment.delete({ where: { id: assignment.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "task.unassigned",
        entityType: "TaskAssignment",
        entityId: assignment.id,
        detail: {
          taskId: assignment.taskId,
          membershipId: assignment.membershipId,
        },
      });
      return { ok: true };
    },
  );

  app.patch<{ Params: { assignmentId: string } }>(
    "/assignments/:assignmentId/status",
    { preHandler: app.authenticate },
    async (req) => {
      const input = updateAssignmentStatusSchema.parse(req.body);
      const assignment = await prisma.taskAssignment.findFirst({
        where: {
          id: req.params.assignmentId,
          task: { organizationId: req.auth.organizationId },
        },
        include: { task: true },
      });
      if (!assignment) throw notFound("Assignment not found");
      const isAssignee = assignment.membershipId === req.auth.membershipId;
      if (!isAssignee && !canManageTask(req.auth, assignment.task)) {
        throw forbidden("You cannot update this assignment");
      }

      const updated = await prisma.taskAssignment.update({
        where: { id: assignment.id },
        data: {
          status: input.status,
          completedAt: input.status === "COMPLETED" ? new Date() : null,
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "task.status_changed",
        entityType: "TaskAssignment",
        entityId: assignment.id,
        detail: {
          taskId: assignment.taskId,
          from: assignment.status,
          to: input.status,
        },
      });
      return {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt,
      };
    },
  );

  // ----- Proof of completion -----

  app.post<{ Params: { assignmentId: string } }>(
    "/assignments/:assignmentId/proof",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const assignment = await prisma.taskAssignment.findFirst({
        where: {
          id: req.params.assignmentId,
          task: { organizationId: req.auth.organizationId },
        },
      });
      if (!assignment) throw notFound("Assignment not found");
      // Proof is personal evidence — only the assignee can upload it.
      if (assignment.membershipId !== req.auth.membershipId) {
        throw forbidden("Only the assignee can upload proof");
      }

      const file = await req.file();
      if (!file) throw badRequest("No file uploaded");
      const type = multipartField(file, "type");
      if (!type || !(PROOF_TYPES as readonly string[]).includes(type)) {
        throw badRequest(
          `A "type" field is required: ${PROOF_TYPES.join(", ")}`,
        );
      }
      if (
        (type === "PHOTO" || type === "SIGNATURE") &&
        !file.mimetype.startsWith("image/")
      ) {
        throw badRequest(`${type} proof must be an image`);
      }

      const key = await saveFile(await file.toBuffer(), file.filename);
      const proof = await prisma.proofOfCompletion.create({
        data: {
          assignmentId: assignment.id,
          type: type as (typeof PROOF_TYPES)[number],
          storageKey: key,
          fileName: file.filename,
          mimeType: file.mimetype,
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "proof.uploaded",
        entityType: "ProofOfCompletion",
        entityId: proof.id,
        detail: { taskId: assignment.taskId, type },
      });
      return reply.status(201).send({
        id: proof.id,
        type: proof.type,
        fileName: proof.fileName,
        url: fileUrl(proof.storageKey),
        createdAt: proof.createdAt,
      });
    },
  );

  // ----- Comments -----

  app.post<{ Params: { taskId: string } }>(
    "/tasks/:taskId/comments",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const input = createTaskCommentSchema.parse(req.body);
      const task = await getVisibleTask(req.auth, req.params.taskId);

      const comment = await prisma.taskComment.create({
        data: {
          taskId: task.id,
          membershipId: req.auth.membershipId,
          body: input.body,
        },
        include: {
          membership: {
            select: { id: true, user: { select: { name: true, avatarKey: true } } },
          },
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "task.comment_added",
        entityType: "TaskComment",
        entityId: comment.id,
        detail: { taskId: task.id },
      });
      return reply.status(201).send({
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        author: {
          membershipId: comment.membership.id,
          name: comment.membership.user.name,
          avatarUrl: fileUrl(comment.membership.user.avatarKey),
        },
      });
    },
  );

  app.delete<{ Params: { commentId: string } }>(
    "/comments/:commentId",
    { preHandler: app.authenticate },
    async (req) => {
      const comment = await prisma.taskComment.findFirst({
        where: {
          id: req.params.commentId,
          task: { organizationId: req.auth.organizationId },
        },
        include: { task: true },
      });
      if (!comment) throw notFound("Comment not found");
      const isAuthor = comment.membershipId === req.auth.membershipId;
      if (!isAuthor && !canManageTask(req.auth, comment.task)) {
        throw forbidden("You cannot delete this comment");
      }
      await prisma.taskComment.delete({ where: { id: comment.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "task.comment_deleted",
        entityType: "TaskComment",
        entityId: comment.id,
        detail: { taskId: comment.taskId },
      });
      return { ok: true };
    },
  );
}
