import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSession } from "../features/auth/session";
import { AnnouncementsNoticeboard } from "../features/announcements/AnnouncementsPage";
import { Logo } from "../components/Logo";
import {
  IconBell,
  IconBuilding,
  IconChart,
  IconClose,
  IconDashboard,
  IconMegaphone,
  IconMenu,
  IconSettings,
  IconShield,
  IconTasks,
  IconTemplate,
} from "../components/icons";

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
    <button
      className="icon-btn topbar-bell"
      onClick={() => navigate("/notifications")}
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
    >
      <IconBell width={20} height={20} />
      {unread > 0 && <span className="dot">{unread > 99 ? "99+" : unread}</span>}
    </button>
  );
}

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  show: boolean;
};

export function Shell() {
  const session = useSession();
  const org = session.currentOrg;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const unrestricted = !session.isRestricted;
  const links: NavItem[] = [
    { to: "/dashboard", label: "Dashboard", icon: <IconDashboard />, show: true },
    { to: "/tasks", label: "Tasks", icon: <IconTasks />, show: true },
    { to: "/announcements", label: "Announcements", icon: <IconMegaphone />, show: true },
    { to: "/templates", label: "Templates", icon: <IconTemplate />, show: unrestricted },
    {
      to: "/reports",
      label: "Reports",
      icon: <IconChart />,
      show:
        unrestricted &&
        (session.can("dashboard.org") || session.can("report.export") || session.can("audit.view")),
    },
    {
      to: "/admin",
      label: "Admin",
      icon: <IconShield />,
      show:
        unrestricted &&
        (session.can("org.manage") ||
          session.can("member.manage") ||
          session.can("member.invite") ||
          session.can("role.manage")),
    },
    {
      to: "/organisation",
      label: "Organisation",
      icon: <IconBuilding />,
      show: session.currentOrg?.isOwner === true,
    },
    { to: "/settings", label: "Settings", icon: <IconSettings />, show: true },
  ].filter((l) => l.show);

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <>
      <AnnouncementsNoticeboard />
      <div className="app-shell">
        {sidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close menu"
            onClick={closeSidebar}
          />
        )}

        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-brand">
            <Logo variant="light" />
            <button
              type="button"
              className="icon-btn sidebar-close mobile-only"
              aria-label="Close menu"
              onClick={closeSidebar}
            >
              <IconClose width={20} height={20} />
            </button>
          </div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                onClick={closeSidebar}
              >
                <span className="sidebar-link-icon">{l.icon}</span>
                <span className="sidebar-link-label">{l.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-org">
              <span className="sidebar-org-label">Workspace</span>
              <span className="sidebar-org-name">{org?.name ?? "ClearTask"}</span>
            </div>
          </div>
        </aside>

        <div className="app-main">
          <header className="topbar">
            <button
              type="button"
              className="icon-btn mobile-only"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <IconMenu width={22} height={22} />
            </button>

            <div className="topbar-heading">
              <span className="topbar-app">ClearTask</span>
              {org && <span className="topbar-org">{org.name}</span>}
            </div>

            <span className="spacer" />

            {session.organizations.length > 1 && (
              <select
                className="input input-compact topbar-org-select"
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

          <main className="page">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
