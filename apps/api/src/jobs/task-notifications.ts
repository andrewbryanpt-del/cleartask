import { prisma } from "../lib/prisma";
import { notifyMemberships } from "../modules/notifications/notifications.service";

export interface TaskAssignedPayload {
  taskId: string;
  membershipIds: string[];
}

export async function handleTaskAssigned(
  payload: TaskAssignedPayload,
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: payload.taskId },
  });
  if (!task) return; // deleted before the job ran

  await notifyMemberships(payload.membershipIds, {
    organizationId: task.organizationId,
    type: "task.assigned",
    title: `New task: ${task.title}`,
    body: task.dueAt
      ? `You have been assigned "${task.title}", due ${task.dueAt.toUTCString()}.`
      : `You have been assigned "${task.title}".`,
    taskId: task.id,
  });
}

export interface TaskReminderPayload {
  taskId: string;
  offsetMinutes: number;
  // dueAt at the time the reminder was scheduled. If the task has since
  // been rescheduled this job is stale (a fresh set was scheduled) and
  // must do nothing.
  dueAtIso: string;
}

export async function handleTaskReminder(
  payload: TaskReminderPayload,
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: payload.taskId },
    include: { assignments: { select: { membershipId: true, status: true } } },
  });
  if (!task?.dueAt) return;
  if (task.dueAt.toISOString() !== payload.dueAtIso) return;

  const pending = task.assignments
    .filter((a) => a.status !== "COMPLETED")
    .map((a) => a.membershipId);
  await notifyMemberships(pending, {
    organizationId: task.organizationId,
    type: "task.reminder",
    title: `Reminder: ${task.title}`,
    body: `"${task.title}" is due ${task.dueAt.toUTCString()}.`,
    taskId: task.id,
  });
}
