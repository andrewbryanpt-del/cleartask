import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSession } from "../features/auth/session";

function NotificationBell() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () =>
      api<{ unreadCount: number }>("/notifications", { query: { limit: 1 } }),
    refetchInterval: 30_000,
  });
  const unread = data?.unreadCount ?? 0;
  return (
    <button className="bell" onClick={() => navigate("/notifications")} aria-label="Notifications">
      🔔
      {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}

export function Shell() {
  const session = useSession();
  const org = session.currentOrg;

  const unrestricted = !session.isRestricted;
  const links = [
    { to: "/dashboard", label: "Dashboard", show: true },
    { to: "/tasks", label: "Tasks", show: true },
    { to: "/templates", label: "Templates", show: unrestricted },
    {
      to: "/reports",
      label: "Reports",
      show:
        unrestricted &&
        (session.can("dashboard.org") || session.can("report.export") || session.can("audit.view")),
    },
    {
      to: "/admin",
      label: "Admin",
      show:
        unrestricted &&
        (session.can("org.manage") ||
          session.can("member.manage") ||
          session.can("member.invite") ||
          session.can("role.manage")),
    },
    { to: "/settings", label: "Settings", show: true },
  ].filter((l) => l.show);

  return (
    <>
      <header className="shell-header">
        <span className="brand">✓ {org?.name ?? "Task Tracker"}</span>
        <span className="spacer" />
        {session.organizations.length > 1 && (
          <select
            className="input"
            style={{ width: "auto" }}
            value={org?.id ?? ""}
            onChange={(e) => session.switchOrg(e.target.value)}
            aria-label="Switch organization"
          >
            {session.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <NotificationBell />
      </header>
      <nav className="shell-nav">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? "active" : "")}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
