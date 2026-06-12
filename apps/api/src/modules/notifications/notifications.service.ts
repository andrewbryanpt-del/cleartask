import type { NotificationType } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { sendMail } from "../../lib/mailer";
import { sendPushToMembership } from "../../lib/push";

// In-app + email + push fan-out. The Notification row is the source of
// truth for the inbox; email and push are best-effort and must never fail
// the calling job.
export async function notifyMembership(input: {
  organizationId: string;
  membershipId: string;
  type: NotificationType;
  title: string;
  body?: string;
  taskId?: string;
}): Promise<void> {
  await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      type: input.type,
      title: input.title,
      body: input.body,
      taskId: input.taskId,
    },
  });

  try {
    const membership = await prisma.membership.findUnique({
      where: { id: input.membershipId },
      include: { user: { select: { email: true } } },
    });
    if (!membership) return;
    await sendMail({
      to: membership.user.email,
      subject: input.title,
      text: input.body ?? input.title,
    });
  } catch (err) {
    console.error(
      `[notifications] email delivery failed for membership ${input.membershipId}:`,
      err,
    );
  }

  try {
    await sendPushToMembership(input.membershipId, {
      type: input.type,
      title: input.title,
      body: input.body,
      taskId: input.taskId,
    });
  } catch (err) {
    console.error(
      `[notifications] push delivery failed for membership ${input.membershipId}:`,
      err,
    );
  }
}

export async function notifyMemberships(
  membershipIds: string[],
  input: {
    organizationId: string;
    type: NotificationType;
    title: string;
    body?: string;
    taskId?: string;
  },
): Promise<void> {
  for (const membershipId of new Set(membershipIds)) {
    await notifyMembership({ ...input, membershipId });
  }
}
