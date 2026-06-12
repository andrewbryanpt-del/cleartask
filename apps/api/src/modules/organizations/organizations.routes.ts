import type { FastifyInstance } from "fastify";
import {
  updateMemberSchema,
  updateOrganizationSchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { fileUrl, saveFile } from "../../lib/storage";
import { recordAudit } from "../audit/audit.service";

export default async function organizationsRoutes(app: FastifyInstance) {
  app.get("/organization", { preHandler: app.authenticate }, async (req) => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: req.auth.organizationId },
      include: {
        locations: {
          include: { departments: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return { ...org, logoKey: undefined, logoUrl: fileUrl(org.logoKey) };
  });

  // Business details and logo are the account owner's alone — invited
  // members can't edit them whatever their role grants (org.manage still
  // covers locations and departments).
  app.patch(
    "/organization",
    { preHandler: app.requireOwner },
    async (req) => {
      const input = updateOrganizationSchema.parse(req.body);
      const org = await prisma.organization.update({
        where: { id: req.auth.organizationId },
        data: input,
      });
      await recordAudit({
        organizationId: org.id,
        actorMembershipId: req.auth.membershipId,
        action: "organization.updated",
        entityType: "Organization",
        entityId: org.id,
        detail: input,
      });
      return {
        id: org.id,
        name: org.name,
        industry: org.industry,
        address: org.address,
        phone: org.phone,
        website: org.website,
      };
    },
  );

  // Marks the owner's setup wizard as finished; idempotent.
  app.post(
    "/organization/complete-onboarding",
    { preHandler: app.requireOwner },
    async (req) => {
      const org = await prisma.organization.findUniqueOrThrow({
        where: { id: req.auth.organizationId },
      });
      if (!org.onboardedAt) {
        await prisma.organization.update({
          where: { id: org.id },
          data: { onboardedAt: new Date() },
        });
        await recordAudit({
          organizationId: org.id,
          actorMembershipId: req.auth.membershipId,
          action: "organization.onboarded",
          entityType: "Organization",
          entityId: org.id,
        });
      }
      return { ok: true };
    },
  );

  app.post(
    "/organization/logo",
    { preHandler: app.requireOwner },
    async (req) => {
      const file = await req.file();
      if (!file) throw badRequest("No file uploaded");
      if (!file.mimetype.startsWith("image/")) {
        throw badRequest("Logo must be an image");
      }
      const key = await saveFile(await file.toBuffer(), file.filename);
      await prisma.organization.update({
        where: { id: req.auth.organizationId },
        data: { logoKey: key },
      });
      return { logoUrl: fileUrl(key) };
    },
  );

  app.get("/members", { preHandler: app.authenticate }, async (req) => {
    const members = await prisma.membership.findMany({
      where: { organizationId: req.auth.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarKey: true } },
        role: { select: { id: true, name: true } },
        departments: { select: { id: true, name: true, locationId: true } },
        locations: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return members.map((m) => ({
      membershipId: m.id,
      isOwner: m.isOwner,
      role: m.role,
      departments: m.departments,
      locations: m.locations,
      user: {
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: fileUrl(m.user.avatarKey),
      },
    }));
  });

  app.patch<{ Params: { membershipId: string } }>(
    "/members/:membershipId",
    { preHandler: app.requirePermission("member.manage") },
    async (req) => {
      const input = updateMemberSchema.parse(req.body);
      const membership = await prisma.membership.findFirst({
        where: {
          id: req.params.membershipId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!membership) throw notFound("Member not found");
      if (membership.isOwner && input.roleId !== undefined) {
        throw forbidden("The owner's role cannot be changed");
      }

      const updated = await prisma.membership.update({
        where: { id: membership.id },
        data: {
          ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
          ...(input.departmentIds
            ? { departments: { set: input.departmentIds.map((id) => ({ id })) } }
            : {}),
          ...(input.locationIds
            ? { locations: { set: input.locationIds.map((id) => ({ id })) } }
            : {}),
        },
        include: { departments: true, locations: true, role: true },
      });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "member.updated",
        entityType: "Membership",
        entityId: membership.id,
        detail: input,
      });
      return updated;
    },
  );

  app.delete<{ Params: { membershipId: string } }>(
    "/members/:membershipId",
    { preHandler: app.requirePermission("member.manage") },
    async (req) => {
      const membership = await prisma.membership.findFirst({
        where: {
          id: req.params.membershipId,
          organizationId: req.auth.organizationId,
        },
      });
      if (!membership) throw notFound("Member not found");
      if (membership.isOwner) throw forbidden("The owner cannot be removed");

      await prisma.membership.delete({ where: { id: membership.id } });
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "member.removed",
        entityType: "Membership",
        entityId: membership.id,
      });
      return { ok: true };
    },
  );
}
