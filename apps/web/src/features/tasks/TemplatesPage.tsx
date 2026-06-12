import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { REMINDER_PRESETS } from "../../lib/format";
import { useMembers, useOrganization, useTemplates, type TaskTemplate } from "../../lib/queries";
import { useSession } from "../auth/session";
import { ConfirmButton, Dialog, EmptyState, ErrorText, Spinner } from "../../components/ui";

interface RecurrenceRule {
  id: string;
  rrule: string;
  timezone: string;
  active: boolean;
  nextRunAt: string | null;
  template: { id: string; title: string };
  department: { id: string; name: string } | null;
  assigneeMembershipIds: string[];
  assigneeDepartmentIds: string[];
}

const WEEKDAYS = [
  ["MO", "Mon"], ["TU", "Tue"], ["WE", "Wed"], ["TH", "Thu"],
  ["FR", "Fri"], ["SA", "Sat"], ["SU", "Sun"],
] as const;

function describeRrule(rrule: string): string {
  const parts = Object.fromEntries(rrule.split(";").map((p) => p.split("=")));
  const time =
    parts.BYHOUR !== undefined
      ? ` at ${String(parts.BYHOUR).padStart(2, "0")}:${String(parts.BYMINUTE ?? 0).padStart(2, "0")}`
      : "";
  if (parts.FREQ === "DAILY") return `Daily${time}`;
  if (parts.FREQ === "WEEKLY") return `Weekly (${parts.BYDAY ?? "?"})${time}`;
  if (parts.FREQ === "MONTHLY") return `Monthly (day ${parts.BYMONTHDAY ?? "?"})${time}`;
  return rrule;
}

export function TemplatesPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const templates = useTemplates();
  const rules = useQuery({
    queryKey: ["recurrence-rules"],
    queryFn: () => api<RecurrenceRule[]>("/recurrence-rules"),
  });
  const canManage = session.can("template.manage");

  const [editing, setEditing] = useState<TaskTemplate | "new" | null>(null);
  const [scheduling, setScheduling] = useState<TaskTemplate | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/task-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });
  const removeRule = useMutation({
    mutationFn: (id: string) => api(`/recurrence-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["recurrence-rules"] }),
  });
  const toggleRule = useMutation({
    mutationFn: (rule: RecurrenceRule) =>
      api(`/recurrence-rules/${rule.id}`, { method: "PATCH", body: { active: !rule.active } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["recurrence-rules"] }),
  });

  if (templates.isLoading) return <Spinner />;

  return (
    <>
      <div className="page-header">
        <h1>Templates</h1>
        <span className="spacer" />
        {canManage && (
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            + New template
          </button>
        )}
      </div>
      <ErrorText error={templates.error ?? remove.error} />

      {(templates.data?.length ?? 0) === 0 && (
        <EmptyState>No templates yet. Templates make repeat tasks one click.</EmptyState>
      )}

      {templates.data?.map((t) => {
        const templateRules = rules.data?.filter((r) => r.template.id === t.id) ?? [];
        return (
          <div key={t.id} className="card">
            <div className="row">
              <div>
                <h3 style={{ margin: 0 }}>{t.title}</h3>
                {t.description && <p className="small muted" style={{ margin: "0.2rem 0 0" }}>{t.description}</p>}
              </div>
              <span className="spacer" />
              <span className="badge">{t.taskCount} task(s) created</span>
              {t.attachments.length > 0 && <span className="badge">📎 {t.attachments.length}</span>}
              {canManage && (
                <>
                  <button className="btn btn-sm" onClick={() => setScheduling(t)}>
                    Schedule
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                  <ConfirmButton
                    label="Delete"
                    confirmLabel={`Delete template "${t.title}"?`}
                    onConfirm={() => remove.mutate(t.id)}
                  />
                </>
              )}
            </div>
            {templateRules.length > 0 && (
              <div style={{ marginTop: "0.6rem" }}>
                {templateRules.map((r) => (
                  <div key={r.id} className="row small" style={{ padding: "0.2rem 0" }}>
                    <span className={r.active ? "badge badge-info" : "badge"}>
                      {describeRrule(r.rrule)} · {r.timezone}
                    </span>
                    {r.active ? (
                      <span className="muted">next: {r.nextRunAt ? new Date(r.nextRunAt).toLocaleString() : "—"}</span>
                    ) : (
                      <span className="muted">paused</span>
                    )}
                    {canManage && (
                      <>
                        <button className="btn btn-sm" onClick={() => toggleRule.mutate(r)}>
                          {r.active ? "Pause" : "Resume"}
                        </button>
                        <ConfirmButton
                          label="Remove"
                          confirmLabel="Remove this schedule?"
                          onConfirm={() => removeRule.mutate(r.id)}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {editing && (
        <TemplateFormDialog
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {scheduling && (
        <RecurrenceDialog template={scheduling} onClose={() => setScheduling(null)} />
      )}
    </>
  );
}

function TemplateFormDialog({
  template,
  onClose,
}: {
  template: TaskTemplate | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(template?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [reminders, setReminders] = useState(new Set(template?.reminderOffsetsMinutes ?? []));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        description: description || undefined,
        reminderOffsetsMinutes: [...reminders],
      };
      return template
        ? api(`/task-templates/${template.id}`, { method: "PATCH", body })
        : api("/task-templates", { method: "POST", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Dialog title={template ? "Edit template" : "New template"} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label>Description / SOP</label>
          <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Default reminders (before due)</label>
          <div className="checkbox-grid">
            {REMINDER_PRESETS.map((p) => (
              <label key={p.minutes}>
                <input
                  type="checkbox"
                  checked={reminders.has(p.minutes)}
                  onChange={() =>
                    setReminders((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.minutes)) next.delete(p.minutes);
                      else next.add(p.minutes);
                      return next;
                    })
                  }
                />
                {p.label}
              </label>
            ))}
          </div>
        </div>
        <ErrorText error={save.error} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RecurrenceDialog({
  template,
  onClose,
}: {
  template: TaskTemplate;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const members = useMembers();
  const organization = useOrganization();
  const [freq, setFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [time, setTime] = useState("09:00");
  const [weekdays, setWeekdays] = useState(new Set<string>(["MO"]));
  const [monthDay, setMonthDay] = useState(1);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [memberIds, setMemberIds] = useState(new Set<string>());
  const [departmentIds, setDepartmentIds] = useState(new Set<string>());

  const departments =
    organization.data?.locations.flatMap((l) =>
      l.departments.map((d) => ({ ...d, locationName: l.name })),
    ) ?? [];

  function buildRrule(): string {
    const [hour, minute] = time.split(":").map(Number);
    const base = `BYHOUR=${hour};BYMINUTE=${minute}`;
    if (freq === "DAILY") return `FREQ=DAILY;${base}`;
    if (freq === "WEEKLY") return `FREQ=WEEKLY;BYDAY=${[...weekdays].join(",")};${base}`;
    return `FREQ=MONTHLY;BYMONTHDAY=${monthDay};${base}`;
  }

  const save = useMutation({
    mutationFn: () =>
      api("/recurrence-rules", {
        method: "POST",
        body: {
          templateId: template.id,
          rrule: buildRrule(),
          timezone,
          assigneeMembershipIds: [...memberIds],
          assigneeDepartmentIds: [...departmentIds],
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recurrence-rules"] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const toggleIn = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <Dialog title={`Schedule "${template.title}"`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <div className="field">
            <label>Repeats</label>
            <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
          <div className="field">
            <label>Due time</label>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        {freq === "WEEKLY" && (
          <div className="field">
            <label>On days</label>
            <div className="row">
              {WEEKDAYS.map(([code, label]) => (
                <label key={code} className="row small" style={{ gap: "0.25rem" }}>
                  <input
                    type="checkbox"
                    checked={weekdays.has(code)}
                    onChange={() => setWeekdays((w) => toggleIn(w, code) as Set<string>)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}
        {freq === "MONTHLY" && (
          <div className="field">
            <label>Day of month</label>
            <input
              className="input"
              type="number"
              min={1}
              max={31}
              value={monthDay}
              onChange={(e) => setMonthDay(Number(e.target.value))}
            />
          </div>
        )}
        <div className="field">
          <label>Timezone</label>
          <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
        </div>
        <div className="field">
          <label>Assign to people</label>
          <div className="checkbox-grid">
            {(members.data ?? []).map((m) => (
              <label key={m.membershipId}>
                <input
                  type="checkbox"
                  checked={memberIds.has(m.membershipId)}
                  onChange={() => setMemberIds((s) => toggleIn(s, m.membershipId))}
                />
                {m.user.name}
              </label>
            ))}
          </div>
        </div>
        {departments.length > 0 && (
          <div className="field">
            <label>Assign to departments</label>
            <div className="checkbox-grid">
              {departments.map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={departmentIds.has(d.id)}
                    onChange={() => setDepartmentIds((s) => toggleIn(s, d.id))}
                  />
                  {d.locationName} / {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <ErrorText error={save.error} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={save.isPending || (memberIds.size === 0 && departmentIds.size === 0)}
          >
            {save.isPending ? "Saving…" : "Create schedule"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
