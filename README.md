# AssetFlow

AssetFlow is a local-first enterprise asset and shared-resource management MVP. It covers organization setup, asset registration, custody, transfers and returns, time-based bookings, maintenance, physical audits, notifications, activity history, dashboard KPIs, and reports.

This repository is intended to run locally. It does not require Docker, deployment infrastructure, a domain, or TLS configuration.

## Technology

- Node.js `24.18.0`, pnpm `11.10.0`, TypeScript `6.0.3`
- PostgreSQL `18`, Prisma `7`
- Express `5` REST API
- React `19`, React Router, TanStack Query, React Hook Form, Zod, and Vite
- Vitest and Playwright

## What you need

- Node.js 24 (Node 22 can compile the project, but Node 24 is the pinned baseline)
- PostgreSQL 18 running locally on port `5432`
- Git

The commands below create a local development role and database named `assetflow`.

## Quick start after PostgreSQL is ready

From the project root:

```bash
pnpm install --frozen-lockfile
```

Copy the environment template:

```bash
# macOS/Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

The default `.env.example` local connection is:

```ini
DATABASE_URL=postgresql://assetflow:assetflow@localhost:5432/assetflow?schema=public
```

Change `SESSION_PEPPER` to a private local value. Then generate the Prisma client, apply the schema, seed demo data, and start both apps:

```bash
pnpm --filter @assetflow/api db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:5173`. The API is available at `http://localhost:4000/api/v1`.

## Windows installation

These instructions assume Node.js/NPM are already installed.

### 1. Install PostgreSQL 18

1. Download the PostgreSQL 18 Windows installer from the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/).
2. Run the EnterpriseDB installer.
3. Keep the default port, `5432`.
4. Set and remember the password for the administrative `postgres` account.
5. Finish the installation.

### 2. Add PostgreSQL to `PATH`

Add this directory to the Windows **System variables** `Path` value:

```text
C:\Program Files\PostgreSQL\18\bin
```

Open **Edit the system environment variables** → **Environment Variables** → select `Path` under System variables → **Edit** → **New**. Close and reopen PowerShell, Command Prompt, or the VS Code terminal afterwards.

Confirm it works:

```powershell
psql --version
```

### 3. Create the local role and database

Open a new PowerShell window and connect as the installer-created administrator:

```powershell
psql -U postgres
```

Enter the password set during installation. At the `postgres=#` prompt, run:

```sql
CREATE ROLE assetflow WITH LOGIN PASSWORD 'assetflow' CREATEDB;
CREATE DATABASE assetflow OWNER assetflow;
\q
```

`SUPERUSER` is not required for normal local development. Use it only if you deliberately need unrestricted database administration.

### 4. Install pnpm and project packages

```powershell
npm install -g pnpm@11.10.0
pnpm --version
cd path\to\OdooFlagship-AssetFlow
pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

### 5. Generate, migrate, seed, and run

```powershell
pnpm --filter @assetflow/api exec prisma generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## macOS installation

### 1. Install Node, pnpm, and PostgreSQL 18

Using Homebrew:

```bash
brew install node@24 postgresql@18
corepack enable
corepack prepare pnpm@11.10.0 --activate
```

If `psql` is not found, expose PostgreSQL 18 in your shell profile:

```bash
echo 'export PATH="$(brew --prefix postgresql@18)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Start PostgreSQL locally:

```bash
brew services start postgresql@18
```

### 2. Create the local role and database

```bash
psql postgres
```

Then run:

```sql
CREATE ROLE assetflow WITH LOGIN PASSWORD 'assetflow' CREATEDB;
CREATE DATABASE assetflow OWNER assetflow;
\q
```

### 3. Install and run AssetFlow

```bash
git clone <repository-url>
cd OdooFlagship-AssetFlow
pnpm install --frozen-lockfile
cp .env.example .env
pnpm --filter @assetflow/api db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Ubuntu/Debian Linux installation

### 1. Install PostgreSQL 18

Use the [official PostgreSQL Apt repository instructions](https://www.postgresql.org/download/linux/ubuntu/) for your Ubuntu/Debian release, then install:

```bash
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
sudo systemctl enable --now postgresql
```

Verify the client:

```bash
psql --version
```

### 2. Create the local role and database

```bash
sudo -u postgres psql
```

Then run:

```sql
CREATE ROLE assetflow WITH LOGIN PASSWORD 'assetflow' CREATEDB;
CREATE DATABASE assetflow OWNER assetflow;
\q
```

### 3. Install Node, pnpm, and run AssetFlow

Install Node 24 using your preferred version manager or the [official Node.js installer](https://nodejs.org/). Then:

```bash
corepack enable
corepack prepare pnpm@11.10.0 --activate
git clone <repository-url>
cd OdooFlagship-AssetFlow
pnpm install --frozen-lockfile
cp .env.example .env
pnpm --filter @assetflow/api db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Demo accounts

All seeded accounts use password `AssetFlow123!`.

| Account | Access |
|---|---|
| `admin@assetflow.local` | Admin + Employee |
| `manager@assetflow.local` | Asset Manager + Employee |
| `head@assetflow.local` | Engineering Department Head + Employee |
| `employee@assetflow.local` | Employee |

The seed is repeatable. It creates departments, hierarchical locations, categories, typed category fields, six assets, an overdue allocation, a pending transfer, a future booking, maintenance requests, and an in-progress audit discrepancy.

## Commands

```bash
pnpm dev                 # Start the API and web development servers
pnpm build               # Create production builds locally
pnpm lint                # TypeScript lint boundary checks
pnpm typecheck           # All workspace type checks
pnpm test                # Unit tests
pnpm test:integration    # PostgreSQL integration checks; set TEST_DATABASE_URL
pnpm test:e2e            # Playwright browser acceptance suite
pnpm check               # lint + typecheck + unit tests + build
pnpm db:migrate          # Apply Prisma and raw PostgreSQL migrations
pnpm db:seed             # Insert/reset deterministic demo data
pnpm db:studio           # Open Prisma Studio
```

## Troubleshooting

### `psql` is not recognized

- On Windows, confirm `C:\Program Files\PostgreSQL\18\bin` is in `Path`, then restart the terminal.
- On macOS, add `$(brew --prefix postgresql@18)/bin` to your shell `PATH`.
- On Linux, install `postgresql-client-18`.

### `database "assetflow" does not exist` or authentication fails

Reconnect as the local PostgreSQL administrator and repeat the role/database commands above. Confirm that `.env` has the exact `DATABASE_URL` shown in the template.

### Prisma Client error

Regenerate it after installing packages or changing the Prisma schema:

```bash
pnpm --filter @assetflow/api exec prisma generate
```

### Port 5432 is busy

Stop the other PostgreSQL service or change both the local PostgreSQL port and `DATABASE_URL` together.

## Architecture

The repository is a pnpm monorepo:

- `apps/api`: Express API, Prisma schema/migrations/seed, platform services, and domain services.
- `apps/web`: React application organized by user-facing feature.
- `packages/contracts`: shared transport literals and Zod schemas.

Route handlers validate and translate HTTP requests. Domain services own state transitions and transaction boundaries. PostgreSQL remains the final integrity boundary for one active allocation and booking overlap.

Every organization-owned query is scoped by `organizationId`. Authentication uses opaque database-backed sessions in an HttpOnly cookie. Asset lifecycle status cannot be edited through generic metadata endpoints.

## MVP workflows

- Admin configures departments, locations, categories, typed category fields, employee status, and roles.
- Asset Managers register, edit, and allocate assets directly.
- Employees request transfers and returns; authorized managers approve them transactionally.
- Users book shared resources with half-open, non-overlapping intervals and atomic rescheduling.
- Maintenance follows Pending → Approved → Technician Assigned → In Progress → Resolved.
- Audits freeze a scoped asset snapshot and cannot close with unchecked items or open discrepancies.
- Dashboard, notifications, history, reports, and CSV exports are derived from operational records.

## MVP limitations

- One seeded organization only.
- In-app notifications only; no email or messaging provider.
- Attachment URLs only; no object-storage upload flow.
- QR values are stored and searchable, but camera scanning and label printing are deferred.
- No technician portal, recurring booking, capacity pool, waitlist, preventive-maintenance scheduling, booking heatmap, accounting, procurement, SSO, or native mobile application.
- Multi-tenant row-level security is deferred; the schema retains organization ownership for a later expansion.

See [the engineering playbook](./AssetFlow-PERN-Engineering-Playbook-Final.md) and [database design](./AssetFlow-End-to-End-Database-Design-Final.md) for MVP rules and data-model detail.
