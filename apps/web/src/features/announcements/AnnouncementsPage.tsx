import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { fmtDateTime } from "../../lib/format";
import { useSession } from "../auth/session";
import { ConfirmButton, Dialog, EmptyState, ErrorText, Spinner } from "../../components/ui";

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  readByMe: boolean;
  readAt: string | null;
  readCount?: number;
}

interface AnnouncementsResponse {
  items: AnnouncementItem[];
}

interface ReadStatusResponse {
  read: { membershipId: string; name: string; readAt: string }[];
  unread: { membershipId: string; name: string }[];
}

/** Shown on app open until staff confirm unread announcements. */
export function AnnouncementsNoticeboard() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["announcements", "unread"],
    queryFn: () =>
      api<AnnouncementsResponse>("/announcements", { query: { unreadOnly: true, limit: 10 } }),
    staleTime: 60_000,
  });

  const unread = data?.items ?? [];
  const current = unread[0];

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/announcements/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  if (isLoading || !current) return null;

  return (
    <Dialog title="Announcement" onClose={() => {}} hideClose>
      <div className="announcement-notice">
        <p className="small muted" style={{ marginTop: 0 }}>
          Posted {fmtDateTime(current.createdAt)}
          {current.authorName ? ` by ${current.authorName}` : ""}
        </p>
        <h3 style={{ margin: "0.5rem 0" }}>{current.title}</h3>
        <div className="announcement-body">{current.body}</div>
        {unread.length > 1 && (
          <p className="small muted">{unread.length} unread announcements</p>
        )}
        <ErrorText error={markRead.error} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
          <button
            className="btn btn-primary"
            disabled={markRead.isPending}
            onClick={() => markRead.mutate(current.id)}
          >
            {markRead.isPending ? "Confirming…" : "I have read this"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export function AnnouncementsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const canManage = session.can("announcement.manage");

  const [form, setForm] = useState({ title: "", body: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api<AnnouncementsResponse>("/announcements", { query: { limit: 50 } }),
  });

  const readStatus = useQuery({
    queryKey: ["announcements", "reads", expandedId],
    queryFn: () => api<ReadStatusResponse>(`/announcements/${expandedId}/reads`),
    enabled: !!expandedId && canManage,
  });

  const create = useMutation({
    mutationFn: () =>
      api("/announcements", { method: "POST", body: { title: form.title, body: form.body } }),
    onSuccess: () => {
      setForm({ title: "", body: "" });
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setExpandedId(null);
    },
  });

  const items = announcements.data?.items ?? [];

  return (
    <>
      <div className="page-header">
        <h1>Announcements</h1>
      </div>

      {canManage && (
        <div className="card">
          <h2>Post announcement</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (form.title.trim() && form.body.trim()) create.mutate();
            }}
          >
            <div className="field">
              <label>Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                className="input"
                rows={4}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                required
              />
            </div>
            <ErrorText error={create.error} />
            <button className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Posting…" : "Post to noticeboard"}
            </button>
          </form>
        </div>
      )}

      {announcements.isLoading && <Spinner />}
      <ErrorText error={announcements.error} />
      {announcements.isSuccess && items.length === 0 && (
        <EmptyState>No announcements yet.</EmptyState>
      )}

      {items.map((a) => (
        <div key={a.id} className="card">
          <div className="row">
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0 }}>{a.title}</h2>
              <p className="small muted" style={{ margin: "0.25rem 0" }}>
                {fmtDateTime(a.createdAt)}
                {a.authorName ? ` · ${a.authorName}` : ""}
                {a.readByMe ? " · You confirmed" : " · Not yet confirmed"}
              </p>
            </div>
            {canManage && (
              <>
                <button
                  className="btn btn-sm"
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                >
                  {expandedId === a.id ? "Hide reads" : "Who read?"}
                </button>
                <ConfirmButton
                  label="Delete"
                  confirmLabel="Delete this announcement?"
                  onConfirm={() => remove.mutate(a.id)}
                />
              </>
            )}
          </div>
          <div className="announcement-body">{a.body}</div>
          {!a.readByMe && (
            <MarkReadButton announcementId={a.id} />
          )}
          {canManage && expandedId === a.id && (
            <div style={{ marginTop: "0.75rem" }}>
              {readStatus.isLoading && <Spinner />}
              <ErrorText error={readStatus.error} />
              {readStatus.data && (
                <>
                  <p className="small">
                    <strong>Confirmed ({readStatus.data.read.length})</strong>
                  </p>
                  {readStatus.data.read.length === 0 && (
                    <p className="muted small">Nobody has confirmed yet.</p>
                  )}
                  {readStatus.data.read.map((r) => (
                    <div key={r.membershipId} className="row small">
                      <span>{r.name}</span>
                      <span className="badge badge-success">{fmtDateTime(r.readAt)}</span>
                    </div>
                  ))}
                  <p className="small" style={{ marginTop: "0.5rem" }}>
                    <strong>Not yet confirmed ({readStatus.data.unread.length})</strong>
                  </p>
                  {readStatus.data.unread.map((r) => (
                    <div key={r.membershipId} className="row small">
                      <span>{r.name}</span>
                      <span className="badge badge-warning">Pending</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function MarkReadButton({ announcementId }: { announcementId: string }) {
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: () => api(`/announcements/${announcementId}/read`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["announcements"] }),
  });
  return (
    <button
      className="btn btn-sm btn-primary"
      style={{ marginTop: "0.5rem" }}
      disabled={markRead.isPending}
      onClick={() => markRead.mutate()}
    >
      {markRead.isPending ? "Confirming…" : "I have read this"}
    </button>
  );
}
