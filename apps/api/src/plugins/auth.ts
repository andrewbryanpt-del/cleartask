import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission } from "@task-tracker/shared";
import { hasPermission } from "@task-tracker/shared";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/errors";

export interface AuthContext {
  userId: string;
  membershipId: string;
  organizationId: string;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
}

type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyInstance {
    authenticate: Handler;
    requirePermission(permission: Permission): Handler[];
    // Owner-only routes: stricter than any permission — invited members
    // are rejected regardless of their role's grants.
    requireOwner: Handler[];
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

// Access tokens carry only the user id. Org membership and permissions are
// resolved fresh on every request so role changes apply immediately. Users
// in several organizations select one via the x-organization-id header.
export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL },
  });

  app.decorate("authenticate", async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized("Invalid or expired access token");
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.sub },
      include: { role: { include: { permissions: true } } },
    });
    if (memberships.length === 0) {
      throw unauthorized("You are not a member of any organisation");
    }

    const orgHeader = req.headers["x-organization-id"];
    const membership =
      typeof orgHeader === "string"
        ? memberships.find((m) => m.organizationId === orgHeader)
        : memberships[0];
    if (!membership) throw forbidden("Not a member of this organisation");

    req.auth = {
      userId: req.user.sub,
      membershipId: membership.id,
      organizationId: membership.organizationId,
      isOwner: membership.isOwner,
      permissions: new Set(
        membership.role?.permissions.map((p) => p.permission) ?? [],
      ),
    };
  });

  app.decorate("requirePermission", (permission: Permission) => [
    app.authenticate,
    async (req: FastifyRequest) => {
      if (!hasPermission(req.auth, permission)) {
        throw forbidden(`Missing permission: ${permission}`);
      }
    },
  ]);

  app.decorate("requireOwner", [
    app.authenticate,
    async (req: FastifyRequest) => {
      if (!req.auth.isOwner) {
        throw forbidden("Only the account owner can do this");
      }
    },
  ]);
});
