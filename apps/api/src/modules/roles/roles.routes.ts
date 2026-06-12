import type { FastifyInstance } from "fastify";
import { createRoleSchema, updateRoleSchema } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { conflict, notFound } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";

export default async function rolesRoutes(app: FastifyInstance) {
  // Listing is open to any member — invite and member-management screens
  // need it; creating/editing requires role.manage.
  app.get("/roles", { preHandler: app.authenticate }, async (req) => {
    const roles = await prisma.role.findMany({
      where: { organizationId: req.auth.organizationId },
      include: {
        permissions: true,
        _count: { select: { memberships: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions.map((p) => p.permission),
      memberCount: r._count.memberships,
    }));
  });

  app.post(
    "/roles",
    { preHandler: app.requirePermission("role.manage") },
    async (req, reply) => {
      const input = createRoleSchema.parse(req.body);
      const existing = await prisma.role.findUnique({
        where: {
          organizationId_name: {
            organizationId: req.auth.organizationId,
            name: input.name,
          },
        },
      });
      if (existing) throw conflict("A role with this name already exists");

      const role = await prisma.role.create({
        data: {
          organizationId: req.auth.organizationId,
          name: input.name,
          description: input.description,
          permissions: {
            create: input.permissions.map((permission) => ({ permission })),
          },
        },
        include: { permissions: true },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "role.created",
        entityType: "Role",
        entityId: role.id,
        detail: { name: input.name, permissions: input.permissions },
      });
      return reply.status(201).send({
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions.map((p) => p.permission),
      });
    },
  );

  app.patch<{ Params: { roleId: string } }>(
    "/roles/:roleId",
    { preHandler: app.requirePermission("role.manage") },
    async (req) => {
      const input = updateRoleSchema.parse(req.body);
      const role = await prisma.role.findFirst({
        where: { id: req.params.roleId, organizationId: req.auth.organizationId },
      });
      if (!role) throw notFound("Role not found");

      const updated = await prisma.$transaction(async (tx) => {
        if (input.permissions) {
          await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
          await tx.rolePermission.createMany({
            data: input.permissions.map((permission) => ({
              roleId: role.id,
              permission,
            })),
          });
        }
        return tx.role.update({
          where: { id: role.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
          },
          include: { permissions: true },
        });
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "role.updated",
        entityType: "Role",
        entityId: role.id,
        detail: input,
      });
      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        permissions: updated.permissions.map((p) => p.permission),
      };
    },
  );

  app.delete<{ Params: { roleId: string } }>(
    "/roles/:roleId",
    { preHandler: app.requirePermission("role.manage") },
    async (req) => {
      const role = await prisma.role.findFirst({
        where: { id: req.params.roleId, organizationId: req.auth.organizationId },
        include: { _count: { select: { memberships: true } } },
      });
      if (!role) throw notFound("Role not found");
      if (role._count.memberships > 0) {
        throw conflict(
          "This role is assigned to members — reassign them before deleting it",
        );
      }
      await prisma.role.delete({ where: { id: role.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "role.deleted",
        entityType: "Role",
        entityId: role.id,
        detail: { name: role.name },
      });
      return { ok: true };
    },
  );
}
