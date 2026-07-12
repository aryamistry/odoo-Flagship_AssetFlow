# AssetFlow

AssetFlow is a lean enterprise asset and shared-resource management MVP. It covers organization setup, asset registration, custody, transfers and returns, time-based bookings, maintenance, physical audits, notifications, activity history, dashboard KPIs, and operational reports.

## Stack

- Node.js 24, pnpm 11, TypeScript 6
- PostgreSQL 18 and Prisma 7
- Express 5 REST API
- React 19, React Router, TanStack Query, React Hook Form, Zod, and Vite
- Vitest and Playwright

## Prerequisites

- Node.js `24.18.0` (the project can compile on Node 22, but CI uses the pinned version)
- pnpm `11.10.0` through Corepack
- A PostgreSQL 18 database

## Setup

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `DATABASE_URL` and change `SESSION_PEPPER` in `.env`. Create an empty PostgreSQL database matching the URL, then run:

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web application runs at `http://localhost:5173`; the API runs at `http://localhost:4000/api/v1`.

An optional PostgreSQL service definition is available with `docker compose up -d db`, but any compatible PostgreSQL 18 instance works.

## Development accounts

All seeded users use password `AssetFlow123!`.

| Account | Access |
|---|---|
| `admin@assetflow.local` | Admin + Employee |
| `manager@assetflow.local` | Asset Manager + Employee |
| `head@assetflow.local` | Engineering Department Head + Employee |
| `employee@assetflow.local` | Employee |

The repeatable seed creates departments, hierarchical locations, categories, six representative assets, an overdue allocation, a pending transfer, future booking, maintenance requests, and an in-progress audit discrepancy.

## Commands

```bash
pnpm dev                 # API and web development servers
pnpm build               # production builds
pnpm lint                # strict TypeScript boundary check
pnpm typecheck           # all workspace type checks
pnpm test                # unit tests
pnpm test:integration    # PostgreSQL checks; set TEST_DATABASE_URL
pnpm test:e2e            # Playwright smoke journeys
pnpm check               # lint + typecheck + unit tests + build
pnpm db:migrate          # apply versioned migrations
pnpm db:seed             # repeatable demonstration data
pnpm db:studio           # Prisma Studio
```

## Architecture

The repository is a pnpm monorepo:

- `apps/api`: Express API, Prisma schema/migrations/seed, platform services, and domain services.
- `apps/web`: React application organized by user-facing feature.
- `packages/contracts`: shared transport literals and Zod schemas.
- `infra`: optional local infrastructure.

Route handlers validate and translate HTTP requests. Domain services own authorization orchestration, state transitions, and transaction boundaries. PostgreSQL remains the final integrity boundary for one active allocation and booking overlap.

Every organization-owned query is scoped by `organizationId`. Authentication uses opaque database-backed sessions in an HttpOnly cookie. Asset status cannot be edited through generic asset metadata endpoints.

## MVP workflows

- Admin configures departments, locations, categories, employee status, and roles.
- Asset Manager registers and directly allocates an available asset.
- Employees request transfers/returns; authorized managers approve them transactionally.
- Users book shared resources with half-open, non-overlapping intervals and atomic rescheduling.
- Maintenance follows Pending → Approved → Technician Assigned → In Progress → Resolved.
- Audits freeze a scoped asset snapshot and cannot close with unchecked items or open discrepancies.
- Dashboard, notifications, history, reports, and CSV exports are derived from operational records.

## Known MVP limitations

- One seeded organization only.
- In-app notifications only; no email or messaging provider.
- Attachment URLs only; no object-storage upload flow.
- QR values are stored and searchable, but scanning and label printing are deferred.
- No technician-specific portal, recurring bookings, preventive-maintenance scheduling, booking heatmap, procurement, accounting, SSO, or native mobile app.
- Multi-tenant database row-level security is deferred; the schema retains organization ownership for a later hardening phase.

See [the engineering playbook](./AssetFlow-PERN-Engineering-Playbook-Final.md) and [database design](./AssetFlow-End-to-End-Database-Design-Final.md) for the authoritative MVP rules.
