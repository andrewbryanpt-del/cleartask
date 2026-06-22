import { z } from "zod";

export const TASK_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type TaskStatusValue = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;
export type TaskPriorityValue = (typeof TASK_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriorityValue, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
};

export const PROOF_TYPES = ["PHOTO", "DOCUMENT", "SIGNATURE"] as const;
export type ProofTypeValue = (typeof PROOF_TYPES)[number];

const isoDateTime = z.string().datetime({ offset: true });

// Reminder offsets are minutes before dueAt (7 days = 10080). Capped at one
// year out and ten reminders per task.
const reminderOffsets = z
  .array(z.number().int().min(0).max(525_600))
  .max(10);

const taskRecurrenceSchema = z.object({
  rrule: z.string().trim().min(1).max(500),
  timezone: z.string().trim().min(1).max(64).optional(),
});

export const createTaskSchema = z
  .object({
    // Title may be omitted when templateId supplies it.
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    dueAt: isoDateTime.optional(),
    locationId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    reminderOffsetsMinutes: reminderOffsets.optional(),
    assigneeMembershipIds: z.array(z.string().uuid()).max(200).default([]),
    assigneeDepartmentIds: z.array(z.string().uuid()).max(50).default([]),
    recurrence: taskRecurrenceSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.templateId !== undefined, {
    message: "Either a title or a template is required",
    path: ["title"],
  })
  .refine((v) => !v.recurrence || v.dueAt !== undefined, {
    message: "A due date is required for recurring tasks",
    path: ["dueAt"],
  })
  .refine(
    (v) =>
      !v.recurrence ||
      v.assigneeMembershipIds.length > 0 ||
      v.assigneeDepartmentIds.length > 0,
    {
      message: "At least one assignee or department is required for recurring tasks",
      path: ["assigneeMembershipIds"],
    },
  );
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type TaskRecurrenceInput = z.infer<typeof taskRecurrenceSchema>;

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  dueAt: isoDateTime.nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  reminderOffsetsMinutes: reminderOffsets.optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  locationId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  assignedToMe: z.coerce.boolean().optional(),
  search: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const addAssigneesSchema = z
  .object({
    membershipIds: z.array(z.string().uuid()).max(200).default([]),
    departmentIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine((v) => v.membershipIds.length > 0 || v.departmentIds.length > 0, {
    message: "At least one assignee or department is required",
  });
export type AddAssigneesInput = z.infer<typeof addAssigneesSchema>;

export const updateAssignmentStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
});
export type UpdateAssignmentStatusInput = z.infer<
  typeof updateAssignmentStatusSchema
>;

export const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateTaskCommentInput = z.infer<typeof createTaskCommentSchema>;
