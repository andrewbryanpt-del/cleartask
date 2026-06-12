import type { FastifyInstance } from "fastify";
import { listNotificationsQuerySchema } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { notFound } from "../../lib/errors";

export default async function notificationsRoutes(app: FastifyInstance) {
  app.get(
    "/notifications",
    { preHandler: app.authenticate },
    async (req) => {
      const query = listNotificationsQuerySchema.parse(req.query);
      const where = {
        membershipId: req.auth.membershipId,
        ...(query.unreadOnly ? { readAt: null } : {}),
      };

      const [rows, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          take: query.limit + 1,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }),
        prisma.notification.count({
          where: { membershipId: req.auth.membershipId, readAt: null },
        }),
      ]);

      const hasMore = rows.length > query.limit;
      const items = rows.slice(0, query.limit);
      return {
        items,
        unreadCount,
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      };
    },
  );

  app.post<{ Params: { notificationId: string } }>(
    "/notifications/:notificationId/read",
    { preHandler: app.authenticate },
    async (req) => {
      const notification = await prisma.notification.findFirst({
        where: {
          id: req.params.notificationId,
          membershipId: req.auth.membershipId,
        },
      });
      if (!notification) throw notFound("Notification not found");
      const updated = await prisma.notification.update({
        where: { id: notification.id },
        data: { readAt: notification.readAt ?? new Date() },
      });
      return { id: updated.id, readAt: updated.readAt };
    },
  );

  app.post(
    "/notifications/read-all",
    { preHandler: app.authenticate },
    async (req) => {
      const result = await prisma.notification.updateMany({
        where: { membershipId: req.auth.membershipId, readAt: null },
        data: { readAt: new Date() },
      });
      return { markedRead: result.count };
    },
  );
}
