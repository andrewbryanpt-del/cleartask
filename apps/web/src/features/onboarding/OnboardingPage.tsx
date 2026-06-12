import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useSession } from "../auth/session";
import { ErrorText } from "../../components/ui";

const STEPS = ["Business details", "Company logo", "First department"];

export function OnboardingPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const [details, setDetails] = useState({
    name: session.currentOrg?.name ?? "",
    industry: session.currentOrg?.industry ?? "",
    address: "",
    phone: "",
    website: "",
  });
  const [logoPreview, setLogoPreview] = useState<string | null>(
    session.currentOrg?.logoUrl ?? null,
  );
  const [team, setTeam] = useState({ locationName: "Main Location", departmentName: "" });
  const logoInput = useRef<HTMLInputElement>(null);

  const setD = (key: keyof typeof details) => (e: { target: { value: string } }) =>
    setDetails((d) => ({ ...d, [key]: e.target.value }));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function submitDetails(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api("/organization", {
        method: "PATCH",
        body: {
          name: details.name,
          industry: details.industry || null,
          address: details.address || null,
          phone: details.phone || null,
          website: details.website || null,
        },
      });
      setStep(1);
    });
  }

  function onLogoPicked(file: File) {
    void run(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api<{ logoUrl: string }>("/organization/logo", {
        method: "POST",
        formData,
      });
      setLogoPreview(res.logoUrl);
    });
  }

  function submitDepartment(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const location = await api<{ id: string }>("/locations", {
        method: "POST",
        body: { name: team.locationName },
      });
      await api("/departments", {
        method: "POST",
        body: { locationId: location.id, name: team.departmentName },
      });
      await api("/organization/complete-onboarding", { method: "POST" });
      await session.reloadSession();
      navigate("/dashboard", { replace: true });
    });
  }

  function finishFromLogoStep() {
    setError(null);
    setStep(2);
  }

  return (
    <div className="auth-page">
      <div className="auth-card wizard">
        <div className="brand">✓ Task Tracker</div>
        <h1 style={{ textAlign: "center", fontSize: "1.2rem" }}>
          Welcome, {session.user?.name?.split(" ")[0]}! Let's set up{" "}
          {details.name || "your business"}.
        </h1>

        <div className="wizard-steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`wizard-step ${i === step ? "current" : ""} ${i < step ? "done" : ""}`}
            >
              <span className="wizard-dot">{i < step ? "✓" : i + 1}</span>
              <span className="wizard-label">{label}</span>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ textAlign: "center" }}>
          Step {step + 1} of {STEPS.length}
        </p>

        {step === 0 && (
          <form onSubmit={submitDetails}>
            <div className="field">
              <label>Business name</label>
              <input className="input" value={details.name} onChange={setD("name")} required />
            </div>
            <div className="field">
              <label>Industry</label>
              <input
                className="input"
                value={details.industry}
                onChange={setD("industry")}
                placeholder="Hospitality, retail, healthcare…"
              />
            </div>
            <div className="field">
              <label>Business address</label>
              <input className="input" value={details.address} onChange={setD("address")} />
            </div>
            <div className="field">
              <label>Phone number</label>
              <input className="input" type="tel" value={details.phone} onChange={setD("phone")} />
            </div>
            <div className="field">
              <label>Website (optional)</label>
              <input
                className="input"
                type="url"
                placeholder="https://example.com"
                value={details.website}
                onChange={setD("website")}
              />
            </div>
            <ErrorText error={error} />
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {step === 1 && (
          <div className="stack" style={{ textAlign: "center" }}>
            <p className="muted">
              Add your logo — it appears on the app header and your reports.
            </p>
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Company logo"
                style={{ maxWidth: 140, maxHeight: 140, margin: "0 auto", borderRadius: 12 }}
              />
            ) : (
              <div className="wizard-logo-placeholder">No logo yet</div>
            )}
            <ErrorText error={error} />
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => logoInput.current?.click()} disabled={busy}>
                {busy ? "Uploading…" : logoPreview ? "Replace logo" : "Upload logo"}
              </button>
              <button className="btn btn-primary" onClick={finishFromLogoStep} disabled={busy}>
                {logoPreview ? "Continue" : "Skip for now"}
              </button>
            </div>
            <input
              ref={logoInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onLogoPicked(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {step === 2 && (
          <form onSubmit={submitDepartment}>
            <p className="muted small">
              Tasks are organized by department within a location — you can add
              more of both at any time under Admin.
            </p>
            <div className="field">
              <label>Location name</label>
              <input
                className="input"
                value={team.locationName}
                onChange={(e) => setTeam((t) => ({ ...t, locationName: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Your first department</label>
              <input
                className="input"
                placeholder="Housekeeping, Front Desk, Kitchen…"
                value={team.departmentName}
                onChange={(e) => setTeam((t) => ({ ...t, departmentName: e.target.value }))}
                required
              />
            </div>
            <ErrorText error={error} />
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? "Finishing up…" : "Finish setup →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
