import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fetchBlobUrl } from "../../lib/api";
import { fmtBytes, fmtDateTime } from "../../lib/format";
import { captureProofPhoto, isNative } from "../../lib/native";
import { useSession } from "../auth/session";
import { ConfirmButton, EmptyState, ErrorText, Spinner, StatusBadge } from "../../components/ui";
import type { TaskDetail } from "./types";

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const queryClient = useQueryClient();
  const myMembershipId = session.currentOrg?.membershipId;

  const task = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => api<TaskDetail>(`/tasks/${taskId}`),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const setStatus = useMutation({
    mutationFn: ({ assignmentId, status }: { assignmentId: string; status: string }) =>
      api(`/assignments/${assignmentId}/status`, { method: "PATCH", body: { status } }),
    onSuccess: invalidate,
  });

  const removeAssignment = useMutation({
    mutationFn: (assignmentId: string) =>
      api(`/assignments/${assignmentId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const deleteTask = useMutation({
    mutationFn: () => api(`/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate("/tasks");
    },
  });

  const [comment, setComment] = useState("");
  const addComment = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/comments`, { method: "POST", body: { body: comment } }),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api(`/tasks/${taskId}/attachments`, { method: "POST", formData });
    },
    onSuccess: invalidate,
  });

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) =>
      api(`/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const uploadProof = useMutation({
    mutationFn: ({ assignmentId, blob, name }: { assignmentId: string; blob: Blob; name: string }) => {
      const formData = new FormData();
      formData.append("type", "PHOTO");
      formData.append("file", blob, name);
      return api(`/assignments/${assignmentId}/proof`, { method: "POST", formData });
    },
    onSuccess: invalidate,
  });

  const attachmentInput = useRef<HTMLInputElement>(null);
  const proofInput = useRef<HTMLInputElement>(null);

  if (task.isLoading) return <Spinner />;
  if (task.isError) return <ErrorText error={task.error} />;
  const t = task.data!;

  const canManage =
    !session.isRestricted &&
    (session.can("task.manage") || t.createdByMembershipId === myMembershipId);
  const myAssignment = t.assignments.find((a) => a.membership.id === myMembershipId);

  async function takeProofPhoto(assignmentId: string) {
    if (isNative()) {
      const blob = await captureProofPhoto();
      if (blob) uploadProof.mutate({ assignmentId, blob, name: "proof.jpg" });
    } else {
      proofInput.current?.click();
    }
  }

  function onCommentSubmit(e: FormEvent) {
    e.preventDefault();
    if (comment.trim()) addComment.mutate();
  }

  async function openAttachment(attachmentId: string) {
    // Downloading through this route records the "viewed" event.
    const url = await fetchBlobUrl(`/attachments/${attachmentId}/download`);
    window.open(url, "_blank");
    invalidate();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t.title}</h1>
          <div className="row small muted">
            {t.dueAt && <span>Due {fmtDateTime(t.dueAt)}</span>}
            {t.department && <span className="badge">{t.department.name}</span>}
            {t.location && <span className="badge">{t.location.name}</span>}
            {t.template && <span className="badge badge-info">From: {t.template.title}</span>}
          </div>
        </div>
        <span className="spacer" />
        {canManage && (
          <ConfirmButton
            label="Delete task"
            confirmLabel="Delete this task for everyone?"
            onConfirm={() => deleteTask.mutate()}
          />
        )}
      </div>

      {t.description && <div className="card">{t.description}</div>}

      {myAssignment && (
        <div className="card">
          <h2>My status</h2>
          <div className="row">
            <StatusBadge status={myAssignment.status} />
            {(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const)
              .filter((s) => s !== myAssignment.status)
              .map((s) => (
                <button
                  key={s}
                  className="btn btn-sm"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ assignmentId: myAssignment.id, status: s })}
                >
                  {s === "COMPLETED" ? "Mark completed" : s === "IN_PROGRESS" ? "Start" : "Reset"}
                </button>
              ))}
            <span className="spacer" />
            <button
              className="btn btn-sm"
              onClick={() => void takeProofPhoto(myAssignment.id)}
              disabled={uploadProof.isPending}
            >
              📷 {uploadProof.isPending ? "Uploading…" : "Add proof photo"}
            </button>
            <input
              ref={proofInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadProof.mutate({ assignmentId: myAssignment.id, blob: file, name: file.name });
                e.target.value = "";
              }}
            />
          </div>
          {myAssignment.proofs.length > 0 && (
            <p className="small muted" style={{ marginBottom: 0 }}>
              {myAssignment.proofs.length} proof file(s) uploaded
            </p>
          )}
          <ErrorText error={uploadProof.error ?? setStatus.error} />
        </div>
      )}

      <div className="card">
        <h2>Assignees</h2>
        {t.assignments.length === 0 && <EmptyState>Nobody is assigned yet.</EmptyState>}
        {t.assignments.map((a) => (
          <div key={a.id} className="row" style={{ padding: "0.35rem 0" }}>
            <strong>{a.membership.user.name}</strong>
            <StatusBadge status={a.status} />
            {a.completedAt && <span className="small muted">{fmtDateTime(a.completedAt)}</span>}
            {a.proofs.length > 0 && <span className="badge badge-success">📷 proof ×{a.proofs.length}</span>}
            <span className="spacer" />
            {canManage && a.membership.id !== myMembershipId && (
              <ConfirmButton
                label="Unassign"
                confirmLabel={`Unassign ${a.membership.user.name}?`}
                onConfirm={() => removeAssignment.mutate(a.id)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Attachments</h2>
          <span className="spacer" />
          {canManage && (
            <>
              <button
                className="btn btn-sm"
                onClick={() => attachmentInput.current?.click()}
                disabled={uploadAttachment.isPending}
              >
                {uploadAttachment.isPending ? "Uploading…" : "+ Upload"}
              </button>
              <input
                ref={attachmentInput}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadAttachment.mutate(file);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {t.attachments.length === 0 && <p className="muted small">No attachments.</p>}
        {t.attachments.map((att) => (
          <div key={att.id} className="row" style={{ padding: "0.3rem 0" }}>
            <a
              href="#open"
              onClick={(e) => {
                e.preventDefault();
                void openAttachment(att.id);
              }}
            >
              {att.fileName}
            </a>
            <span className="small muted">{fmtBytes(att.sizeBytes)}</span>
            {att.viewedByMe ? (
              <span className="badge badge-success">viewed</span>
            ) : (
              <span className="badge badge-warning">not viewed</span>
            )}
            {canManage && <span className="badge">{att.viewCount} view(s)</span>}
            <span className="spacer" />
            {canManage && (
              <ConfirmButton
                label="Remove"
                confirmLabel="Remove this attachment?"
                onConfirm={() => deleteAttachment.mutate(att.id)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Comments</h2>
        {t.comments.length === 0 && <p className="muted small">No comments yet.</p>}
        {t.comments.map((c) => (
          <div key={c.id} className="comment">
            <div className="row small">
              <strong>{c.author.name}</strong>
              <span className="muted">{fmtDateTime(c.createdAt)}</span>
            </div>
            <div>{c.body}</div>
          </div>
        ))}
        <form onSubmit={onCommentSubmit} className="row" style={{ marginTop: "0.75rem" }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Write a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button className="btn btn-primary" disabled={addComment.isPending || !comment.trim()}>
            Post
          </button>
        </form>
        <ErrorText error={addComment.error} />
      </div>
    </>
  );
}
