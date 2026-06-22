import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { localInputToIso, REMINDER_PRESETS } from "../../lib/format";
import { useMembers, useOrganization, useTemplates } from "../../lib/queries";
import { Dialog, ErrorText } from "../../components/ui";
import type { TaskDetail } from "./types";

export function TaskFormDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (taskId: string) => void;
}) {
  const queryClient = useQueryClient();
  const organization = useOrganization();
  const members = useMembers();
  const templates = useTemplates();

  const [form, setForm] = useState({
    templateId: "",
    title: "",
    description: "",
    priority: "NORMAL" as "URGENT" | "HIGH" | "NORMAL" | "LOW",
    dueAt: "",
    departmentId: "",
    reminders: new Set<number>(),
    assigneeMembershipIds: new Set<string>(),
    assigneeDepartmentIds: new Set<string>(),
  });

  const departments =
    organization.data?.locations.flatMap((l) =>
      l.departments.map((d) => ({ ...d, locationName: l.name })),
    ) ?? [];
  const selectedTemplate = templates.data?.find((t) => t.id === form.templateId);

  const create = useMutation({
    mutationFn: () =>
      api<TaskDetail>("/tasks", {
        method: "POST",
        body: {
          templateId: form.templateId || undefined,
          title: form.title || undefined,
          description: form.description || undefined,
          priority: form.priority,
          dueAt: localInputToIso(form.dueAt),
          departmentId: form.departmentId || undefined,
          reminderOffsetsMinutes: form.reminders.size ? [...form.reminders] : undefined,
          assigneeMembershipIds: [...form.assigneeMembershipIds],
          assigneeDepartmentIds: [...form.assigneeDepartmentIds],
        },
      }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onCreated(task.id);
    },
  });

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <Dialog title="New task" onClose={onClose}>
      <form onSubmit={onSubmit}>
        {(templates.data?.length ?? 0) > 0 && (
          <div className="field">
            <label>Start from template</label>
            <select
              className="input"
              value={form.templateId}
              onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
            >
              <option value="">— blank task —</option>
              {templates.data!.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Title{selectedTemplate ? " (template default if empty)" : ""}</label>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={selectedTemplate?.title}
            required={!form.templateId}
          />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea
            className="input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label>Priority</label>
            <select
              className="input"
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: e.target.value as typeof f.priority,
                }))
              }
            >
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="NORMAL">Normal</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div className="field">
            <label>Due</label>
            <input
              className="input"
              type="datetime-local"
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
            />
          </div>
        </div>
        <div className="field">
          <label>Department (scope)</label>
          <select
            className="input"
            value={form.departmentId}
            onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
          >
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.locationName} / {d.name}
              </option>
            ))}
          </select>
        </div>
        {form.dueAt && (
          <div className="field">
            <label>Reminders</label>
            <div className="checkbox-grid">
              {REMINDER_PRESETS.map((p) => (
                <label key={p.minutes}>
                  <input
                    type="checkbox"
                    checked={form.reminders.has(p.minutes)}
                    onChange={() =>
                      setForm((f) => ({ ...f, reminders: toggle(f.reminders, p.minutes) }))
                    }
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>Assign to people</label>
          <div className="checkbox-grid">
            {(members.data ?? []).map((m) => (
              <label key={m.membershipId}>
                <input
                  type="checkbox"
                  checked={form.assigneeMembershipIds.has(m.membershipId)}
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      assigneeMembershipIds: toggle(f.assigneeMembershipIds, m.membershipId),
                    }))
                  }
                />
                {m.user.name}
              </label>
            ))}
          </div>
        </div>
        {departments.length > 0 && (
          <div className="field">
            <label>Assign to whole departments</label>
            <div className="checkbox-grid">
              {departments.map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={form.assigneeDepartmentIds.has(d.id)}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        assigneeDepartmentIds: toggle(f.assigneeDepartmentIds, d.id),
                      }))
                    }
                  />
                  {d.locationName} / {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <ErrorText error={create.error} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
