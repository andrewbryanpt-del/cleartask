import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma";

export default async function auditRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { cursor?: string; limit?: string } }>(
    "/audit",
    { preHandler: app.requirePermission("audit.view") },
    async (req) => {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const logs = await prisma.auditLog.findMany({
        where: { organizationId: req.auth.organizationId },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(req.query.cursor
          ? { cursor: { id: req.query.cursor }, skip: 1 }
          : {}),
      });
      const hasMore = logs.length > limit;
      const items = hasMore ? logs.slice(0, limit) : logs;
      return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
    },
  );
}
