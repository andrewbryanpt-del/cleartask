import { z } from "zod";

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
});
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

export const listAnnouncementsQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
