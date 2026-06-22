import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useSession } from "../auth/session";
import { EmptyState, ErrorText, PriorityBadge, Spinner, StatusBadge } from "../../components/ui";
import { TaskFormDialog } from "./TaskFormDialog";
import type { TaskListResponse } from "./types";

export function TasksPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: "", priority: "", assignedToMe: false, search: "" });
  const [showCreate, setShowCreate] = useState(false);

  const tasks = useInfiniteQuery({
    queryKey: ["tasks", filters],
    queryFn: ({ pageParam }) =>
      api<TaskListResponse>("/tasks", {
        query: {
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          assignedToMe: filters.assignedToMe || undefined,
          search: filters.search || undefined,
          cursor: pageParam || undefined,
        },
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = tasks.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="page-header">
        <h1>Tasks</h1>
        <span className="spacer" />
        {session.can("task.create") && !session.isRestricted && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New task
          </button>
        )}
      </div>

      <div className="card row">
        <input
          className="input"
          style={{ flex: "1 1 160px" }}
          placeholder="Search title…"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
        <select
          className="input"
          style={{ width: "auto" }}
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="">Any status</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select
          className="input"
          style={{ width: "auto" }}
          value={filters.priority}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
        >
          <option value="">Any priority</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>
        {!session.isRestricted && (
          <label className="row small" style={{ gap: "0.35rem" }}>
            <input
              type="checkbox"
              checked={filters.assignedToMe}
              onChange={(e) => setFilters((f) => ({ ...f, assignedToMe: e.target.checked }))}
            />
            Assigned to me
          </label>
        )}
      </div>

      {tasks.isLoading && <Spinner />}
      <ErrorText error={tasks.error} />
      {tasks.isSuccess && items.length === 0 && <EmptyState>No tasks match.</EmptyState>}

      {items.length > 0 && (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Department</th>
                <th>Progress</th>
                <th>My status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => {
                const overdue =
                  t.dueAt && new Date(t.dueAt) < new Date() && t.completedCount < t.assigneeCount;
                return (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/tasks/${t.id}`)}>
                    <td>
                      <strong>{t.title}</strong>
                      <div className="small muted">
                        {t.commentCount > 0 && `💬 ${t.commentCount} `}
                        {t.attachmentCount > 0 && `📎 ${t.attachmentCount}`}
                      </div>
                    </td>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td className={overdue ? "error-text" : undefined}>{fmtDateTime(t.dueAt)}</td>
                    <td>{t.department?.name ?? "—"}</td>
                    <td>
                      {t.assigneeCount === 0 ? (
                        <span className="muted">Unassigned</span>
                      ) : (
                        `${t.completedCount}/${t.assigneeCount} done`
                      )}
                    </td>
                    <td>{t.myStatus ? <StatusBadge status={t.myStatus} /> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tasks.hasNextPage && (
        <div className="center">
          <button className="btn" onClick={() => tasks.fetchNextPage()} disabled={tasks.isFetchingNextPage}>
            {tasks.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {showCreate && (
        <TaskFormDialog
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/tasks/${id}`);
          }}
        />
      )}
    </>
  );
}
