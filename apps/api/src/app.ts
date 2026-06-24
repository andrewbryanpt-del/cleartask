import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { env } from "./config/env";
import errorHandler from "./plugins/error-handler";
import authPlugin from "./plugins/auth";
import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import organizationsRoutes from "./modules/organizations/organizations.routes";
import rolesRoutes from "./modules/roles/roles.routes";
import invitationsRoutes from "./modules/invitations/invitations.routes";
import locationsRoutes from "./modules/locations/locations.routes";
import departmentsRoutes from "./modules/departments/departments.routes";
import auditRoutes from "./modules/audit/audit.routes";
import filesRoutes from "./modules/attachments/files.routes";
import attachmentsRoutes from "./modules/attachments/attachments.routes";
import tasksRoutes from "./modules/tasks/tasks.routes";
import taskTemplatesRoutes from "./modules/task-templates/task-templates.routes";
import recurrenceRoutes from "./modules/recurrence/recurrence.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import pushRoutes from "./modules/push/push.routes";
import announcementsRoutes from "./modules/announcements/announcements.routes";

/** Capacitor/Cordova WebView origins — not covered by WEB_ORIGIN alone. */
const NATIVE_WEBVIEW_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const webOrigin = env.WEB_ORIGIN.replace(/\/$/, "");
  if (origin === webOrigin || origin === env.WEB_ORIGIN) return true;
  return NATIVE_WEBVIEW_ORIGINS.has(origin);
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  await app.register(cors, {
    origin(origin, cb) {
      cb(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  await app.register(errorHandler);
  await app.register(authPlugin);

  app.get("/api/v1/health", async () => ({ ok: true }));

  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  for (const routes of [
    usersRoutes,
    organizationsRoutes,
    rolesRoutes,
    invitationsRoutes,
    locationsRoutes,
    departmentsRoutes,
    auditRoutes,
    filesRoutes,
    attachmentsRoutes,
    tasksRoutes,
    taskTemplatesRoutes,
    recurrenceRoutes,
    notificationsRoutes,
    dashboardRoutes,
    reportsRoutes,
    pushRoutes,
    announcementsRoutes,
  ]) {
    await app.register(routes, { prefix: "/api/v1" });
  }

  return app;
}
