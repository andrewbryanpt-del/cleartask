import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PERMISSIONS, ALL_PERMISSIONS, type Permission } from "@task-tracker/shared";
import { api } from "../../lib/api";
import { useRoles, type Role } from "../../lib/queries";
import { ConfirmButton, Dialog, ErrorText, Spinner } from "../../components/ui";

export function RolesTab() {
  const queryClient = useQueryClient();
  const roles = useRoles();
  const [editing, setEditing] = useState<Role | "new" | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["roles"] }),
  });

  if (roles.isLoading) return <Spinner />;

  return (
    <>
      <div className="card">
        <div className="row" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Roles</h2>
          <span className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            + New role
          </button>
        </div>
        <p className="small muted">
          Roles are custom per business — pick exactly the permissions each role needs.
          The account owner always has every permission.
        </p>
        <ErrorText error={roles.error ?? remove.error} />
        {roles.data?.map((r) => (
          <div key={r.id} className="row" style={{ padding: "0.45rem 0", borderTop: "1px solid var(--border)" }}>
            <div>
              <strong>{r.name}</strong>
              {r.description && <div className="small muted">{r.description}</div>}
              <div className="small muted">{r.permissions.length} permission(s)</div>
            </div>
            <span className="spacer" />
            <span className="badge">{r.memberCount} member(s)</span>
            <button className="btn btn-sm" onClick={() => setEditing(r)}>Edit</button>
            <ConfirmButton
              label="Delete"
              confirmLabel={`Delete role "${r.name}"?`}
              onConfirm={() => remove.mutate(r.id)}
              disabled={r.memberCount > 0}
            />
          </div>
        ))}
      </div>
      {editing && (
        <RoleFormDialog role={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function RoleFormDialog({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState(new Set<Permission>(role?.permissions as Permission[] ?? []));

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || undefined, permissions: [...selected] };
      return role
        ? api(`/roles/${role.id}`, { method: "PATCH", body })
        : api("/roles", { method: "POST", body });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Dialog title={role ? `Edit role: ${role.name}` : "New role"} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Permissions</label>
          <div className="checkbox-grid">
            {ALL_PERMISSIONS.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={selected.has(p)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(p)) next.delete(p);
                      else next.add(p);
                      return next;
                    })
                  }
                />
                <span>
                  <code className="small">{p}</code>
                  <br />
                  <span className="small muted">{PERMISSIONS[p]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <ErrorText error={save.error} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save role"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
