import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useSession } from "./session";
import { ErrorText, Spinner } from "../../components/ui";
import { Logo } from "../../components/Logo";

interface InviteInfo {
  email: string;
  organizationName: string;
  roleName: string | null;
  accountExists: boolean;
}

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const info = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<InviteInfo>("/invitations/info", { query: { token } }),
    retry: false,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/invitations/accept", {
        method: "POST",
        body: {
          token,
          ...(info.data?.accountExists ? { password } : { name, password }),
        },
      });
      if (session.status === "authenticated") {
        await session.reloadSession();
        navigate("/dashboard");
      } else if (info.data) {
        await session.login(info.data.email, password);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (info.isLoading) return <Spinner />;
  if (info.isError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo-wrap">
            <Logo variant="dark" />
          </div>
          <ErrorText error={info.error} />
          <p className="small muted">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  const data = info.data!;
  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-logo-wrap">
          <Logo variant="dark" />
        </div>
        <p className="auth-tagline">Accept your invitation</p>
        <p>
          You've been invited to join <strong>{data.organizationName}</strong>
          {data.roleName ? ` as ${data.roleName}` : ""} ({data.email}).
        </p>
        {!data.accountExists && (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label htmlFor="password">
            {data.accountExists ? "Your password" : "Choose a password (min 8 characters)"}
          </label>
          <input
            id="password"
            className="input"
            type="password"
            minLength={data.accountExists ? 1 : 8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <ErrorText error={error} />
        <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>
          {busy ? "Joining…" : `Join ${data.organizationName}`}
        </button>
      </form>
    </div>
  );
}
