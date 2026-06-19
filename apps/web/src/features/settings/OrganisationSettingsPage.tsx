import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useOrganization } from "../../lib/queries";
import { useSession } from "../auth/session";
import { ErrorText, Spinner } from "../../components/ui";
import { AuthImage } from "../../components/AuthImage";

// Owner-only: business identity lives here, not in Admin. The API enforces
// this with requireOwner — the route guard is just the polite version.
export function OrganisationSettingsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const organization = useOrganization();
  const logoInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<{
    name: string;
    industry: string;
    address: string;
    phone: string;
    website: string;
    overdueEscalationDays: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["organization"] });
    void session.reloadSession();
  };

  const save = useMutation({
    mutationFn: (body: Record<string, string | number | null>) =>
      api("/organization", { method: "PATCH", body }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      invalidate();
    },
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api<{ logoUrl: string }>("/organization/logo", {
        method: "POST",
        formData,
      });
    },
    onSuccess: invalidate,
  });

  if (organization.isLoading) return <Spinner />;
  if (!organization.data) return <ErrorText error={organization.error} />;
  const org = organization.data;
  const values = form ?? {
    name: org.name,
    industry: org.industry ?? "",
    address: org.address ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
    overdueEscalationDays:
      org.overdueEscalationDays != null
        ? String(org.overdueEscalationDays)
        : "",
  };

  const set =
    (key: keyof typeof values) => (e: { target: { value: string } }) =>
      setForm({ ...values, [key]: e.target.value });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const days = parseInt(values.overdueEscalationDays, 10);
    save.mutate({
      name: values.name,
      industry: values.industry || null,
      address: values.address || null,
      phone: values.phone || null,
      website: values.website || null,
      overdueEscalationDays:
        values.overdueEscalationDays && !isNaN(days) ? days : null,
    });
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Organisation settings</h1>
          <p className="small muted" style={{ margin: 0 }}>
            Only you, the account owner, can see and change these details.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Company logo</h2>
        <div className="row">
          {org.logoUrl ? (
            <AuthImage
              src={org.logoUrl}
              alt={`${org.name} logo`}
              style={{ maxWidth: 96, maxHeight: 96, borderRadius: 10 }}
            />
          ) : (
            <span className="muted small">No logo uploaded yet.</span>
          )}
          <button
            className="btn"
            onClick={() => logoInput.current?.click()}
            disabled={uploadLogo.isPending}
          >
            {uploadLogo.isPending
              ? "Uploading…"
              : org.logoUrl
                ? "Replace logo"
                : "Upload logo"}
          </button>
          <input
            ref={logoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadLogo.mutate(file);
              e.target.value = "";
            }}
          />
        </div>
        <ErrorText error={uploadLogo.error} />
      </div>

      <div className="card">
        <h2>Overdue escalation</h2>
        <p className="small muted" style={{ marginTop: 0 }}>
          Notify you when a task is still incomplete this many days after its
          due date. Leave blank to disable escalation notifications.
        </p>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <div className="field">
              <label>Days after due date</label>
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                placeholder="e.g. 3"
                value={values.overdueEscalationDays}
                onChange={set("overdueEscalationDays")}
                style={{ maxWidth: 140 }}
              />
            </div>
          </div>
          <ErrorText error={save.error} />
          <div className="row">
            <button className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="badge badge-success">Saved</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Business details</h2>
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <div className="field">
              <label>Business name</label>
              <input className="input" value={values.name} onChange={set("name")} required />
            </div>
            <div className="field">
              <label>Industry</label>
              <input
                className="input"
                value={values.industry}
                onChange={set("industry")}
                placeholder="Hospitality, retail, healthcare…"
              />
            </div>
            <div className="field">
              <label>Address</label>
              <input className="input" value={values.address} onChange={set("address")} />
            </div>
            <div className="field">
              <label>Phone number</label>
              <input className="input" type="tel" value={values.phone} onChange={set("phone")} />
            </div>
            <div className="field">
              <label>Website</label>
              <input
                className="input"
                type="url"
                placeholder="https://example.com"
                value={values.website}
                onChange={set("website")}
              />
            </div>
          </div>
          <ErrorText error={save.error} />
          <div className="row">
            <button className="btn btn-primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="badge badge-success">Saved</span>}
          </div>
        </form>
      </div>
    </>
  );
}
