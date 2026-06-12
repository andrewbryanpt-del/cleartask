import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "task.assigned",
  "task.reminder",
  "task.overdue",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
