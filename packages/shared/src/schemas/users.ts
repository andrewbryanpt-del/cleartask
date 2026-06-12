import { z } from "zod";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateMemberSchema = z.object({
  roleId: z.string().uuid().nullable().optional(),
  departmentIds: z.array(z.string().uuid()).max(50).optional(),
  locationIds: z.array(z.string().uuid()).max(50).optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
