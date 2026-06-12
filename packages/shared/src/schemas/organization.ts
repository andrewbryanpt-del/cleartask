import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  industry: z.string().trim().max(100).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  website: z
    .string()
    .trim()
    .max(300)
    .url({ message: "Enter a full URL, e.g. https://example.com" })
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).optional(),
  timezone: z.string().trim().max(64).optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const createDepartmentSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(200),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
