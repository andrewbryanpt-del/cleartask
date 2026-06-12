const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTime.format(new Date(value));
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateOnly.format(new Date(value));
}

export function fmtPercent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

// Reminder offset presets (minutes before due).
export const REMINDER_PRESETS: { label: string; minutes: number }[] = [
  { label: "At due time", minutes: 0 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
  { label: "3 days before", minutes: 4320 },
  { label: "7 days before", minutes: 10080 },
];

// Converts a datetime-local input value to an ISO string (and back).
export function localInputToIso(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function isoToLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
