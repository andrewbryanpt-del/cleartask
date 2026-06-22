import type { FastifyInstance } from "fastify";
import {
  createAnnouncementSchema,
  hasPermission,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { forbidden, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";

function canManageAnnouncements(auth: {
  isOwner: boolean;
  permissions: ReadonlySet<string>;
}) {
  return auth.isOwner || hasPermission(auth, "announcement.manage");
}

export default async function announcementsRoutes(app: FastifyInstance) {
  app.get("/announcements", { preHandler: app.authenticate }, async (req) => {
    const query = listAnnouncementsQuerySchema.parse(req.query);
    const orgId = req.auth.organizationId;
    const membershipId = req.auth.membershipId;

    const announcements = await prisma.announcement.findMany({
      where: { organizationId: orgId },
      take: query.limit,
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: { user: { select: { name: true } } },
        },
        reads: {
          where: { membershipId },
          select: { readAt: true },
        },
        _count: { select: { reads: true } },
      },
    });

    const items = announcements
      .map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        authorName: a.author?.user.name ?? null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        readByMe: a.reads.length > 0,
        readAt: a.reads[0]?.readAt ?? null,
        readCount: a._count.reads,
      }))
      .filter((a) => (query.unreadOnly ? !a.readByMe : true));

    return { items };
  });

  app.get<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId",
    { preHandler: app.authenticate },
    async (req) => {
      const announcement = await prisma.announcement.findFirst({
        where: {
          id: req.params.announcementId,
          organizationId: req.auth.organizationId,
        },
        include: {
          author: {
            select: { user: { select: { name: true } } },
          },
          reads: {
            where: { membershipId: req.auth.membershipId },
            select: { readAt: true },
          },
        },
      });
      if (!announcement) throw notFound("Announcement not found");

      return {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        authorName: announcement.author?.user.name ?? null,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
        readByMe: announcement.reads.length > 0,
        readAt: announcement.reads[0]?.readAt ?? null,
      };
    },
  );

  app.get<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId/reads",
    { preHandler: app.authenticate },
    async (req) => {
      if (!canManageAnnouncements(req.auth)) {
        throw forbidden("You cannot view announcement read status");
      }
      const announcement = await prisma.announcement.findFirst({
        where: {
          id: req.params.announcementId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!announcement) throw notFound("Announcement not found");

      const [reads, members] = await Promise.all([
        prisma.announcementRead.findMany({
          where: { announcementId: announcement.id },
          include: {
            membership: {
              select: { id: true, user: { select: { name: true } } },
            },
          },
          orderBy: { readAt: "asc" },
        }),
        prisma.membership.findMany({
          where: { organizationId: req.auth.organizationId },
          select: { id: true, user: { select: { name: true } } },
          orderBy: { user: { name: "asc" } },
        }),
      ]);

      const readSet = new Map(
        reads.map((r) => [r.membershipId, r.readAt] as const),
      );
      return {
        read: reads.map((r) => ({
          membershipId: r.membership.id,
          name: r.membership.user.name,
          readAt: r.readAt,
        })),
        unread: members
          .filter((m) => !readSet.has(m.id))
          .map((m) => ({ membershipId: m.id, name: m.user.name })),
      };
    },
  );

  app.post(
    "/announcements",
    { preHandler: app.requirePermission("announcement.manage") },
    async (req, reply) => {
      const input = createAnnouncementSchema.parse(req.body);
      const announcement = await prisma.announcement.create({
        data: {
          organizationId: req.auth.organizationId,
          title: input.title,
          body: input.body,
          createdByMembershipId: req.auth.membershipId,
        },
        include: {
          author: { select: { user: { select: { name: true } } } },
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "announcement.created",
        entityType: "Announcement",
        entityId: announcement.id,
        detail: { title: announcement.title },
      });
      return reply.status(201).send({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        authorName: announcement.author?.user.name ?? null,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
        readByMe: false,
        readAt: null,
      });
    },
  );

  app.patch<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId",
    { preHandler: app.requirePermission("announcement.manage") },
    async (req) => {
      const input = updateAnnouncementSchema.parse(req.body);
      const existing = await prisma.announcement.findFirst({
        where: {
          id: req.params.announcementId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!existing) throw notFound("Announcement not found");

      const announcement = await prisma.announcement.update({
        where: { id: existing.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
        },
        include: {
          author: { select: { user: { select: { name: true } } } },
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "announcement.updated",
        entityType: "Announcement",
        entityId: announcement.id,
        detail: input,
      });
      return {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        authorName: announcement.author?.user.name ?? null,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
      };
    },
  );

  app.delete<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId",
    { preHandler: app.requirePermission("announcement.manage") },
    async (req) => {
      const existing = await prisma.announcement.findFirst({
        where: {
          id: req.params.announcementId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!existing) throw notFound("Announcement not found");

      await prisma.announcement.delete({ where: { id: existing.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "announcement.deleted",
        entityType: "Announcement",
        entityId: existing.id,
        detail: { title: existing.title },
      });
      return { ok: true };
    },
  );

  app.post<{ Params: { announcementId: string } }>(
    "/announcements/:announcementId/read",
    { preHandler: app.authenticate },
    async (req, reply) => {
      const announcement = await prisma.announcement.findFirst({
        where: {
          id: req.params.announcementId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!announcement) throw notFound("Announcement not found");

      const read = await prisma.announcementRead.upsert({
        where: {
          announcementId_membershipId: {
            announcementId: announcement.id,
            membershipId: req.auth.membershipId,
          },
        },
        create: {
          announcementId: announcement.id,
          membershipId: req.auth.membershipId,
        },
        update: {},
      });
      return reply.status(201).send({ readAt: read.readAt });
    },
  );
}
