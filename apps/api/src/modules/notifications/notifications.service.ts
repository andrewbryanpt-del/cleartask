import type { NotificationType } from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { sendMail } from "../../lib/mailer";
import { sendPushToMembership } from "../../lib/push";
import {
  taskAssignedEmail,
  taskEscalationEmail,
  taskOverdueEmail,
  taskReminderEmail,
} from "../../lib/email-templates";

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
  /** Used for manager overdue emails */
  assigneeName?: string;
  /** Used for owner escalation emails */
  departmentName?: string;
  daysOverdue?: number;
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

    const email = await buildNotificationEmail(input);
    if (email) {
      await sendMail({ to: membership.user.email, ...email });
    }
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

async function buildNotificationEmail(input: {
  type: NotificationType;
  title: string;
  body?: string;
  taskId?: string;
  assigneeName?: string;
  departmentName?: string;
  daysOverdue?: number;
}): Promise<{ subject: string; text: string; html?: string } | null> {
  if (!input.taskId) {
    return input.body ? { subject: input.title, text: input.body } : null;
  }

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: { id: true, title: true, dueAt: true },
  });
  if (!task) return null;

  switch (input.type) {
    case "task.assigned":
      return taskAssignedEmail({
        taskTitle: task.title,
        dueAt: task.dueAt,
        taskId: task.id,
      });
    case "task.reminder":
      if (!task.dueAt) return null;
      return taskReminderEmail({
        taskTitle: task.title,
        dueAt: task.dueAt,
        taskId: task.id,
      });
    case "task.overdue":
      if (!task.dueAt) return null;
      return taskOverdueEmail({
        taskTitle: task.title,
        dueAt: task.dueAt,
        taskId: task.id,
        forManager: input.title.startsWith("Overdue in your team:"),
        assigneeName: input.assigneeName,
      });
    case "task.escalation":
      if (input.daysOverdue === undefined || !input.assigneeName) return null;
      return taskEscalationEmail({
        taskTitle: task.title,
        assigneeName: input.assigneeName,
        departmentName: input.departmentName,
        daysOverdue: input.daysOverdue,
        taskId: task.id,
      });
    default:
      return input.body ? { subject: input.title, text: input.body } : null;
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
