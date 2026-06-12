import { z } from "zod";

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidTimezone, { message: "Unknown IANA timezone" });

// The RRULE body only (e.g. "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0"),
// without a DTSTART line — the rule's creation time anchors it, and
// `timezone` says where the clock times apply. Full parse validation
// happens server-side with the rrule library.
const rruleString = z.string().trim().min(1).max(500);

export const createRecurrenceRuleSchema = z
  .object({
    templateId: z.string().uuid(),
    rrule: rruleString,
    timezone: timezone.default("UTC"),
    locationId: z.string().uuid().optional(),
    departmentId: z.string().uuid().optional(),
    assigneeMembershipIds: z.array(z.string().uuid()).max(200).default([]),
    assigneeDepartmentIds: z.array(z.string().uuid()).max(50).default([]),
  })
  .refine(
    (v) =>
      v.assigneeMembershipIds.length > 0 || v.assigneeDepartmentIds.length > 0,
    { message: "At least one assignee or department is required" },
  );
export type CreateRecurrenceRuleInput = z.infer<
  typeof createRecurrenceRuleSchema
>;

export const updateRecurrenceRuleSchema = z.object({
  rrule: rruleString.optional(),
  timezone: timezone.optional(),
  active: z.boolean().optional(),
  locationId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  assigneeMembershipIds: z.array(z.string().uuid()).max(200).optional(),
  assigneeDepartmentIds: z.array(z.string().uuid()).max(50).optional(),
});
export type UpdateRecurrenceRuleInput = z.infer<
  typeof updateRecurrenceRuleSchema
>;
