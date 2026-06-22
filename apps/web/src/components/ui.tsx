import type { ReactNode } from "react";
import { PRIORITY_LABELS, type TaskPriorityValue } from "@task-tracker/shared";
import { ApiError } from "../lib/api";

export function Spinner() {
  return (
    <div className="center">
      <span className="spinner" aria-label="Loading" />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof ApiError
      ? error.issues?.length
        ? error.issues.map((i) => `${i.path}: ${i.message}`).join("; ")
        : error.message
      : error instanceof Error
        ? error.message
        : "Something went wrong";
  return <p className="error-text">{message}</p>;
}

export function Dialog({
  title,
  onClose,
  hideClose,
  children,
}: {
  title: string;
  onClose: () => void;
  hideClose?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (!hideClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-label={title}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {!hideClose && (
            <button className="btn btn-sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "COMPLETED"
      ? "badge badge-success"
      : status === "IN_PROGRESS"
        ? "badge badge-info"
        : "badge";
  const label =
    status === "COMPLETED" ? "Completed" : status === "IN_PROGRESS" ? "In progress" : "Not started";
  return <span className={cls}>{label}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriorityValue | string }) {
  const p = priority as TaskPriorityValue;
  const cls =
    p === "URGENT"
      ? "badge badge-priority-urgent"
      : p === "HIGH"
        ? "badge badge-priority-high"
        : p === "LOW"
          ? "badge badge-priority-low"
          : "badge badge-priority-normal";
  return <span className={cls}>{PRIORITY_LABELS[p] ?? priority}</span>;
}

export function ConfirmButton({
  label,
  confirmLabel = "Confirm?",
  className = "btn btn-sm btn-danger",
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel?: string;
  className?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={className}
      disabled={disabled}
      onClick={() => {
        if (window.confirm(confirmLabel)) onConfirm();
      }}
    >
      {label}
    </button>
  );
}
