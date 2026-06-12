import { z } from "zod";
import { ALL_PERMISSIONS } from "../permissions/index";

const permissionEnum = z.enum(ALL_PERMISSIONS);

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(permissionEnum).max(ALL_PERMISSIONS.length),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
