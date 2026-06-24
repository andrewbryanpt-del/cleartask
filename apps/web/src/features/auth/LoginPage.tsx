import { useState, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@task-tracker/shared";
import { useSession } from "./session";
import { ErrorText } from "../../components/ui";
import { Logo } from "../../components/Logo";

export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (session.status === "authenticated") return <Navigate to="/dashboard" replace />;

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(new Error(parsed.error.issues.map((i) => i.message).join(" ")));
      setBusy(false);
      return;
    }
    try {
      await session.login(parsed.data.email, parsed.data.password);
      navigate((location.state as { from?: string } | null)?.from ?? "/dashboard");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSignIn();
    }
  }

  return (
    <div className="auth-page">
      {/* div, not form — iOS WKWebView still runs native validation on <form noValidate> inputs */}
      <div className="auth-card" role="form" aria-label="Sign in">
        <div className="auth-logo-wrap">
          <Logo variant="dark" />
        </div>
        <p className="auth-tagline">Sign in to your workspace</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="input"
            type="text"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input input-masked"
            type="text"
            name="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <ErrorText error={error} />
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: "100%" }}
          disabled={busy}
          onClick={() => void handleSignIn()}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="small muted" style={{ textAlign: "center", marginTop: "1rem" }}>
          New business? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
