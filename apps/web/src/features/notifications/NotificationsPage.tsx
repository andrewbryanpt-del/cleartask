import { Link } from "react-router-dom";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { EmptyState, ErrorText, Spinner } from "../../components/ui";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  taskId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  "task.assigned": "📋",
  "task.reminder": "⏰",
  "task.overdue": "🔴",
};

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["notifications", "list"],
    queryFn: ({ pageParam }) =>
      api<NotificationsResponse>("/notifications", {
        query: { cursor: pageParam || undefined },
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api("/notifications/read-all", { method: "POST" }),
    onSuccess: invalidate,
  });

  if (list.isLoading) return <Spinner />;
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unreadCount ?? 0;

  return (
    <>
      <div className="page-header">
        <h1>Notifications</h1>
        <span className="spacer" />
        {unread > 0 && (
          <button className="btn" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Mark all read ({unread})
          </button>
        )}
      </div>
      <ErrorText error={list.error} />
      {items.length === 0 && <EmptyState>You're all caught up.</EmptyState>}

      {items.length > 0 && (
        <div className="card" style={{ padding: "0 1rem" }}>
          {items.map((n) => (
            <div key={n.id} className={`notif ${n.readAt ? "" : "unread"}`}>
              <span style={{ fontSize: "1.2rem" }}>{TYPE_ICONS[n.type] ?? "🔔"}</span>
              <div style={{ flex: 1 }}>
                <div>
                  {n.taskId ? <Link to={`/tasks/${n.taskId}`}>{n.title}</Link> : <strong>{n.title}</strong>}
                </div>
                {n.body && <div className="small muted">{n.body}</div>}
                <div className="small muted">{fmtDateTime(n.createdAt)}</div>
              </div>
              {!n.readAt && (
                <button
                  className="btn btn-sm"
                  onClick={() => markRead.mutate(n.id)}
                  disabled={markRead.isPending}
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {list.hasNextPage && (
        <div className="center">
          <button className="btn" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
