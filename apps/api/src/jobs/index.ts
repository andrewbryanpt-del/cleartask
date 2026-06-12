import PgBoss from "pg-boss";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env";
import { QUEUES, getBoss, setBoss } from "./boss";
import {
  handleTaskAssigned,
  handleTaskReminder,
  type TaskAssignedPayload,
  type TaskReminderPayload,
} from "./task-notifications";
import { materializeDueRules } from "./recurrence";
import { sweepOverdue } from "./overdue";

export { enqueueTaskAssigned, scheduleTaskReminders } from "./boss";

// pg-boss stores jobs and cron schedules in Postgres itself — no extra
// infrastructure. Started from server.ts after the HTTP listener is up.
export async function startJobs(log: FastifyBaseLogger): Promise<void> {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) => log.error(err, "pg-boss error"));
  await boss.start();

  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name);
  }

  await boss.work<TaskAssignedPayload>(QUEUES.taskAssigned, async (jobs) => {
    for (const job of jobs) await handleTaskAssigned(job.data);
  });
  await boss.work<TaskReminderPayload>(QUEUES.taskReminder, async (jobs) => {
    for (const job of jobs) await handleTaskReminder(job.data);
  });
  await boss.work(QUEUES.recurrenceMaterialize, async () => {
    await materializeDueRules();
  });
  await boss.work(QUEUES.overdueSweep, async () => {
    await sweepOverdue();
  });

  await boss.schedule(QUEUES.recurrenceMaterialize, "*/5 * * * *");
  await boss.schedule(QUEUES.overdueSweep, "*/5 * * * *");

  setBoss(boss);
  log.info("background jobs started (recurrence, reminders, overdue sweep)");
}

export async function stopJobs(): Promise<void> {
  const boss = getBoss();
  if (boss) {
    setBoss(null);
    await boss.stop();
  }
}
