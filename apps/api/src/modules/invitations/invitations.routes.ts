import type { FastifyInstance } from "fastify";
import {
  acceptInvitationSchema,
  createInvitationSchema,
} from "@task-tracker/shared";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { badRequest, conflict, notFound, unauthorized } from "../../lib/errors";
import { hashPassword, verifyPassword } from "../../lib/password";
import { generateToken, hashToken } from "../../lib/tokens";
import { sendMail } from "../../lib/mailer";
import { invitationEmail } from "../../lib/email-templates";
import { recordAudit } from "../audit/audit.service";

const INVITE_TTL_DAYS = 7;

export default async function invitationsRoutes(app: FastifyInstance) {
  app.get(
    "/invitations",
    { preHandler: app.requirePermission("member.invite") },
    async (req) => {
      return prisma.invitation.findMany({
        where: { organizationId: req.auth.organizationId, status: "PENDING" },
        select: {
          id: true,
          email: true,
          role: { select: { id: true, name: true } },
          expiresAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post(
    "/invitations",
    { preHandler: app.requirePermission("member.invite") },
    async (req, reply) => {
      const input = createInvitationSchema.parse(req.body);

      const [role, existingMember] = await Promise.all([
        prisma.role.findFirst({
          where: { id: input.roleId, organizationId: req.auth.organizationId },
        }),
        prisma.membership.findFirst({
          where: {
            organizationId: req.auth.organizationId,
            user: { email: input.email },
          },
        }),
      ]);
      if (!role) throw badRequest("Unknown role");
      if (existingMember) {
        throw conflict("This person is already a member of the organisation");
      }

      const token = generateToken();
      const invitation = await prisma.invitation.create({
        data: {
          organizationId: req.auth.organizationId,
          email: input.email,
          roleId: input.roleId,
          departmentIds: input.departmentIds,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
          invitedByMembershipId: req.auth.membershipId,
        },
        include: { organization: { select: { name: true } } },
      });

      const inviteUrl = `${env.WEB_ORIGIN}/invite/${token}`;
      const email = invitationEmail({
        organizationName: invitation.organization.name,
        roleName: role.name,
        inviteUrl,
        expiresDays: INVITE_TTL_DAYS,
      });
      await sendMail({ to: input.email, ...email });

      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "invitation.sent",
        entityType: "Invitation",
        entityId: invitation.id,
        detail: { email: input.email, role: role.name },
      });
      return reply.status(201).send({
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      });
    },
  );

  app.delete<{ Params: { invitationId: string } }>(
    "/invitations/:invitationId",
    { preHandler: app.requirePermission("member.invite") },
    async (req) => {
      const invitation = await prisma.invitation.findFirst({
        where: {
          id: req.params.invitationId,
          organizationId: req.auth.organizationId,
          status: "PENDING",
        },
      });
      if (!invitation) throw notFound("Invitation not found");
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "REVOKED" },
      });
      return { ok: true };
    },
  );

  // Public: lets the invite landing page show who the invite is for and
  // whether the email already has an account (login vs sign-up form).
  app.get<{ Querystring: { token?: string } }>(
    "/invitations/info",
    async (req) => {
      if (!req.query.token) throw badRequest("Missing token");
      const invitation = await findPendingInvitation(req.query.token);
      const existingUser = await prisma.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      return {
        email: invitation.email,
        organizationName: invitation.organization.name,
        roleName: invitation.role?.name ?? null,
        accountExists: Boolean(existingUser),
      };
    },
  );

  // Public. Three paths: new email → name+password creates the account;
  // existing account → password verifies it; or the request is already
  // authenticated as the invited user.
  app.post("/invitations/accept", async (req, reply) => {
    const input = acceptInvitationSchema.parse(req.body);
    const invitation = await findPendingInvitation(input.token);

    let user = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (user) {
      const authedAsInvitee = await isAuthenticatedAs(req, user.id);
      if (!authedAsInvitee) {
        if (!input.password) {
          throw unauthorized(
            "An account with this email exists — provide its password to accept",
          );
        }
        if (!(await verifyPassword(user.passwordHash, input.password))) {
          throw unauthorized("Incorrect password");
        }
      }
    } else {
      if (!input.name || !input.password) {
        throw badRequest("Name and password are required to create your account");
      }
      user = await prisma.user.create({
        data: {
          email: invitation.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        },
      });
    }

    const departments = await prisma.department.findMany({
      where: {
        id: { in: invitation.departmentIds },
        organizationId: invitation.organizationId,
      },
      select: { id: true },
    });

    const membership = await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: invitation.organizationId,
          roleId: invitation.roleId,
          departments: { connect: departments },
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      return membership;
    });

    await recordAudit({
      organizationId: invitation.organizationId,
      actorMembershipId: membership.id,
      action: "invitation.accepted",
      entityType: "Membership",
      entityId: membership.id,
      detail: { email: invitation.email },
    });
    return reply.status(201).send({
      ok: true,
      organizationId: invitation.organizationId,
    });
  });

  async function findPendingInvitation(token: string) {
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        organization: { select: { name: true } },
        role: { select: { name: true } },
      },
    });
    if (
      !invitation ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt < new Date()
    ) {
      throw notFound("This invitation is invalid or has expired");
    }
    return invitation;
  }

  async function isAuthenticatedAs(
    req: Parameters<typeof app.authenticate>[0],
    userId: string,
  ): Promise<boolean> {
    if (!req.headers.authorization) return false;
    try {
      await req.jwtVerify();
      return req.user.sub === userId;
    } catch {
      return false;
    }
  }
}
