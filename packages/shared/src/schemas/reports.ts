import { z } from "zod";

export const REPORT_GROUP_BYS = ["department", "location", "member"] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BYS)[number];

export const REPORT_FORMATS = ["xlsx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

// Date range + scope filters shared by report and dashboard endpoints.
// Dates accept anything Date.parse understands (ISO date or datetime).
const rangeFilters = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  locationId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  membershipId: z.string().uuid().optional(),
};

export const completionReportQuerySchema = z.object({
  ...rangeFilters,
  groupBy: z.enum(REPORT_GROUP_BYS).default("department"),
});
export type CompletionReportQuery = z.infer<typeof completionReportQuerySchema>;

export const completionReportExportQuerySchema =
  completionReportQuerySchema.extend({
    format: z.enum(REPORT_FORMATS).default("xlsx"),
  });
export type CompletionReportExportQuery = z.infer<
  typeof completionReportExportQuerySchema
>;

export const dashboardQuerySchema = z.object({
  departmentId: z.string().uuid().optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const listAuditQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export const auditExportQuerySchema = listAuditQuerySchema.omit({
  cursor: true,
  limit: true,
});
export type AuditExportQuery = z.infer<typeof auditExportQuerySchema>;
