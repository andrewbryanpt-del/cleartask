# Task Tracker

Industry-agnostic task management SaaS for businesses — works for hotels,
construction, retail, healthcare, hospitality, and any other team that
assigns and tracks work.

**Web + iOS + Android** from one codebase. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Repository layout

```
apps/api        Fastify + Prisma + PostgreSQL backend, background jobs
apps/web        React (Vite) frontend; packaged for mobile via Capacitor
packages/shared Types, Zod schemas, permission catalogue shared by both
docs/           Architecture and design docs
```

## Prerequisites

- Node.js ≥ 20
- PostgreSQL 16+ running locally (or via Docker)

## Getting started

```bash
npm install
cp .env.example apps/api/.env   # then edit values
npm run db:migrate              # create database schema
npm run dev                     # starts API (:3001) and web (:5173)
```

## Status

**Milestone 1 complete** (foundation): full database schema + initial
migration, email/password auth with rotating refresh tokens, organisation
setup with logo upload, locations & departments, email invitations, custom
roles with the permission catalogue, member management, and the audit log.

Next per docs/ARCHITECTURE.md: core task management (milestone 2), then
recurrence/reminders/notifications, dashboards/reports, and mobile packaging.

> A PostgreSQL server is required before `npm run db:migrate` — none was
> detected on this machine. Easiest options: install
> [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) or
> Docker Desktop and run
> `docker run -d --name task-tracker-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`.
