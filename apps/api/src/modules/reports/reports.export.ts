import ExcelJS from "exceljs";
import PdfPrinter from "pdfmake";
import vfs from "pdfmake/build/vfs_fonts.js";
import type { AuditLog } from "@prisma/client";
import type { ReportGroupBy } from "@task-tracker/shared";
import type { CompletionGroup, CompletionSummary } from "./reports.service";

export interface CompletionReportData {
  organizationName: string;
  from: Date;
  to: Date;
  groupBy: ReportGroupBy;
  summary: CompletionSummary;
  groups: CompletionGroup[];
}

const GROUP_LABELS: Record<ReportGroupBy, string> = {
  department: "Department",
  location: "Location",
  member: "Team member",
};

function percent(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

const SUMMARY_ROWS = (s: CompletionSummary): [string, string | number][] => [
  ["Assignments", s.total],
  ["Completed", s.completed],
  ["In progress", s.inProgress],
  ["Not started", s.notStarted],
  ["Overdue", s.overdue],
  ["Completed late", s.completedLate],
  ["Completion rate", percent(s.completionRate)],
];

const GROUP_HEADER = [
  "Total",
  "Completed",
  "In progress",
  "Not started",
  "Overdue",
  "Completed late",
  "Completion rate",
];

function groupRow(g: CompletionGroup): (string | number)[] {
  return [
    g.label,
    g.total,
    g.completed,
    g.inProgress,
    g.notStarted,
    g.overdue,
    g.completedLate,
    percent(g.completionRate),
  ];
}

// ---------- XLSX ----------

export async function completionReportXlsx(
  data: CompletionReportData,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRow([`Completion report — ${data.organizationName}`]);
  summarySheet.addRow([
    `Range: ${data.from.toISOString()} to ${data.to.toISOString()}`,
  ]);
  summarySheet.addRow([]);
  for (const row of SUMMARY_ROWS(data.summary)) summarySheet.addRow(row);
  summarySheet.getColumn(1).width = 24;

  const breakdown = workbook.addWorksheet("Breakdown");
  breakdown.addRow([GROUP_LABELS[data.groupBy], ...GROUP_HEADER]);
  breakdown.getRow(1).font = { bold: true };
  for (const group of data.groups) breakdown.addRow(groupRow(group));
  breakdown.getColumn(1).width = 32;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function auditExportXlsx(
  organizationName: string,
  logs: (AuditLog & { actorName: string | null })[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Audit trail");
  sheet.addRow([`Audit trail — ${organizationName}`]);
  sheet.addRow([]);
  sheet.addRow(["When", "Actor", "Action", "Entity type", "Entity id", "Detail"]);
  sheet.getRow(3).font = { bold: true };
  for (const log of logs) {
    sheet.addRow([
      log.createdAt.toISOString(),
      log.actorName ?? "System",
      log.action,
      log.entityType,
      log.entityId ?? "",
      log.detail ? JSON.stringify(log.detail) : "",
    ]);
  }
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 24;
  sheet.getColumn(4).width = 18;
  sheet.getColumn(5).width = 38;
  sheet.getColumn(6).width = 60;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---------- PDF ----------

// pdfmake's server printer takes raw font buffers; the bundled vfs module
// is a map of file name → base64 TTF (Roboto only).
const printer = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(vfs["Roboto-Regular.ttf"]!, "base64"),
    bold: Buffer.from(vfs["Roboto-Medium.ttf"]!, "base64"),
    italics: Buffer.from(vfs["Roboto-Italic.ttf"]!, "base64"),
    bolditalics: Buffer.from(vfs["Roboto-MediumItalic.ttf"]!, "base64"),
  },
});

function pdfToBuffer(
  doc: NodeJS.ReadableStream & { end(): void },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function completionReportPdf(
  data: CompletionReportData,
): Promise<Buffer> {
  const doc = printer.createPdfKitDocument({
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    defaultStyle: { fontSize: 9 },
    content: [
      { text: `Completion report — ${data.organizationName}`, fontSize: 16, bold: true },
      {
        text: `${data.from.toUTCString()} — ${data.to.toUTCString()}`,
        color: "#666666",
        margin: [0, 2, 0, 14],
      },
      { text: "Summary", fontSize: 12, bold: true, margin: [0, 0, 0, 6] },
      {
        table: {
          widths: [160, "*"],
          body: SUMMARY_ROWS(data.summary).map(([k, v]) => [k, String(v)]),
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 14],
      },
      {
        text: `By ${GROUP_LABELS[data.groupBy].toLowerCase()}`,
        fontSize: 12,
        bold: true,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: ["*", 36, 56, 56, 56, 46, 60, 60],
          body: [
            [
              { text: GROUP_LABELS[data.groupBy], bold: true },
              ...GROUP_HEADER.map((h) => ({ text: h, bold: true })),
            ],
            ...data.groups.map((g) => groupRow(g).map(String)),
          ],
        },
        layout: "lightHorizontalLines",
      },
    ],
  });
  return pdfToBuffer(doc);
}
