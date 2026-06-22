import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { fmtDateTime, fmtPercent } from "../../lib/format";
import { useSession } from "../auth/session";
import { ErrorText, Spinner, StatusBadge } from "../../components/ui";

interface Summary {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  completedLate: number;
  completionRate: number | null;
}

interface TaskRef {
  taskId: string;
  title: string;
  dueAt: string | null;
  status: string;
  memberName: string;
}

interface Group extends Summary {
  key: string | null;
  label: string;
}

function StatCards({ summary }: { summary: Summary }) {
  const stats = [
    { label: "Assignments", value: summary.total, className: "" },
    { label: "Completed", value: summary.completed, className: "stat-success" },
    { label: "In progress", value: summary.inProgress, className: "" },
    { label: "Overdue", value: summary.overdue, className: "stat-overdue" },
    { label: "Completion", value: fmtPercent(summary.completionRate), className: "" },
  ];
  return (
    <div className="stat-grid">
      {stats.map((s) => (
        <div className={`stat ${s.className}`.trim()} key={s.label}>
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function TaskRefList({ title, items }: { title: string; items: TaskRef[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h2>{title}</h2>
      {items.map((t, i) => (
        <div key={`${t.taskId}-${i}`} className="row" style={{ padding: "0.3rem 0" }}>
          <Link to={`/tasks/${t.taskId}`}>{t.title}</Link>
          <StatusBadge status={t.status} />
          <span className="spacer" />
          <span className="small muted">{fmtDateTime(t.dueAt)}</span>
        </div>
      ))}
    </div>
  );
}

function GroupTable({ title, groups }: { title: string; groups: Group[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="card table-wrap">
      <h2>{title}</h2>
      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th>Total</th>
            <th>Done</th>
            <th>Overdue</th>
            <th>Rate</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key ?? "none"}>
              <td><strong>{g.label}</strong></td>
              <td>{g.total}</td>
              <td>{g.completed}</td>
              <td>{g.overdue > 0 ? <span className="badge badge-danger">{g.overdue}</span> : 0}</td>
              <td>{fmtPercent(g.completionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardPage() {
  const session = useSession();
  const showDept =
    !session.isRestricted &&
    (session.can("dashboard.department") || session.can("dashboard.org"));
  const showOrg = !session.isRestricted && session.can("dashboard.org");

  const me = useQuery({
    queryKey: ["dashboard", "me"],
    queryFn: () =>
      api<{ summary: Summary; overdue: TaskRef[]; upcoming: TaskRef[] }>("/dashboard/me"),
  });
  const dept = useQuery({
    queryKey: ["dashboard", "department"],
    queryFn: () =>
      api<{
        departments: { department: { id: string; name: string }; summary: Summary; members: Group[]; overdue: TaskRef[] }[];
      }>("/dashboard/department"),
    enabled: showDept,
  });
  const org = useQuery({
    queryKey: ["dashboard", "organization"],
    queryFn: () =>
      api<{ summary: Summary; byLocation: Group[]; byDepartment: Group[]; overdue: TaskRef[] }>(
        "/dashboard/organization",
      ),
    enabled: showOrg,
  });

  if (me.isLoading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="spacer" />
        <span className="muted small">Hi {session.user?.name?.split(" ")[0]}</span>
      </div>
      <ErrorText error={me.error} />

      {me.data && (
        <>
          <h2 className="page-section-title">My work</h2>
          <StatCards summary={me.data.summary} />
          <TaskRefList title="Overdue" items={me.data.overdue} />
          <TaskRefList title="Coming up" items={me.data.upcoming} />
        </>
      )}

      {showOrg && org.data && (
        <>
          <h2 className="page-section-title">Organization</h2>
          <StatCards summary={org.data.summary} />
          <GroupTable title="By department" groups={org.data.byDepartment} />
          <GroupTable title="By location" groups={org.data.byLocation} />
          <TaskRefList title="Most overdue" items={org.data.overdue} />
        </>
      )}

      {showDept && !showOrg && dept.data && (
        <>
          <h2 className="page-section-title">My departments</h2>
          {dept.data.departments.map((d) => (
            <div key={d.department.id}>
              <h3>{d.department.name}</h3>
              <StatCards summary={d.summary} />
              <GroupTable title="Team members" groups={d.members} />
              <TaskRefList title="Overdue in team" items={d.overdue} />
            </div>
          ))}
        </>
      )}
    </>
  );
}
