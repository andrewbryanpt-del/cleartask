import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

// Called from every mutating service action. Append-only; feeds the audit
// trail requirement and the exportable reports.
export async function recordAudit(input: {
  organizationId: string;
  actorMembershipId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  detail?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({ data: input });
}

// Resolves actor display names for audit rows. actorMembershipId has no FK
// (rows outlive members), so removed members resolve to null → "System"/
// "Removed member" presentation is the caller's choice.
export async function withActorNames<
  T extends { actorMembershipId: string | null },
>(logs: T[]): Promise<(T & { actorName: string | null })[]> {
  const ids = [
    ...new Set(
      logs
        .map((l) => l.actorMembershipId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const memberships =
    ids.length > 0
      ? await prisma.membership.findMany({
          where: { id: { in: ids } },
          select: { id: true, user: { select: { name: true } } },
        })
      : [];
  const names = new Map(memberships.map((m) => [m.id, m.user.name]));
  return logs.map((l) => ({
    ...l,
    actorName: l.actorMembershipId
      ? (names.get(l.actorMembershipId) ?? null)
      : null,
  }));
}
