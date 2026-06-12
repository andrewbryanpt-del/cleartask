import type { FastifyInstance } from "fastify";
import { listAuditQuerySchema } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { withActorNames } from "./audit.service";

export default async function auditRoutes(app: FastifyInstance) {
  app.get(
    "/audit",
    { preHandler: app.requirePermission("audit.view") },
    async (req) => {
      const query = listAuditQuerySchema.parse(req.query);
      const logs = await prisma.auditLog.findMany({
        where: {
          organizationId: req.auth.organizationId,
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.action
            ? { action: { contains: query.action, mode: "insensitive" } }
            : {}),
          ...(query.from || query.to
            ? {
                createdAt: {
                  ...(query.from ? { gte: query.from } : {}),
                  ...(query.to ? { lte: query.to } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const hasMore = logs.length > query.limit;
      const items = await withActorNames(
        hasMore ? logs.slice(0, query.limit) : logs,
      );
      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]!.id : null,
      };
    },
  );
}
