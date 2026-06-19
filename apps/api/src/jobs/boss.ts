import type PgBoss from "pg-boss";
import { reminderTimes } from "../lib/recurrence";

export const QUEUES = {
  taskAssigned: "task-assigned",
  taskReminder: "task-reminder",
  recurrenceMaterialize: "recurrence-materialize",
  overdueSweep: "overdue-sweep",
  escalationSweep: "escalation-sweep",
} as const;

// Singleton set by startJobs() in jobs/index.ts. The enqueue helpers no-op
// when jobs aren't running (unit tests, one-off scripts) — the API process
// always starts them in server.ts.
let boss: PgBoss | null = null;

export function setBoss(instance: PgBoss | null): void {
  boss = instance;
}

export function getBoss(): PgBoss | null {
  return boss;
}

export async function enqueueTaskAssigned(
  taskId: string,
  membershipIds: string[],
): Promise<void> {
  if (!boss || membershipIds.length === 0) return;
  await boss.send(QUEUES.taskAssigned, { taskId, membershipIds });
}

// Reminder jobs carry the dueAt they were scheduled against; the worker
// drops stale jobs after a reschedule, so old jobs never need cancelling.
export async function scheduleTaskReminders(task: {
  id: string;
  dueAt: Date | null;
  reminderOffsetsMinutes: number[];
}): Promise<void> {
  if (!boss || !task.dueAt) return;
  for (const reminder of reminderTimes(
    task.dueAt,
    task.reminderOffsetsMinutes,
    new Date(),
  )) {
    await boss.send(
      QUEUES.taskReminder,
      {
        taskId: task.id,
        offsetMinutes: reminder.offsetMinutes,
        dueAtIso: task.dueAt.toISOString(),
      },
      { startAfter: reminder.at },
    );
  }
}
