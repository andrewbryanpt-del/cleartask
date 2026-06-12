import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, downloadFile } from "../../lib/api";
import { fmtDateTime, fmtPercent } from "../../lib/format";
import { useSession } from "../auth/session";
import { EmptyState, ErrorText, Spinner } from "../../components/ui";

interface Group {
  key: string | null;
  label: string;
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  completedLate: number;
  completionRate: number | null;
}

interface CompletionReport {
  from: string;
  to: string;
  groupBy: string;
  summary: Group;
  groups: Group[];
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  detail: unknown;
  createdAt: string;
}

function daysAgoInput(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export function ReportsPage() {
  const session = useSession();
  const [from, setFrom] = useState(daysAgoInput(30));
  const [to, setTo] = useState(daysAgoInput(0));
  const [groupBy, setGroupBy] = useState("department");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);

  const canViewReport = session.can("dashboard.org");
  const canExport = session.can("report.export");
  const canAudit = session.can("audit.view");

  const report = useQuery({
    queryKey: ["report", from, to, groupBy],
    queryFn: () =>
      api<CompletionReport>("/reports/completion", { query: { from, to, groupBy } }),
    enabled: canViewReport,
  });

  const audit = useInfiniteQuery({
    queryKey: ["audit"],
    queryFn: ({ pageParam }) =>
      api<{ items: AuditEntry[]; nextCursor: string | null }>("/audit", {
        query: { cursor: pageParam || undefined },
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: canAudit,
  });

  async function exportReport(format: "xlsx" | "pdf") {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile("/reports/completion/export", { from, to, groupBy, format });
    } catch (err) {
      setDownloadError(err);
    } finally {
      setDownloading(false);
    }
  }

  async function exportAudit() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadFile("/reports/audit/export", { from, to });
    } catch (err) {
      setDownloadError(err);
    } finally {
      setDownloading(false);
    }
  }

  const auditItems = audit.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="card row">
        <label className="row small" style={{ gap: "0.35rem" }}>
          From
          <input className="input" style={{ width: "auto" }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="row small" style={{ gap: "0.35rem" }}>
          To
          <input className="input" style={{ width: "auto" }} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <select className="input" style={{ width: "auto" }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="department">By department</option>
          <option value="location">By location</option>
          <option value="member">By person</option>
        </select>
        <span className="spacer" />
        {canExport && (
          <>
            <button className="btn" onClick={() => void exportReport("xlsx")} disabled={downloading}>
              ⬇ Excel
            </button>
            <button className="btn" onClick={() => void exportReport("pdf")} disabled={downloading}>
              ⬇ PDF
            </button>
          </>
        )}
      </div>
      <ErrorText error={downloadError} />

      {canViewReport && (
        <>
          {report.isLoading && <Spinner />}
          <ErrorText error={report.error} />
          {report.data && (
            <div className="card table-wrap">
              <h2>
                Completion — {fmtPercent(report.data.summary.completionRate)} overall (
                {report.data.summary.completed}/{report.data.summary.total})
              </h2>
              {report.data.groups.length === 0 ? (
                <EmptyState>No assignments in this range.</EmptyState>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Total</th>
                      <th>Done</th>
                      <th>In progress</th>
                      <th>Not started</th>
                      <th>Overdue</th>
                      <th>Late</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.groups.map((g) => (
                      <tr key={g.key ?? "none"}>
                        <td><strong>{g.label}</strong></td>
                        <td>{g.total}</td>
                        <td>{g.completed}</td>
                        <td>{g.inProgress}</td>
                        <td>{g.notStarted}</td>
                        <td>{g.overdue}</td>
                        <td>{g.completedLate}</td>
                        <td>{fmtPercent(g.completionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {canAudit && (
        <div className="card table-wrap">
          <div className="row" style={{ marginBottom: "0.5rem" }}>
            <h2 style={{ margin: 0 }}>Audit trail</h2>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={() => void exportAudit()} disabled={downloading}>
              ⬇ Export audit (Excel)
            </button>
          </div>
          {audit.isLoading && <Spinner />}
          <ErrorText error={audit.error} />
          {auditItems.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                {auditItems.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{fmtDateTime(a.createdAt)}</td>
                    <td>{a.actorName ?? <span className="muted">System</span>}</td>
                    <td><code className="small">{a.action}</code></td>
                    <td className="small muted">{a.entityType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {audit.hasNextPage && (
            <div className="center">
              <button className="btn" onClick={() => audit.fetchNextPage()} disabled={audit.isFetchingNextPage}>
                {audit.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
