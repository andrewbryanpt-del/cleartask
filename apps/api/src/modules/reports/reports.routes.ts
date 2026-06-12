import type { FastifyInstance } from "fastify";
import {
  auditExportQuerySchema,
  completionReportExportQuerySchema,
  completionReportQuerySchema,
} from "@task-tracker/shared";
import { prisma } from "../../lib/prisma";
import { recordAudit, withActorNames } from "../audit/audit.service";
import {
  fetchAssignmentFacts,
  groupFacts,
  summarize,
} from "./reports.service";
import {
  auditExportXlsx,
  completionReportPdf,
  completionReportXlsx,
  type CompletionReportData,
} from "./reports.export";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const FORMAT_META = {
  xlsx: {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
  pdf: { contentType: "application/pdf", extension: "pdf" },
} as const;

async function buildCompletionReport(
  organizationId: string,
  query: {
    from?: Date;
    to?: Date;
    locationId?: string;
    departmentId?: string;
    membershipId?: string;
    groupBy: "department" | "location" | "member";
  },
): Promise<CompletionReportData> {
  const now = new Date();
  const to = query.to ?? now;
  const from = query.from ?? new Date(to.getTime() - THIRTY_DAYS_MS);
  const [organization, facts] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    }),
    fetchAssignmentFacts(organizationId, { ...query, from, to }),
  ]);
  return {
    organizationName: organization.name,
    from,
    to,
    groupBy: query.groupBy,
    summary: summarize(facts, now),
    groups: groupFacts(facts, query.groupBy, now),
  };
}

export default async function reportsRoutes(app: FastifyInstance) {
  app.get(
    "/reports/completion",
    { preHandler: app.requirePermission("dashboard.org") },
    async (req) => {
      const query = completionReportQuerySchema.parse(req.query);
      const report = await buildCompletionReport(
        req.auth.organizationId,
        query,
      );
      const { organizationName, ...rest } = report;
      return rest;
    },
  );

  app.get(
    "/reports/completion/export",
    { preHandler: app.requirePermission("report.export") },
    async (req, reply) => {
      const query = completionReportExportQuerySchema.parse(req.query);
      const report = await buildCompletionReport(
        req.auth.organizationId,
        query,
      );
      const buffer =
        query.format === "pdf"
          ? await completionReportPdf(report)
          : await completionReportXlsx(report);

      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "report.exported",
        entityType: "Report",
        detail: {
          type: "completion",
          format: query.format,
          from: report.from.toISOString(),
          to: report.to.toISOString(),
          groupBy: query.groupBy,
        },
      });

      const meta = FORMAT_META[query.format];
      const stamp = report.to.toISOString().slice(0, 10);
      return reply
        .header("content-type", meta.contentType)
        .header(
          "content-disposition",
          `attachment; filename="completion-report-${stamp}.${meta.extension}"`,
        )
        .send(buffer);
    },
  );

  app.get(
    "/reports/audit/export",
    { preHandler: app.requirePermission("audit.view") },
    async (req, reply) => {
      const query = auditExportQuerySchema.parse(req.query);
      const [organization, logs] = await Promise.all([
        prisma.organization.findUniqueOrThrow({
          where: { id: req.auth.organizationId },
          select: { name: true },
        }),
        prisma.auditLog.findMany({
          where: {
            organizationId: req.auth.organizationId,
            ...(query.entityType ? { entityType: query.entityType } : {}),
            ...(query.action
              ? { action: { contains: query.action, mode: "insensitive" } }
              : {}),
            ...(query.from || query.to
              ? {
                  createdAt: {
                    ...(query.from ? { gte: query.from } : {}),
                    ...(query.to ? { lte: query.to } : {}),
                  },
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 10_000,
        }),
      ]);

      const buffer = await auditExportXlsx(
        organization.name,
        await withActorNames(logs),
      );
      await recordAudit({
        organizationId: req.auth.organizationId,
        actorMembershipId: req.auth.membershipId,
        action: "report.exported",
        entityType: "Report",
        detail: { type: "audit", rows: logs.length },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      return reply
        .header("content-type", FORMAT_META.xlsx.contentType)
        .header(
          "content-disposition",
          `attachment; filename="audit-trail-${stamp}.xlsx"`,
        )
        .send(buffer);
    },
  );
}
