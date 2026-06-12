import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { fmtDate } from "../../lib/format";
import { useMembers, useOrganization, useRoles } from "../../lib/queries";
import { useSession } from "../auth/session";
import { ConfirmButton, Dialog, ErrorText, Spinner } from "../../components/ui";

interface PendingInvite {
  id: string;
  email: string;
  role: { id: string; name: string } | null;
  expiresAt: string;
  createdAt: string;
}

export function MembersTab() {
  const session = useSession();
  const queryClient = useQueryClient();
  const members = useMembers();
  const roles = useRoles();
  const canManage = session.can("member.manage");
  const canInvite = session.can("member.invite");
  const [showInvite, setShowInvite] = useState(false);

  const invites = useQuery({
    queryKey: ["invitations"],
    queryFn: () => api<PendingInvite[]>("/invitations"),
    enabled: canInvite,
  });

  const updateMember = useMutation({
    mutationFn: ({ membershipId, body }: { membershipId: string; body: unknown }) =>
      api(`/members/${membershipId}`, { method: "PATCH", body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
  const removeMember = useMutation({
    mutationFn: (membershipId: string) => api(`/members/${membershipId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["members"] }),
  });
  const revokeInvite = useMutation({
    mutationFn: (id: string) => api(`/invitations/${id}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["invitations"] }),
  });

  if (members.isLoading) return <Spinner />;

  return (
    <>
      <div className="card table-wrap">
        <div className="row" style={{ marginBottom: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>Members</h2>
          <span className="spacer" />
          {canInvite && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)}>
              + Invite
            </button>
          )}
        </div>
        <ErrorText error={members.error ?? updateMember.error ?? removeMember.error} />
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Departments</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.data?.map((m) => (
              <tr key={m.membershipId}>
                <td>
                  <strong>{m.user.name}</strong>
                  <div className="small muted">{m.user.email}</div>
                </td>
                <td>
                  {m.isOwner ? (
                    <span className="badge badge-info">Owner</span>
                  ) : canManage ? (
                    <select
                      className="input"
                      style={{ width: "auto" }}
                      value={m.role?.id ?? ""}
                      onChange={(e) =>
                        updateMember.mutate({
                          membershipId: m.membershipId,
                          body: { roleId: e.target.value || null },
                        })
                      }
                    >
                      <option value="">No role</option>
                      {roles.data?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    (m.role?.name ?? "—")
                  )}
                </td>
                <td className="small">
                  {m.departments.length > 0 ? m.departments.map((d) => d.name).join(", ") : "—"}
                </td>
                <td>
                  {canManage && !m.isOwner && (
                    <ConfirmButton
                      label="Remove"
                      confirmLabel={`Remove ${m.user.name} from the organization?`}
                      onConfirm={() => removeMember.mutate(m.membershipId)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canInvite && (invites.data?.length ?? 0) > 0 && (
        <div className="card table-wrap">
          <h2>Pending invitations</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invites.data!.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.role?.name ?? "—"}</td>
                  <td className="small">{fmtDate(i.expiresAt)}</td>
                  <td>
                    <ConfirmButton
                      label="Revoke"
                      confirmLabel={`Revoke the invitation for ${i.email}?`}
                      onConfirm={() => revokeInvite.mutate(i.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInvite && <InviteDialog onClose={() => setShowInvite(false)} />}
    </>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const roles = useRoles();
  const organization = useOrganization();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentIds, setDepartmentIds] = useState(new Set<string>());

  const departments =
    organization.data?.locations.flatMap((l) =>
      l.departments.map((d) => ({ ...d, locationName: l.name })),
    ) ?? [];

  const invite = useMutation({
    mutationFn: () =>
      api("/invitations", {
        method: "POST",
        body: { email, roleId, departmentIds: [...departmentIds] },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invitations"] });
      onClose();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    invite.mutate();
  }

  return (
    <Dialog title="Invite a team member" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Role</label>
          <select className="input" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
            <option value="">Choose a role…</option>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {(roles.data?.length ?? 0) === 0 && (
            <p className="small muted">No roles yet — create one in the Roles tab first.</p>
          )}
        </div>
        {departments.length > 0 && (
          <div className="field">
            <label>Departments</label>
            <div className="checkbox-grid">
              {departments.map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={departmentIds.has(d.id)}
                    onChange={() =>
                      setDepartmentIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(d.id)) next.delete(d.id);
                        else next.add(d.id);
                        return next;
                      })
                    }
                  />
                  {d.locationName} / {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <ErrorText error={invite.error} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={invite.isPending}>
            {invite.isPending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
