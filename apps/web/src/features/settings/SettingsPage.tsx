import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import type { RegisterPushDeviceInput } from "@task-tracker/shared";
import { api } from "../../lib/api";
import { enablePush } from "../../lib/push";
import { useSession } from "../auth/session";
import { ErrorText } from "../../components/ui";
import { AuthImage } from "../../components/AuthImage";

export function SettingsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState(session.user?.name ?? "");
  const [pushState, setPushState] = useState<"idle" | "busy" | "enabled" | "failed">("idle");
  const avatarInput = useRef<HTMLInputElement>(null);

  const saveProfile = useMutation({
    mutationFn: () => api("/me", { method: "PATCH", body: { name } }),
    onSuccess: () => void session.reloadSession(),
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api("/me/avatar", { method: "POST", formData });
    },
    onSuccess: () => void session.reloadSession(),
  });

  async function onEnablePush() {
    setPushState("busy");
    try {
      const ok = await enablePush({
        register: (input: RegisterPushDeviceInput) =>
          api("/push-devices", { method: "POST", body: input }).then(() => undefined),
        getVapidPublicKey: () =>
          api<{ publicKey: string | null }>("/push/vapid-public-key").then((r) => r.publicKey),
      });
      setPushState(ok ? "enabled" : "failed");
    } catch {
      setPushState("failed");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveProfile.mutate();
  }

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card">
        <h2>Profile</h2>
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          {session.user?.avatarUrl ? (
            <AuthImage
              src={session.user.avatarUrl}
              alt={`${session.user.name}'s profile photo`}
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <span
              className="muted"
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.4rem",
                fontWeight: 700,
              }}
            >
              {session.user?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          )}
        </div>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <div className="field">
              <label>Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" value={session.user?.email ?? ""} disabled />
            </div>
          </div>
          <ErrorText error={saveProfile.error ?? uploadAvatar.error} />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Saving…" : "Save profile"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => avatarInput.current?.click()}
              disabled={uploadAvatar.isPending}
            >
              {uploadAvatar.isPending ? "Uploading…" : "Change avatar"}
            </button>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Notifications</h2>
        <p className="small muted">
          Get task assignments, reminders, and overdue alerts on this device.
        </p>
        <div className="row">
          <button className="btn" onClick={() => void onEnablePush()} disabled={pushState === "busy"}>
            {pushState === "busy" ? "Enabling…" : "Enable push notifications"}
          </button>
          {pushState === "enabled" && <span className="badge badge-success">Enabled on this device</span>}
          {pushState === "failed" && (
            <span className="badge badge-warning">
              Not available (denied, unsupported, or not configured)
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Session</h2>
        <p className="small muted">
          Signed in as {session.user?.email}
          {session.currentOrg ? ` — ${session.currentOrg.name}` : ""}
          {session.currentOrg?.roleName ? ` (${session.currentOrg.roleName})` : ""}
        </p>
        <button
          className="btn btn-danger"
          onClick={() => {
            void session.logout().then(() => navigate("/login"));
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
