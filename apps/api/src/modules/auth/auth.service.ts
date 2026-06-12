import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/password";
import { generateToken, hashToken } from "../../lib/tokens";
import { conflict, unauthorized } from "../../lib/errors";
import { recordAudit } from "../audit/audit.service";
import type { RegisterInput } from "@task-tracker/shared";

export async function registerAccount(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) throw conflict("An account with this email already exists");

  const passwordHash = await hashPassword(input.password);

  const { user, organization } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    });
    const organization = await tx.organization.create({
      data: {
        name: input.businessName,
        industry: input.industry,
        // A starter location so departments can be created immediately;
        // rename or add more under Settings → Locations.
        locations: { create: { name: "Head Office" } },
      },
    });
    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        isOwner: true,
      },
    });
    return { user, organization };
  });

  await recordAudit({
    organizationId: organization.id,
    action: "organization.created",
    entityType: "Organization",
    entityId: organization.id,
    detail: { name: organization.name },
  });

  return { user, organization };
}

export async function createRefreshToken(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

// Rotation: each refresh token is single-use. The presented token is
// revoked and a new one issued; a revoked or unknown token is rejected.
export async function rotateRefreshToken(token: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw unauthorized("Invalid or expired refresh token");
  }
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  const next = await createRefreshToken(record.userId);
  return { userId: record.userId, ...next };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
