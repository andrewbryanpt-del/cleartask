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
