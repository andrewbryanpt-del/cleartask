import { z } from "zod";

export const createTaskTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  reminderOffsetsMinutes: z
    .array(z.number().int().min(0).max(525_600))
    .max(10)
    .optional(),
});
export type CreateTaskTemplateInput = z.infer<typeof createTaskTemplateSchema>;

export const updateTaskTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  reminderOffsetsMinutes: z
    .array(z.number().int().min(0).max(525_600))
    .max(10)
    .optional(),
});
export type UpdateTaskTemplateInput = z.infer<typeof updateTaskTemplateSchema>;
