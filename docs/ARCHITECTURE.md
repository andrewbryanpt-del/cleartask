# Task Tracker — Architecture

Industry-agnostic task management SaaS for businesses: web, iOS, and Android.

## High-level shape

A TypeScript monorepo with three workspaces:

```
task-tracker/
├── apps/
│   ├── api/        Node.js (Fastify) REST API + background jobs
│   └── web/        React SPA — also packaged as the iOS/Android app via Capacitor
├── packages/
│   └── shared/     Types, Zod validation schemas, permission constants
│                   shared by API and frontend
└── docs/
```

One React codebase serves web **and** mobile. Capacitor wraps the built web
app in a native shell and exposes native APIs (camera for proof photos, push
notifications). This was chosen over React Native because it halves the
frontend surface to build and maintain — every feature ships to web and both
app stores from a single implementation. If a screen ever needs truly native
performance, individual views can be rebuilt natively later without
re-architecting.

## Stack and why

| Layer | Choice | Why |
|---|---|---|
| API framework | Fastify 5 | Fast, TypeScript-first, schema validation built in |
| ORM | Prisma | Type-safe queries, migrations, works perfectly with Postgres |
| Validation | Zod (in `packages/shared`) | Same schema validates the form on the client and the request on the server |
| Frontend | React 19 + Vite | Modern standard; Vite gives instant dev reload |
| Data fetching | TanStack Query | Caching, optimistic updates, offline-friendly retries |
| Mobile | Capacitor 6 | Single codebase → web + iOS + Android |
| Auth | Email/password (argon2 hash) + JWT access/refresh tokens | Stateless API auth that works identically for web and mobile |
| Background jobs | pg-boss | Cron + delayed jobs stored **in Postgres** — no Redis to operate. Powers recurring tasks, reminders, overdue checks |
| Recurrence | `rrule` (iCalendar RRULE) | Battle-tested daily/weekly/monthly/custom recurrence semantics |
| File storage | S3-compatible driver (local disk in dev) | Logos, task attachments, SOPs, videos, proof photos |
| Email | SMTP via nodemailer | Provider-agnostic (Resend/Postmark/SES) |
| Push | Web Push (VAPID) + FCM via Capacitor plugin | Task-assigned / reminder / overdue notifications on mobile |
| Reports | `exceljs` (XLSX) + `pdfmake` (PDF) | Server-side export generation |

## Multi-tenancy

Single database, shared schema. Every tenant-owned row carries
`organizationId`, and every API query is scoped by it — enforced centrally:
the auth plugin resolves the caller's organization from their JWT and request
handlers only ever query through a tenant-scoped context, never raw IDs from
the client. This is the standard SaaS model: cheap to operate, easy to back
up, and it scales to thousands of organizations before anything fancier
(schema-per-tenant, row-level security) is worth the complexity.

**Multi-location** sits inside the tenant: an `Organization` has many
`Location`s, a `Location` has many `Department`s, and users are linked to one
or more locations. Dashboards and reports filter by location naturally
because tasks inherit `locationId` from their department or assignee.

```
Organization (business name, industry, logo)
└── Location (site / property / branch)
    └── Department
        └── Users (via Membership)
```

## Roles and permissions (RBAC)

Roles are **data, not code** — the requirement is custom roles per business,
so there is no hard-coded "Manager" enum. The only fixed concept is the
**Owner** (the account creator, who always has every permission).

- `Role` — created by admins, belongs to an organization ("Department
  Manager", "Guest Services", …).
- Permissions are a **fixed catalogue of strings** defined in
  `packages/shared/src/permissions/` (e.g. `task.create`, `task.assign`,
  `template.manage`, `role.manage`, `report.export`, `member.invite`,
  `dashboard.org`, `dashboard.department`). The catalogue is code; which
  roles get which permissions is data (`role_permissions` join table).
- Some permissions take a **scope**: org-wide, location, or department. That
  is how "department manager sees only their team's dashboard" works — same
  permission, narrower scope.
- Enforcement lives in one place: a Fastify route decorator like
  `requirePermission("task.create")`. The frontend reads the same catalogue
  to hide UI the user can't use, but the API is the source of truth.

## Data model

Implemented next in `apps/api/prisma/schema.prisma`. Entities:

**Tenancy & people**
- `Organization` — name, industry, logoUrl
- `Location` — belongs to org
- `Department` — belongs to location
- `User` — global identity (email, password hash, name, avatarUrl)
- `Membership` — user ↔ org join: role, department(s), location(s). A user
  can belong to multiple organizations (e.g. a contractor)
- `Role`, `RolePermission` — see RBAC above
- `Invitation` — pending email invites with token + assigned role

**Tasks**
- `Task` — title, description, dueAt, status (`NOT_STARTED` / `IN_PROGRESS` /
  `COMPLETED`), createdBy, org/location/department scope, optional link to
  the template and recurrence rule that spawned it
- `TaskAssignment` — task ↔ user. Assigning to a department fans out to one
  assignment per member (so per-person status, proof, and audit work), while
  recording the department as the assignment source
- `TaskTemplate` — reusable task definition (title, description, default
  attachments, default reminder schedule)
- `RecurrenceRule` — RRULE string + timezone; a pg-boss cron job materializes
  the next concrete `Task` instance from it. Instances are created ahead of
  time (not all at once) so editing the rule affects future occurrences only
- `Attachment` — file metadata (S3 key, mime, size) attached to a task or
  template; covers documents, SOPs, training material, video
- `AttachmentView` — records who opened which attachment and when (the
  "did staff view the training material" requirement)
- `TaskComment` — threaded notes/questions on a task
- `ProofOfCompletion` — photo / document / signature upload tied to a task
  assignment

**Notifications & audit**
- `ReminderSchedule` — per task (or template): offsets before due date, e.g.
  `[7d, 3d, 1d, 0d]`, configurable by the manager
- `Notification` — in-app inbox row; delivery fan-out (email, push) is
  handled by jobs and tracked per channel
- `AuditLog` — append-only: who did what, to which entity, when, with a JSON
  diff. Written from the service layer on every mutating action. Powers the
  audit-trail requirement and feeds the exportable reports

## Key flows

**Auth.** Register → creates User + Organization + Owner membership in one
transaction. Login → short-lived access JWT (15 min) + refresh token (30 d,
rotated on use, revocable). The JWT carries `userId` only; org membership
and permissions are resolved server-side per request so role changes apply
immediately.

**Task assignment.** Create task (from scratch or template) → choose
assignees (individuals and/or whole departments) → fan-out creates
`TaskAssignment` rows → a job sends "task assigned" notifications →
reminder jobs are scheduled from the task's `ReminderSchedule`.

**Overdue.** A pg-boss cron sweeps for assignments past `dueAt` that aren't
completed → notifies the assignee **and** the users holding the
department-manager-scoped dashboard permission for that department.

**Recurring tasks.** Cron job evaluates `RecurrenceRule`s → materializes the
next `Task` occurrence → normal assignment fan-out runs.

**Reports.** Report endpoints aggregate completion rates by org / location /
department / individual over a date range, returned as JSON for dashboards
and as generated XLSX or PDF for export. Audit-trail export reads
`AuditLog` filtered the same way.

## API conventions

REST under `/api/v1/`, JSON, Zod-validated bodies, cursor pagination.
Modules in `apps/api/src/modules/` are self-contained: `*.routes.ts`
(HTTP layer), `*.service.ts` (business logic + audit writes),
`*.schemas.ts` (re-exporting from shared where applicable). Cross-cutting
concerns live in `src/plugins/` (auth, tenant scoping, error handling) and
`src/jobs/` (pg-boss workers and cron definitions).

## Frontend conventions

`apps/web/src/features/<feature>/` holds screens, components, and query
hooks per feature (auth, tasks, dashboard, admin, reports, notifications,
settings). `src/app/` holds the router, providers, and permission-aware
route guards. `src/lib/` holds the typed API client. Responsive,
mobile-first layout — the same screens must work in the Capacitor shell.

## Build order (milestones)

1. **Foundation** — Prisma schema + migrations, auth (register/login/refresh),
   org setup, invitations, custom roles & permissions. *Everything depends
   on this.*
2. **Core tasks** — task CRUD, assignment fan-out, statuses, comments,
   attachments + view tracking, proof of completion, templates.
3. **Time** — recurrence, reminder schedules, overdue sweep, notification
   fan-out (in-app + email).
4. **Visibility** — the three dashboards, reports + PDF/XLSX export, audit
   trail UI.
5. **Mobile** — Capacitor packaging, camera capture for proof, push
   notifications, store builds.
