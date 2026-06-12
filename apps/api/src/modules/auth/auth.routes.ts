import type { FastifyInstance } from "fastify";
import { loginSchema, refreshSchema, registerSchema } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { verifyPassword } from "../../lib/password";
import { unauthorized } from "../../lib/errors";
import { fileUrl } from "../../lib/storage";
import {
  createRefreshToken,
  registerAccount,
  revokeRefreshToken,
  rotateRefreshToken,
} from "./auth.service";

async function sessionPayload(app: FastifyInstance, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: {
        include: { organization: true, role: { include: { permissions: true } } },
      },
    },
  });
  const { token: refreshToken } = await createRefreshToken(user.id);
  return {
    accessToken: app.jwt.sign({ sub: user.id }),
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: fileUrl(user.avatarKey),
    },
    organizations: user.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organization.name,
      industry: m.organization.industry,
      logoUrl: fileUrl(m.organization.logoKey),
      onboarded: Boolean(m.organization.onboardedAt),
      membershipId: m.id,
      isOwner: m.isOwner,
      roleName: m.role?.name ?? null,
      permissions: m.role?.permissions.map((p) => p.permission) ?? [],
    })),
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const { user } = await registerAccount(input);
    return reply.status(201).send(await sessionPayload(app, user.id));
  });

  app.post("/login", async (req) => {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      throw unauthorized("Incorrect email or password");
    }
    return sessionPayload(app, user.id);
  });

  app.post("/refresh", async (req) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const rotated = await rotateRefreshToken(refreshToken);
    return {
      accessToken: app.jwt.sign({ sub: rotated.userId }),
      refreshToken: rotated.token,
    };
  });

  app.post("/logout", async (req) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await revokeRefreshToken(refreshToken);
    return { ok: true };
  });
}
