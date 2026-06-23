import { z } from "zod";
import { newPasswordSchema } from "../password";

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleId: z.string().uuid(),
  departmentIds: z.array(z.string().uuid()).max(50).default([]),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * Accepting an invite: `name` and `password` are required when the invited
 * email has no account yet; `password` alone verifies an existing account
 * that isn't currently logged in. Neither is needed when the request is
 * authenticated as the invited user.
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(200).optional(),
  password: newPasswordSchema.optional(),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
