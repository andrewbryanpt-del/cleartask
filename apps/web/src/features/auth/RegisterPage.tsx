import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { registerSchema } from "@task-tracker/shared";
import { useSession } from "./session";
import { ErrorText } from "../../components/ui";
import { Logo } from "../../components/Logo";

export function RegisterPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    businessName: "",
    industry: "",
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === "authenticated") return <Navigate to="/dashboard" replace />;

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((i) => i.message).join(" ")));
      setBusy(false);
      return;
    }
    try {
      await session.register({
        businessName: parsed.data.businessName,
        industry: parsed.data.industry,
        name: parsed.data.name,
        email: parsed.data.email,
        password: parsed.data.password,
      });
      navigate("/dashboard");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" noValidate onSubmit={onSubmit}>
        <div className="auth-logo-wrap">
          <Logo variant="dark" />
        </div>
        <p className="auth-tagline">Create your ClearTask workspace</p>
        <div className="field">
          <label htmlFor="businessName">Business name</label>
          <input id="businessName" className="input" value={form.businessName} onChange={set("businessName")} required />
        </div>
        <div className="field">
          <label htmlFor="industry">Industry (optional)</label>
          <input id="industry" className="input" value={form.industry} onChange={set("industry")} placeholder="Hospitality, retail, …" />
        </div>
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" className="input" autoComplete="name" value={form.name} onChange={set("name")} required />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="text" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={form.email} onChange={set("email")} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password (min 8 characters, symbols allowed)</label>
          <input id="password" className="input" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={form.password} onChange={set("password")} required />
        </div>
        <ErrorText error={error} />
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
        <p className="small muted" style={{ textAlign: "center", marginTop: "1rem" }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
