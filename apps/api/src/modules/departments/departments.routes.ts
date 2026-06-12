import type { FastifyInstance } from "fastify";
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";

export default async function departmentsRoutes(app: FastifyInstance) {
  app.post(
    "/departments",
    { preHandler: app.requirePermission("org.manage") },
    async (req, reply) => {
      const input = createDepartmentSchema.parse(req.body);
      const location = await prisma.location.findFirst({
        where: {
          id: input.locationId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!location) throw badRequest("Unknown location");

      const department = await prisma.department.create({
        data: {
          organizationId: req.auth.organizationId,
          locationId: location.id,
          name: input.name,
        },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "department.created",
        entityType: "Department",
        entityId: department.id,
        detail: { name: department.name, location: location.name },
      });
      return reply.status(201).send(department);
    },
  );

  app.patch<{ Params: { departmentId: string } }>(
    "/departments/:departmentId",
    { preHandler: app.requirePermission("org.manage") },
    async (req) => {
      const input = updateDepartmentSchema.parse(req.body);
      const department = await prisma.department.findFirst({
        where: {
          id: req.params.departmentId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!department) throw notFound("Department not found");
      const updated = await prisma.department.update({
        where: { id: department.id },
        data: { name: input.name },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "department.updated",
        entityType: "Department",
        entityId: department.id,
        detail: input,
      });
      return updated;
    },
  );

  app.delete<{ Params: { departmentId: string } }>(
    "/departments/:departmentId",
    { preHandler: app.requirePermission("org.manage") },
    async (req) => {
      const department = await prisma.department.findFirst({
        where: {
          id: req.params.departmentId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!department) throw notFound("Department not found");
      await prisma.department.delete({ where: { id: department.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "department.deleted",
        entityType: "Department",
        entityId: department.id,
        detail: { name: department.name },
      });
      return { ok: true };
    },
  );
}
