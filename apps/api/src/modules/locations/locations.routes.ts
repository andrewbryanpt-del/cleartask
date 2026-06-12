import type { FastifyInstance } from "fastify";
import { createLocationSchema, updateLocationSchema } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { conflict, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";

export default async function locationsRoutes(app: FastifyInstance) {
  app.get("/locations", { preHandler: app.authenticate }, async (req) => {
    return prisma.location.findMany({
      where: { organizationId: req.auth.organizationId },
      include: { departments: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  });

  app.post(
    "/locations",
    { preHandler: app.requirePermission("org.manage") },
    async (req, reply) => {
      const input = createLocationSchema.parse(req.body);
      const location = await prisma.location.create({
        data: { ...input, organizationId: req.auth.organizationId },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "location.created",
        entityType: "Location",
        entityId: location.id,
        detail: { name: location.name },
      });
      return reply.status(201).send(location);
    },
  );

  app.patch<{ Params: { locationId: string } }>(
    "/locations/:locationId",
    { preHandler: app.requirePermission("org.manage") },
    async (req) => {
      const input = updateLocationSchema.parse(req.body);
      const location = await prisma.location.findFirst({
        where: {
          id: req.params.locationId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!location) throw notFound("Location not found");
      const updated = await prisma.location.update({
        where: { id: location.id },
        data: input,
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "location.updated",
        entityType: "Location",
        entityId: location.id,
        detail: input,
      });
      return updated;
    },
  );

  app.delete<{ Params: { locationId: string } }>(
    "/locations/:locationId",
    { preHandler: app.requirePermission("org.manage") },
    async (req) => {
      const location = await prisma.location.findFirst({
        where: {
          id: req.params.locationId,
          organizationId: req.auth.organizationId,
        },
        include: { _count: { select: { departments: true } } },
      });
      if (!location) throw notFound("Location not found");
      if (location._count.departments > 0) {
        throw conflict(
          "This location still has departments — delete or move them first",
        );
      }
      await prisma.location.delete({ where: { id: location.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "location.deleted",
        entityType: "Location",
        entityId: location.id,
        detail: { name: location.name },
      });
      return { ok: true };
    },
  );
}
