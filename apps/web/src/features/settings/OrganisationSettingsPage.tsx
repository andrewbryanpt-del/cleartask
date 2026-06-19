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

  const [detailsForm, setDetailsForm] = useState<{
    name: string;
    industry: string;
    address: string;
    phone: string;
    website: string;
  } | null>(null);
  const [detailsSaved, setDetailsSaved] = useState(false);

  const [escalationDays, setEscalationDays] = useState<string | null>(null);
  const [escalationSaved, setEscalationSaved] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["organization"] });
    void session.reloadSession();
  };

  const saveDetails = useMutation({
    mutationFn: (body: Record<string, string | null>) =>
      api("/organization", { method: "PATCH", body }),
    onSuccess: () => {
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 2500);
      invalidate();
    },
  });

  const saveEscalation = useMutation({
    mutationFn: (body: { overdueEscalationDays: number | null }) =>
      api("/organization", { method: "PATCH", body }),
    onSuccess: () => {
      setEscalationSaved(true);
      setTimeout(() => setEscalationSaved(false), 2500);
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

  const details = detailsForm ?? {
    name: org.name,
    industry: org.industry ?? "",
    address: org.address ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
  };
  const setDetail =
    (key: keyof typeof details) => (e: { target: { value: string } }) =>
      setDetailsForm({ ...details, [key]: e.target.value });

  const currentEscalationDays =
    escalationDays ?? (org.overdueEscalationDays != null ? String(org.overdueEscalationDays) : "");

  function onSubmitDetails(e: FormEvent) {
    e.preventDefault();
    saveDetails.mutate({
      name: details.name,
      industry: details.industry || null,
      address: details.address || null,
      phone: details.phone || null,
      website: details.website || null,
    });
  }

  function onSubmitEscalation(e: FormEvent) {
    e.preventDefault();
    const days = parseInt(currentEscalationDays, 10);
    saveEscalation.mutate({
      overdueEscalationDays: currentEscalationDays && !isNaN(days) ? days : null,
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
        <h2>Escalation settings</h2>
        <form onSubmit={onSubmitEscalation}>
          <div className="field">
            <label>Escalate overdue tasks to me after</label>
            <div className="row" style={{ alignItems: "center", gap: 8 }}>
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                placeholder="—"
                value={currentEscalationDays}
                onChange={(e) => setEscalationDays(e.target.value)}
                style={{ maxWidth: 80 }}
              />
              <span>days</span>
            </div>
          </div>
          <ErrorText error={saveEscalation.error} />
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={saveEscalation.isPending}>
              {saveEscalation.isPending ? "Saving…" : "Save"}
            </button>
            {escalationSaved && <span className="badge badge-success">Saved</span>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Business details</h2>
        <form onSubmit={onSubmitDetails}>
          <div className="form-row">
            <div className="field">
              <label>Business name</label>
              <input className="input" value={details.name} onChange={setDetail("name")} required />
            </div>
            <div className="field">
              <label>Industry</label>
              <input
                className="input"
                value={details.industry}
                onChange={setDetail("industry")}
                placeholder="Hospitality, retail, healthcare…"
              />
            </div>
            <div className="field">
              <label>Address</label>
              <input className="input" value={details.address} onChange={setDetail("address")} />
            </div>
            <div className="field">
              <label>Phone number</label>
              <input className="input" type="tel" value={details.phone} onChange={setDetail("phone")} />
            </div>
            <div className="field">
              <label>Website</label>
              <input
                className="input"
                type="url"
                placeholder="https://example.com"
                value={details.website}
                onChange={setDetail("website")}
              />
            </div>
          </div>
          <ErrorText error={saveDetails.error} />
          <div className="row">
            <button className="btn btn-primary" disabled={saveDetails.isPending}>
              {saveDetails.isPending ? "Saving…" : "Save changes"}
            </button>
            {detailsSaved && <span className="badge badge-success">Saved</span>}
          </div>
        </form>
      </div>
    </>
  );
}
