import { createBrowserRouter, Navigate } from "react-router-dom";
import { Shell } from "./Shell";
import {
  RequireAuth,
  RequireOwner,
  RequirePermission,
  RequireUnrestricted,
} from "./guards";
import { OrganisationSettingsPage } from "../features/settings/OrganisationSettingsPage";
import { LoginPage } from "../features/auth/LoginPage";
import { OnboardingPage } from "../features/onboarding/OnboardingPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { InvitePage } from "../features/auth/InvitePage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { TasksPage } from "../features/tasks/TasksPage";
import { TaskDetailPage } from "../features/tasks/TaskDetailPage";
import { TemplatesPage } from "../features/tasks/TemplatesPage";
import { NotificationsPage } from "../features/notifications/NotificationsPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { AdminPage } from "../features/admin/AdminPage";
import { SettingsPage } from "../features/settings/SettingsPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/invite/:token", element: <InvitePage /> },
  {
    path: "/onboarding",
    element: (
      <RequireAuth>
        <OnboardingPage />
      </RequireAuth>
    ),
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Shell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/:taskId", element: <TaskDetailPage /> },
      {
        path: "templates",
        element: (
          <RequireUnrestricted>
            <TemplatesPage />
          </RequireUnrestricted>
        ),
      },
      { path: "notifications", element: <NotificationsPage /> },
      {
        path: "reports",
        element: (
          <RequirePermission anyOf={["dashboard.org", "report.export", "audit.view"]}>
            <ReportsPage />
          </RequirePermission>
        ),
      },
      {
        path: "admin",
        element: (
          <RequirePermission
            anyOf={["org.manage", "member.manage", "member.invite", "role.manage"]}
          >
            <AdminPage />
          </RequirePermission>
        ),
      },
      { path: "settings", element: <SettingsPage /> },
      {
        path: "organisation",
        element: (
          <RequireOwner>
            <OrganisationSettingsPage />
          </RequireOwner>
        ),
      },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
