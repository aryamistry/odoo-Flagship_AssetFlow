# AssetFlow PERN Engineering Playbook

**Document status:** Final engineering baseline — Revision 3 (corrected and aligned to the database design)
**Version baseline date:** 2026-07-12
**Audience:** Four-person engineering team and coding agents
**System:** AssetFlow — Enterprise Asset & Resource Management
**Architecture:** PostgreSQL + Express + React + Node.js, TypeScript end to end

**Revision 3 correction summary (vs Revision 2):**

- Persistent booking statuses are now `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, and `COMPLETED`; `UPCOMING` and `ONGOING` are derived display states.
- Rescheduling remains a “Cancel and rebook” UI action, but is executed by one transactional backend command so the original booking is not lost if the replacement fails.
- The dashboard uses the six KPI cards explicitly required by the problem statement: Available, Allocated, Maintenance Today, Active Bookings, Pending Transfers, and Upcoming Returns. Overdue returns remain a separate alert.
- `Location` is now explicit master data and part of Organization Setup, APIs, ownership, and the minimum data model.
- Asset Managers directly allocate assets in the MVP. Department Heads approve eligible transfers, but there is no separate allocation-request workflow.
- Maintenance uses an internal active Employee as the assigned technician, preserves an active allocation during repair, and automatically cancels affected future bookings only after confirmation.
- Report formulas and default reporting periods are now deterministic. “Assets due for maintenance” is implemented as Open and Aging Maintenance Requests because preventive-maintenance scheduling remains out of scope.
- The agent-generated baseline and the team-completed MVP are distinguished to avoid treating a broad generated implementation as production-ready.
- The playbook now matches the normalized database design for locations, category-specific fields, booking state, maintenance context, and QR identifiers.

---

## 1. Purpose

This document defines:

- the fixed technology baseline;
- the first deliverable: a thin, complete MVP suitable for a single coding-agent implementation pass;
- the repository and application architecture;
- code ownership for four engineers;
- rules intended to minimize merge conflicts;
- engineering, security, testing, database, API, and UI standards;
- milestones with objective exit criteria.

When speed conflicts with correctness, preserve the following in order:

1. data integrity;
2. authorization;
3. deterministic builds;
4. core workflow correctness;
5. usability;
6. secondary features and visual polish.

---

## 2. Frozen Product Assumptions

These decisions are fixed for the MVP so that implementation does not stall on ambiguity.

1. **The MVP supports one seeded organization.**
   Tables still include `organizationId` so multi-tenancy can be added later without redesigning every entity.

2. **Signup creates an Employee account only.**
   Elevated roles are assigned by an Admin from the employee directory.

3. **The initial Admin is created by the development seed.**
   There is no public Admin signup.

4. **An asset may be marked as bookable.**
   Rooms, vehicles, and shared equipment are represented through the same `Asset` entity in the MVP. Serial number and acquisition fields may be nullable for room-like resources.

5. **Asset lifecycle status is changed only by workflows.**
   Users cannot freely edit an asset status dropdown.

6. **Bookings use half-open time intervals:** `[startAt, endAt)`.
   A booking ending at 10:00 does not conflict with one starting at 10:00.

7. **Dates and timestamps are stored in UTC using PostgreSQL `timestamptz`.**
   The browser displays them in the user's local timezone.

8. **Authentication is same-origin, cookie-based, and session-backed.**
   No token is stored in `localStorage`.

9. **Notifications are in-app only for the MVP.**
   Email, SMS, WhatsApp, and push delivery are post-MVP concerns.

10. **Purchasing, invoicing, depreciation, accounting, and vendor management are out of scope.**

11. **Each asset has an immutable generated QR identifier and may also have a searchable organization-defined QR code.**
    The MVP stores and searches QR values. Printable labels and camera-based scanning are post-MVP.

12. **Location is normalized master data.**
    Assets and audit scopes reference a `Location` hierarchy such as Site → Building → Floor → Room/Area. Free-text location is not used as the source of truth.

13. **Maintenance requires an explicit technician-assignment step before work starts.**
    The technician must be an active internal Employee. There is no separate Technician role or portal in the MVP.

14. **An active allocation remains active while its asset is under maintenance.**
    The asset status becomes `UNDER_MAINTENANCE`; on resolution it returns to `ALLOCATED` when an active allocation still exists, otherwise to `AVAILABLE`, unless the selected outcome is `RETIRED` or `LOST`.

15. **Maintenance approval handles future bookings explicitly.**
    After user confirmation, the approval transaction cancels future `PENDING`/`CONFIRMED` bookings for that asset and notifies affected users.

16. **Booking reschedule is one atomic backend command exposed as “Cancel and rebook” in the UI.**
    The transaction validates the replacement slot before cancelling the original booking and commits both changes together.

---

## 3. Fixed Technology Stack

All direct dependencies must be installed with exact versions. Do not use `^`, `~`, `latest`, or floating tags in committed manifests.

Create a root `.npmrc` containing:

```ini
save-exact=true
auto-install-peers=false
strict-peer-dependencies=true
```

CI must install with:

```bash
pnpm install --frozen-lockfile
```

### 3.1 Runtime and core stack

| Area | Technology | Fixed version |
|---|---|---:|
| Runtime | Node.js LTS | `24.18.0` |
| Package manager | pnpm | `11.10.0` |
| Language | TypeScript | `6.0.3` |
| Database | PostgreSQL | `18.4` |
| API framework | Express | `5.2.1` |
| Frontend | React | `19.2.0` |
| Frontend DOM renderer | React DOM | `19.2.0` |
| Routing | React Router | `8.2.0` |
| Build tool | Vite | `8.1.0` |
| ORM and migrations | Prisma ORM / Prisma Client | `7.8.0` |
| Runtime validation | Zod | `4.4.3` |
| CSS | Tailwind CSS | `4.3.0` |
| Unit/integration testing | Vitest | `4.1.0` |
| Browser E2E testing | Playwright Test | `1.61.0` |
| Linting | ESLint | `10.7.0` |

**Version policy:** this table is the approved exact bootstrap baseline. The initial bootstrap PR verifies installation and compatibility once; after that PR merges, `package.json` and `pnpm-lock.yaml` are authoritative. Version changes require a Platform Owner change request.

### 3.2 Supporting choices

These choices are also frozen, but their exact package versions are recorded in `package.json` and `pnpm-lock.yaml` when the repository is bootstrapped.

- REST API under `/api/v1`
- Prisma for ordinary CRUD and transactions
- Raw SQL migrations for PostgreSQL-specific constraints
- Zod schemas for request, response, environment, and form validation
- TanStack Query for remote/server state
- React Hook Form for forms
- Pino for structured server logs
- Native Node.js `crypto.scrypt` for password hashing
- Opaque, random, database-backed sessions
- Tailwind utilities plus a small owned UI component layer
- Docker Compose for the local PostgreSQL service
- GitHub Actions for CI
- OpenAPI generated or maintained from module-owned contracts
- CSV for MVP exports
- Recharts `3.9.2` for the required Reports charts
- No Redux in the MVP
- No GraphQL
- No microservices
- No WebSockets in the MVP
- No event broker in the MVP

### 3.3 Version-control rules for dependencies

Only the Platform Owner may modify:

- root `package.json`;
- workspace definitions;
- `pnpm-lock.yaml`;
- runtime versions;
- shared ESLint/TypeScript/Vite configuration.

Feature owners request a dependency through an issue or PR comment. Dependency changes must be isolated in a dedicated commit or PR.

---

# 4. First Deliverable: One-Shot MVP

## 4.1 MVP objective

Deliver one deployable web application demonstrating the complete AssetFlow operating loop:

```text
organization setup
→ asset registration
→ allocation or booking
→ transfer/return or maintenance
→ audit verification
→ dashboard, notifications, and activity history
```

The MVP is deliberately thin. Each core module must demonstrate:

- one usable happy path;
- one authorization rule;
- one business-conflict path;
- persistence in PostgreSQL;
- an activity-log entry;
- a basic automated test.

The first coding-agent pass should create a working baseline, not a collection of disconnected mock screens.

---

## 4.2 MVP roles

A user may have multiple roles.

| Role | MVP permissions |
|---|---|
| `ADMIN` | Organization setup, employee role assignment, audit-cycle creation, organization-wide visibility |
| `ASSET_MANAGER` | Asset registration, allocation, transfer approval, return approval, maintenance approval/technician assignment/resolution |
| `DEPARTMENT_HEAD` | Department-scoped viewing; can approve eligible transfers within their department and book shared resources on behalf of the department |
| `EMPLOYEE` | View own assets, request transfer/return, create bookings, raise maintenance requests, perform assigned audit checks |

Every active user has `EMPLOYEE`. Elevated roles are additive.

Authorization must be enforced in the API. Hiding a frontend control is not authorization.

---

## 4.3 MVP functional scope

### A. Authentication and session management

Implement:

- employee signup;
- login;
- logout;
- current-user endpoint;
- session expiry;
- Admin-seeded account;
- password hashing;
- inactive-user rejection;
- role-aware navigation.

A forgot-password link may display a clear "not available in MVP" message. Do not implement fake email delivery.

### B. Organization setup

Admin can:

- create, edit, activate, and deactivate departments;
- set an optional parent department;
- create and edit asset categories and their typed category-field definitions (stable field key, label, type, required flag, options, validation, and active status);
- create, edit, activate, and deactivate hierarchical locations;
- view the employee directory;
- assign a department;
- add or remove elevated roles;
- activate or deactivate an employee.

Deactivation must be rejected when unresolved active responsibilities exist, unless the Admin first reassigns them.

### C. Asset directory

Asset Manager can:

- register an asset;
- edit non-lifecycle metadata;
- search by asset tag, name, serial number, or QR code (plain stored value, not a scan);
- filter by category, status, department, and location;
- view asset details;
- view allocation, booking, maintenance, and audit history.

Minimum asset fields:

- generated asset tag;
- name;
- category;
- optional serial number;
- generated immutable QR token and optional organization-defined QR code value;
- condition;
- location;
- owning department;
- current lifecycle status;
- `isBookable`;
- optional acquisition date and cost;
- optional attachment URL;
- created and updated timestamps.

### D. Allocation, transfer, and return

Implement:

- allocate an available, non-bookable or bookable asset to an employee or department;
- optional expected-return date;
- database-level prevention of two active allocations;
- a clear conflict response identifying the current holder;
- transfer request;
- transfer approval or rejection;
- return request;
- return approval with condition and check-in notes;
- overdue calculation from an active allocation and expected-return date;
- immutable allocation history.

Asset Managers create allocations directly; the MVP has no separate allocation-request workflow.

A pending transfer requires one approver:

- an Asset Manager for any transfer; or
- a Department Head when the source and destination are both within that head's department scope, including configured child departments.

### E. Resource booking

Implement:

- list bookable assets/resources;
- calendar or timeline list of existing bookings;
- create booking;
- cancel future booking;
- a "Cancel and rebook" UI affordance backed by `POST /bookings/:id/reschedule`, executed atomically;
- overlap validation;
- persistent statuses: `PENDING`, `CONFIRMED`, `REJECTED`, `CANCELLED`, `COMPLETED`;
- derived display states: `UPCOMING` and `ONGOING`, calculated from a confirmed booking's timestamps;
- one reminder notification generated by a scheduled job or on-demand maintenance command.

Do not set a resource's global lifecycle status to `RESERVED` merely because it has a future booking. Availability is calculated for the requested interval.

### F. Maintenance

Implement the full workflow shown in the approved wireframe:

```text
PENDING → APPROVED → TECHNICIAN_ASSIGNED → IN_PROGRESS → RESOLVED
        ↘ REJECTED
```

Employee can raise a request with:

- asset;
- issue description;
- priority;
- optional attachment URL.

Asset Manager can:

- approve or reject;
- assign an active internal Employee as technician; there is no separate technician login/portal;
- start work once a technician is assigned;
- resolve.

On approval, in one transaction after explicit confirmation:

- block new allocation and booking;
- keep any active allocation open so custody history is not broken;
- cancel future `PENDING` and `CONFIRMED` bookings for the asset;
- notify affected booking owners;
- preserve the pre-maintenance operational context;
- set the asset to `UNDER_MAINTENANCE`.

Technician assignment does not change asset status; it only unlocks the transition into `IN_PROGRESS`. A request cannot move to `IN_PROGRESS` without an assigned technician.

On resolution, the Asset Manager selects one outcome:

- restore operational status (`ALLOCATED` when an active allocation exists, otherwise `AVAILABLE`);
- mark `RETIRED`;
- mark `LOST`.

### G. Audit cycle

Implement the reduced workflow:

```text
DRAFT → IN_PROGRESS → REVIEW → CLOSED
```

Admin can:

- create an audit scoped to a department or location, with a start and end date for the cycle;
- assign one or more active employees as auditors;
- start the audit, freezing the in-scope asset snapshot (each audit item captures the asset's expected location at freeze time).

Assigned auditors can mark each item, seeing both expected location and current recorded location:

- `VERIFIED`;
- `MISSING`;
- `DAMAGED`.

The system creates discrepancy records for missing or damaged items.

Before closure, an Asset Manager resolves each discrepancy by:

- confirming missing and marking asset `LOST`;
- recording damage and creating a maintenance request;
- correcting metadata and marking verified;
- dismissing with a reason.

Closing an audit locks its items and resolutions.

### H. Dashboard, notifications, and logs

Dashboard KPI cards, fixed to the problem statement:

- assets available;
- assets allocated;
- maintenance today;
- active bookings;
- pending transfers;
- upcoming returns.

Definitions:

- `Maintenance Today`: maintenance events that entered `APPROVED`, `TECHNICIAN_ASSIGNED`, `IN_PROGRESS`, or `RESOLVED` during the organization's current calendar day.
- `Active Bookings`: confirmed bookings whose end time has not passed.
- `Upcoming Returns`: active allocations with an expected-return timestamp in the next 7 days, excluding overdue allocations.

A separate, visually distinct alert banner shows overdue returns. Open audit discrepancies appear as an Audit navigation badge or an additional non-required alert, not as a replacement for a required KPI.

Quick actions on the dashboard:

- Register Asset;
- Book Resource;
- Raise Maintenance Request.

A recent-activity feed on the dashboard surfaces the latest handful of activity-log entries in plain language. All values are derived from live database records.

Create in-app notifications for:

- asset assigned;
- transfer requested/approved/rejected;
- return approved;
- booking confirmed/cancelled;
- maintenance approved/rejected/technician assigned/resolved;
- overdue return;
- audit discrepancy.

Every mutation writes an activity-log record containing:

- actor;
- action;
- entity type;
- entity ID;
- timestamp;
- request ID;
- safe summary;
- optional before/after JSON for important changes.

### I. Reports

The default reporting window is the previous 90 days unless the user supplies a valid date range.

The MVP includes:

- **Department allocation summary:** active allocation count grouped by owning/custodian department.
- **Asset status summary:** asset count grouped by lifecycle status.
- **Allocation utilization:** allocated duration during the reporting window divided by in-service duration during the same window.
- **Booking utilization:** confirmed booking minutes divided by configured bookable minutes during the reporting window.
- **Most-used allocatable assets:** ranked by allocated duration during the reporting window.
- **Most-used bookable resources:** ranked by confirmed booking minutes during the reporting window.
- **Idle assets:** available assets with no active allocation and no allocation or confirmed-booking activity during the previous 60 days; for assets with no history, age is measured from `acquisitionDate` or `createdAt`.
- **Maintenance frequency:** maintenance-request count grouped by category and time period.
- **Open and aging maintenance requests:** unresolved requests grouped by age bucket. This replaces “due for maintenance” until preventive-maintenance scheduling exists.
- **Assets nearing retirement:** assets whose `expectedRetirementOn` falls within the next 90 days, or whose age is within 90 days of the category's configured useful life.
- **Resource booking count:** confirmed/completed booking count by resource.
- CSV export for every report above.

A booking heatmap remains a stretch item. Predictive analytics and preventive-maintenance forecasting are not MVP requirements.

---

## 4.4 MVP non-goals

Do not add these during the first implementation pass:

- multi-organization onboarding;
- public Admin creation;
- real email/SMS/WhatsApp delivery;
- cloud file storage;
- image processing;
- QR **scanner/camera** integration (a stored, searchable QR code value is in scope; scanning hardware is not);
- a dedicated technician role, login, or portal (an active Employee is assigned to a maintenance request);
- recurring bookings;
- resource capacity pools;
- waitlists;
- preventive-maintenance schedules;
- accounting or depreciation;
- procurement;
- offline support;
- native mobile application;
- real-time WebSockets;
- custom report builder;
- booking heatmap (stretch item only, see 4.3.I);
- localization;
- SSO/SAML/OAuth;
- arbitrary workflow designer.

---

## 4.5 Required MVP data model

Minimum entities:

```text
Organization
Department
Location
User
UserRole
Session
AssetCategory
CategoryFieldDefinition
Asset
AssetFieldValue
ResourceProfile
Allocation
TransferRequest
ReturnRequest
Booking
MaintenanceRequest
AuditCycle
AuditAssignment
AuditItem
AuditDiscrepancy
Notification
ActivityLog
```

### Required fields and model clarifications

- `Location` stores hierarchical Site/Building/Floor/Room/Area master data.
- `AssetCategory` owns typed `CategoryFieldDefinition` records.
- `AssetFieldValue` stores validated values for the selected category's active field definitions.
- `Asset.qrToken` is generated and immutable; `Asset.qrCode` is an optional organization-defined searchable value.
- `ResourceProfile` stores booking policy for bookable assets.
- `Booking.rescheduledFromBookingId` links an atomic replacement booking to the cancelled original.
- `MaintenanceRequest.assignedTechnicianUserId` references an active internal Employee and is required from `TECHNICIAN_ASSIGNED` onward.
- `MaintenanceRequest.previousAssetStatus` preserves restoration context; active allocation records remain open during repair.
- `AuditItem.expectedLocationId` is snapshotted when the audit starts.
- `AuditCycle.startDate` and `AuditCycle.endDate` store the planned date range.
- `Asset.expectedRetirementOn` and `AssetCategory.defaultUsefulLifeMonths` support the nearing-retirement report.

### Required integrity rules

1. User email is unique within an organization.
2. Asset tag is unique within an organization.
3. Serial number, when present, is unique within an organization.
4. QR code value, when present, is unique within an organization.
5. One asset may have only one active allocation.
6. A booking must have `startAt < endAt`.
7. Active bookings for the same resource may not overlap.
8. Inactive users cannot log in, receive new allocations, approve requests, or be assigned audits.
9. Closed audits are immutable.
10. Resolved or rejected maintenance requests cannot return to pending.
11. A maintenance request cannot enter `TECHNICIAN_ASSIGNED`, `IN_PROGRESS`, or `RESOLVED` without an assigned active Employee.
12. Asset status transitions occur through services, never through generic CRUD updates.
13. Every mutation runs inside a transaction when it changes more than one record.
14. All organization-owned queries include `organizationId`.

### PostgreSQL constraints

Use raw SQL in Prisma migrations for the critical race-condition protections.

```sql
CREATE UNIQUE INDEX one_active_allocation_per_asset
ON "Allocation" ("assetId")
WHERE "endedAt" IS NULL;
```

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
ADD CONSTRAINT booking_no_overlap
EXCLUDE USING gist (
  "assetId" WITH =,
  tstzrange("effectiveStartAt", "effectiveEndAt", '[)') WITH &&
)
WHERE ("status" IN ('PENDING', 'CONFIRMED'));
```

```sql
ALTER TABLE "MaintenanceRequest"
ADD CONSTRAINT maintenance_technician_required
CHECK (
  status NOT IN ('TECHNICIAN_ASSIGNED', 'IN_PROGRESS', 'RESOLVED')
  OR "assignedTechnicianUserId" IS NOT NULL
);
```

The API performs user-friendly pre-checks. Database constraints remain the final authority.

---

## 4.6 Required API surface

All paths are under `/api/v1`.

```text
POST   /auth/signup
POST   /auth/login
POST   /auth/logout
GET    /auth/me

GET    /departments
POST   /departments
PATCH  /departments/:id

GET    /locations
POST   /locations
PATCH  /locations/:id

GET    /categories
POST   /categories
PATCH  /categories/:id
GET    /categories/:id/fields
POST   /categories/:id/fields
PATCH  /category-fields/:id

GET    /employees
PATCH  /employees/:id
PUT    /employees/:id/roles

GET    /assets
POST   /assets
GET    /assets/:id
PATCH  /assets/:id
GET    /assets/:id/history

GET    /allocations
GET    /allocations/:id
POST   /allocations
POST   /allocations/:id/request-return

GET    /return-requests
GET    /return-requests/:id
POST   /return-requests/:id/approve
POST   /return-requests/:id/reject

GET    /transfer-requests
GET    /transfer-requests/:id
POST   /transfer-requests
POST   /transfer-requests/:id/approve
POST   /transfer-requests/:id/reject
POST   /transfer-requests/:id/cancel

GET    /bookings
GET    /bookings/:id
GET    /resources/:assetId/bookings
POST   /bookings
POST   /bookings/:id/cancel
POST   /bookings/:id/reschedule

GET    /maintenance-requests
GET    /maintenance-requests/:id
POST   /maintenance-requests
POST   /maintenance-requests/:id/approve
POST   /maintenance-requests/:id/reject
POST   /maintenance-requests/:id/assign-technician
POST   /maintenance-requests/:id/start
POST   /maintenance-requests/:id/resolve

GET    /audit-cycles
GET    /audit-cycles/:id
POST   /audit-cycles
PUT    /audit-cycles/:id/auditors
POST   /audit-cycles/:id/start
GET    /audit-cycles/:id/items
PUT    /audit-items/:id/result
GET    /audit-cycles/:id/discrepancies
POST   /audit-discrepancies/:id/resolve
POST   /audit-cycles/:id/review
POST   /audit-cycles/:id/close
POST   /audit-cycles/:id/cancel

GET    /dashboard/summary
GET    /notifications
POST   /notifications/:id/read
GET    /activity-logs
GET    /activity-logs/:id
GET    /reports/:reportName
GET    /reports/:reportName.csv
```

`reportName` includes: `department-allocation-summary`, `asset-status-summary`, `allocation-utilization`, `booking-utilization`, `most-used-assets`, `most-used-resources`, `idle-assets`, `maintenance-frequency`, `open-aging-maintenance`, `assets-nearing-retirement`, and `booking-count-by-resource`.

Use pagination for list endpoints from the beginning.

---

## 4.7 API response rules

Success:

```json
{
  "data": {},
  "meta": {
    "requestId": "..."
  }
}
```

Paginated success:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 25,
    "total": 100,
    "requestId": "..."
  }
}
```

Errors follow Problem Details semantics:

```json
{
  "type": "https://assetflow.local/problems/booking-overlap",
  "title": "Booking conflicts with an existing booking",
  "status": 409,
  "detail": "The requested slot overlaps an active booking.",
  "code": "BOOKING_OVERLAP",
  "requestId": "...",
  "errors": []
}
```

Never return stack traces, SQL errors, session tokens, password hashes, or internal secrets.

---

## 4.8 Required MVP screens

```text
/login
/signup
/dashboard
/organization/departments
/organization/categories
/organization/employees
/assets
/assets/new
/assets/:id
/allocations
/transfers
/bookings
/maintenance
/audits
/audits/:id
/reports
/notifications
```

`/maintenance` renders as a Kanban board with five columns: Pending, Approved, Technician Assigned, In Progress, Resolved (Rejected requests can be shown in a filtered/side view rather than a sixth column).

All screens must have:

- loading state;
- empty state;
- error state;
- success feedback;
- keyboard-reachable actions;
- visible labels for inputs;
- permission-aware controls;
- responsive behavior down to tablet width.

---

## 4.9 Development seed

Create deterministic seed data:

- Organization: `AssetFlow Demo`
- Departments: Engineering, Facilities, Finance
- Categories: Electronics, Furniture, Vehicle, Room
- Admin: `admin@assetflow.local`
- Asset Manager: `manager@assetflow.local`
- Department Head: `head@assetflow.local`
- Employee: `employee@assetflow.local`
- At least six assets:
  - available laptop;
  - allocated laptop;
  - projector;
  - meeting room;
  - vehicle;
  - asset under maintenance (with a technician already assigned, to demonstrate the Kanban board's fourth column).
- At least:
  - one future booking;
  - one overdue allocation;
  - one pending transfer;
  - one pending maintenance request (not yet approved, to show the Kanban's first column);
  - one in-progress audit with at least one flagged discrepancy (missing or damaged), so the discrepancy-resolution and reports screens have real data to show.

Development credentials may be documented in `.env.example` or the README. Production secrets must never be committed.

---

## 4.10 MVP acceptance criteria

The MVP is complete only when all conditions below are true.

### Build and setup

- `pnpm install --frozen-lockfile` succeeds.
- `docker compose up -d db` starts PostgreSQL.
- `pnpm db:migrate` succeeds on an empty database.
- `pnpm db:seed` is repeatable.
- `pnpm dev` starts the API and web application.
- `pnpm build` succeeds for all workspaces.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

### Functional

- An Employee cannot self-promote.
- An Admin can promote an Employee.
- An Asset Manager can register an asset.
- Double allocation is rejected even under concurrent requests.
- Booking overlap is rejected even under concurrent requests.
- Atomic rescheduling leaves the original booking unchanged when the replacement slot is invalid.
- A transfer closes the old allocation and creates the new one atomically.
- A return captures condition and history.
- Maintenance approval blocks conflicting use.
- A maintenance request cannot enter `TECHNICIAN_ASSIGNED`, `IN_PROGRESS`, or `RESOLVED` without an assigned active Employee.
- Audit closure is blocked while unresolved discrepancies remain.
- Dashboard values, including Upcoming Returns, are derived from database records, not hardcoded.
- Reports return deterministic derived values for allocation/booking utilization, most-used/idle assets, maintenance frequency, open and aging maintenance, and retirement proximity.
- Notifications and activity logs are created for core mutations, including technician assignment.

### Tests

At minimum, include Playwright E2E tests for:

1. login and role-aware navigation;
2. Admin role promotion;
3. asset registration and allocation;
4. double-allocation conflict;
5. booking overlap conflict and failed atomic reschedule;
6. maintenance request through technician assignment to resolution;
7. audit discrepancy to closure.

Include API integration tests for authorization and database invariants.

### Quality

- No TypeScript errors.
- No ESLint errors.
- No committed secrets.
- No unhandled promise rejections.
- No business logic in route handlers or React page components.
- No critical workflow depends solely on frontend validation.
- New migrations work from a clean database.
- The README contains setup, seed credentials, commands, architecture, and known limitations.

---

# 5. Repository Architecture

Use a pnpm monorepo.

```text
assetflow/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── platform/
│   │       │   ├── auth/
│   │       │   ├── config/
│   │       │   ├── errors/
│   │       │   ├── http/
│   │       │   ├── logging/
│   │       │   ├── middleware/
│   │       │   └── observability/
│   │       ├── modules/
│   │       │   ├── organization/
│   │       │   ├── assets/
│   │       │   ├── allocations/
│   │       │   ├── bookings/
│   │       │   ├── maintenance/
│   │       │   ├── audits/
│   │       │   ├── dashboard/
│   │       │   ├── notifications/
│   │       │   └── reports/
│   │       ├── app.ts
│   │       └── server.ts
│   └── web/
│       └── src/
│           ├── app/
│           │   ├── router/
│           │   ├── providers/
│           │   └── shell/
│           ├── components/
│           │   └── ui/
│           ├── features/
│           │   ├── auth/
│           │   ├── organization/
│           │   ├── assets/
│           │   ├── allocations/
│           │   ├── bookings/
│           │   ├── maintenance/
│           │   ├── audits/
│           │   ├── dashboard/
│           │   ├── notifications/
│           │   └── reports/
│           └── main.tsx
├── packages/
│   ├── contracts/
│   │   └── src/
│   │       ├── auth/
│   │       ├── organization/
│   │       ├── assets/
│   │       ├── allocations/
│   │       ├── bookings/
│   │       ├── maintenance/
│   │       ├── audits/
│   │       ├── dashboard/
│   │       ├── notifications/
│   │       └── reports/
│   ├── test-utils/
│   ├── tsconfig/
│   └── eslint-config/
├── docs/
│   ├── adr/
│   ├── api/
│   └── diagrams/
├── infra/
│   └── docker-compose.yml
├── .github/
│   ├── CODEOWNERS
│   ├── pull_request_template.md
│   └── workflows/
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

---

## 5.1 Backend module structure

Every API module uses the same internal shape:

```text
modules/assets/
├── asset.routes.ts
├── asset.controller.ts
├── asset.service.ts
├── asset.repository.ts
├── asset.policy.ts
├── asset.schemas.ts
├── asset.errors.ts
├── asset.types.ts
└── __tests__/
```

Responsibilities:

- **Routes:** HTTP path and middleware composition only.
- **Controller:** translate HTTP input/output; no business rules.
- **Service:** transactions, state transitions, authorization orchestration, domain rules.
- **Repository:** database access only.
- **Policy:** role and resource-scope checks.
- **Schemas:** Zod boundary validation.
- **Errors:** stable module error codes.
- **Tests:** colocated unit and integration tests.

Do not import another module's repository directly. Call the other module's public service or a narrow internal interface.

---

## 5.2 Frontend feature structure

```text
features/assets/
├── api/
├── components/
├── hooks/
├── pages/
├── schemas/
├── types/
└── tests/
```

Rules:

- Page components compose features; they do not contain domain rules.
- Remote data is managed through TanStack Query.
- Forms use React Hook Form plus Zod.
- Query keys are defined inside the owning feature.
- Components do not call `fetch` directly.
- Shared UI primitives contain no AssetFlow business logic.
- Avoid global state. Use context only for session, theme, and stable app-wide concerns.
- Do not create a generic "god component" or universal dynamic form (the one exception is the category custom-fields renderer in 4.3.B, which is intentionally data-driven and owned by P2).

---

## 5.3 Contracts

`packages/contracts` contains transport contracts only:

- request schemas;
- response schemas;
- enum-like literals shared across client and server;
- API error codes;
- pagination definitions.

It must not contain:

- Prisma types;
- database models;
- Express objects;
- React components;
- service logic;
- secrets or configuration.

Each domain owner edits only their contract subdirectory.

Avoid shared barrel files that every engineer must edit. Prefer direct imports:

```ts
import { createAssetRequestSchema } from "@assetflow/contracts/assets/create-asset";
```

Do not require adding every module to a central `index.ts`.

---

# 6. Git and Pull-Request Practice

Use trunk-based development with short-lived branches.

## 6.1 Branches

```text
feat/AF-123-asset-registration
fix/AF-207-booking-overlap
chore/AF-010-ci-cache
refactor/AF-301-maintenance-service
```

Rules:

- branch from current `main`;
- keep branches short-lived;
- rebase on `main` before final review;
- never merge `main` into a feature branch unless rebase is impossible;
- do not create long-running frontend/backend branches;
- do not use one branch per engineer.

## 6.2 Commits

Use Conventional Commits:

```text
feat(assets): add asset registration service
fix(bookings): reject adjacent invalid ranges
test(allocations): cover concurrent allocation attempts
chore(ci): cache pnpm store
docs(adr): record session-auth decision
```

A commit must:

- build or be part of a clearly ordered local series;
- change one concern;
- avoid unrelated formatting;
- avoid files outside the owner's path unless agreed;
- include tests with behavior changes;
- not contain generated build output.

## 6.3 Pull requests

Recommended PR size:

- under 400 changed lines when practical;
- one domain concern;
- one database migration at most;
- no drive-by refactors.

Every PR must include:

- objective;
- scope and non-scope;
- screenshots for UI;
- API examples for endpoint changes;
- migration notes;
- test evidence;
- rollback or compatibility note;
- checklist confirming owned paths.

Use squash merge after approval. The squash message follows Conventional Commits.

## 6.4 Review rules

- One approval from the domain owner.
- P1 approval for shared files, database migrations, auth, CI, or root configuration.
- Cross-domain contracts require approval from both owners.
- Authors do not resolve substantive review comments without replying.
- "It works on my machine" is not evidence; attach command output or CI status.
- A PR with failing CI does not enter review unless marked draft.

---

# 7. Database and Migration Practice

## 7.1 General rules

- PostgreSQL is the source of truth.
- Use UUID primary keys generated server-side or database-side.
- Use `timestamptz` for all timestamps.
- Store money as integer minor units or `numeric`, never floating point.
- Include `createdAt` and `updatedAt` on mutable business tables.
- Use explicit status fields and constrained state transitions.
- Prefer status deactivation over generic soft delete for master data.
- Never cascade-delete audit, allocation, maintenance, or activity history.
- Add indexes for foreign keys and common filters (including `Asset.qrCode`).
- Use cursor or page-based pagination consistently.
- Avoid N+1 queries.
- Select required columns; do not return entire models by default.

## 7.2 Migration ownership

P1 is the migration owner.

Process:

1. Domain owner submits the model change.
2. P1 updates `schema.prisma`.
3. P1 generates the migration.
4. Domain owner reviews domain semantics.
5. P3 reviews concurrency constraints when allocations/bookings are affected.
6. CI tests migration from an empty database.
7. CI optionally tests forward migration from the previous baseline.

Never:

- edit an already-merged migration;
- reorder migration directories;
- use `prisma db push` as the team migration workflow;
- commit database dumps;
- run destructive reset commands against shared environments.

## 7.3 Transactions

Use transactions for:

- allocation creation;
- transfer approval;
- return approval;
- maintenance approval, technician assignment, start, and resolution;
- audit start;
- discrepancy resolution;
- audit closure;
- role changes that invalidate assignments.

The transaction boundary belongs in the service layer.

## 7.4 Concurrency

User-friendly checks occur before writes, but constraints handle races.

Map constraint violations to stable `409 Conflict` errors:

- `ASSET_ALREADY_ALLOCATED`;
- `BOOKING_OVERLAP`;
- `DUPLICATE_ASSET_TAG`;
- `DUPLICATE_SERIAL_NUMBER`;
- `DUPLICATE_QR_CODE`;
- `MAINTENANCE_TECHNICIAN_REQUIRED`;
- `AUDIT_ALREADY_CLOSED`.

---

# 8. API Engineering Practice

## 8.1 HTTP semantics

- `GET` reads and has no side effects.
- `POST` creates or executes a command.
- `PATCH` performs partial metadata changes.
- `PUT` replaces a complete subresource, such as a role set.
- `DELETE` is used only where deletion is legitimate; most business history is not deletable.
- Use `201` for created resources.
- Use `204` for successful no-content operations.
- Use `400` for malformed input.
- Use `401` for unauthenticated.
- Use `403` for authenticated but unauthorized.
- Use `404` without leaking inaccessible resource existence.
- Use `409` for business conflicts and concurrency constraints.
- Use `422` for semantically invalid state transitions where appropriate.
- Use `429` for rate limiting.
- Use `500` only for unexpected server failures.

## 8.2 Validation

Validate at every external boundary:

- environment variables at startup;
- route params;
- query strings;
- request bodies;
- file/URL metadata;
- API responses in critical shared contracts.

Do not trust frontend validation.

## 8.3 Idempotency

Approval and resolution commands should be safely repeatable:

- repeating an already-completed command returns the current result or a stable conflict;
- it must not create duplicate allocations, notifications, or logs.

For future external integrations, add idempotency keys. They are optional for the MVP UI.

## 8.4 Observability

Each request receives a request ID.

Structured logs include:

- timestamp;
- level;
- request ID;
- route;
- method;
- status;
- duration;
- authenticated user ID;
- organization ID;
- stable error code.

Never log:

- passwords;
- cookies;
- session tokens;
- password-reset tokens;
- full attachment contents;
- unnecessary personal data.

---

# 9. Security Practice

Use a pragmatic OWASP-aligned baseline.

## 9.1 Authentication

- Hash passwords with Node `crypto.scrypt`.
- Generate a unique random salt.
- Apply a server-side pepper from environment configuration.
- Compare hashes with constant-time comparison.
- Use opaque random session tokens with at least 256 bits of entropy.
- Store only a hash of the session token in PostgreSQL.
- Put the token in an `HttpOnly`, `Secure` production cookie.
- Use `SameSite=Lax`.
- Rotate the session on login and privilege change.
- Revoke sessions on deactivation.
- Expire idle and absolute session lifetimes.

## 9.2 Request protection

- Enforce same-origin deployment for the MVP.
- Validate `Origin` on state-changing requests.
- Add CSRF protection for cookie-authenticated mutations.
- Configure strict CORS; do not use wildcard origins with credentials.
- Set security headers.
- Limit JSON body size.
- Rate-limit login, signup, and password-sensitive endpoints.
- Normalize and validate uploaded attachment URLs.
- Parameterize all database access through Prisma/raw parameter binding.

## 9.3 Authorization

Use policy functions such as:

```ts
canManageOrganization(actor)
canRegisterAsset(actor)
canViewAsset(actor, asset)
canApproveTransfer(actor, transfer)
canAssignTechnician(actor, maintenanceRequest)
canPerformAudit(actor, auditCycle)
```

Never scatter raw role comparisons throughout controllers and components.

Resource scope must consider:

- organization;
- department;
- current holder;
- assigned auditor;
- elevated role.

## 9.4 Secrets

- Commit `.env.example`, never `.env`.
- CI secrets come from the CI secret store.
- Production secrets are different from development secrets.
- Fail startup when required configuration is missing.
- Do not provide insecure default secrets.

---

# 11. Frontend Engineering Practice

## 11.1 Component boundaries

- UI primitives: visual behavior only.
- Feature components: domain-specific presentation.
- Pages: route-level composition.
- Hooks: data access and orchestration.
- API clients: transport only.
- Zod schemas: form and response validation.
- No database-shaped models directly in components.

## 11.2 Data handling

- Use TanStack Query for API reads and mutations.
- Invalidate the narrowest relevant query keys.
- Use optimistic updates only when rollback is straightforward.
- Do not duplicate server state in context or local storage.
- Store filters and pagination in URL search parameters where useful.
- Use stable query-key factories owned by each feature.

## 11.3 Forms

Every form must:

- use one schema as the validation source;
- display field-specific errors;
- prevent accidental duplicate submission;
- preserve user input after recoverable server errors;
- show server conflict messages;
- disable only actions that truly cannot proceed;
- use confirmation dialogs for irreversible actions.

## 11.4 Accessibility

Minimum acceptance:

- semantic HTML;
- associated labels;
- keyboard navigation;
- visible focus state;
- accessible dialog focus management;
- status messages exposed through appropriate live regions;
- no color-only indication of status (the Kanban board and audit checklist both use color plus a text label);
- sufficient contrast;
- table headers and captions where appropriate.

## 11.5 UI consistency

P1 owns shared primitives:

- Button
- Input
- Select
- Textarea
- Dialog
- Drawer
- Table
- Badge
- Card
- KanbanBoard/KanbanColumn (new — needed for the Maintenance screen)
- EmptyState
- ErrorState
- LoadingState
- Pagination
- Toast
- ConfirmAction

Feature owners do not fork these components. They request additions through P1.

---

# 12. Testing Strategy

Use a test pyramid focused on business risk.

## 12.1 Unit tests

Test pure logic:

- status transitions (including the technician-assignment gate);
- date overlap;
- permission policies;
- report calculations (allocation utilization, booking utilization, idle threshold, maintenance age buckets, retirement threshold);
- overdue rules;
- input transformations.

## 12.2 API integration tests

Run against a disposable PostgreSQL database.

Test:

- real Prisma queries;
- transactions;
- authorization;
- database constraints;
- error mapping;
- pagination;
- organization isolation.

Do not mock Prisma in tests whose purpose is persistence or concurrency.

## 12.3 E2E tests

Playwright covers critical user journeys only.

Use role-specific authenticated fixtures:

- Admin;
- Asset Manager;
- Department Head;
- Employee.

Prefer resilient locators:

- role;
- label;
- accessible name;
- stable test ID only when semantic locators are insufficient.

Do not use arbitrary sleeps.

## 12.4 Contract tests

Frontend and API share Zod transport contracts. Add tests ensuring representative API responses parse against those contracts.

## 12.5 Required CI jobs

```text
install
lint
typecheck
unit-tests
api-integration-tests
build
e2e-smoke
migration-from-empty
```

Recommended order:

1. lint and typecheck;
2. unit tests;
3. integration tests;
4. build;
5. migration;
6. E2E smoke.

Use job cancellation for superseded branch commits.

---

# 13. Coding-Agent Execution Contract

The first coding agent must receive this document plus the product statement and wireframe.

The coding agent is responsible for a coherent executable baseline. The four-person team remains responsible for reviewing and completing the full MVP. Generated code is not accepted as production-ready merely because it compiles.

The agent must:

1. create the monorepo structure exactly as defined;
2. pin the frozen versions (confirming exact available patches per the note in 3.1);
3. create Docker Compose PostgreSQL;
4. implement Prisma schema, migrations, and deterministic seed;
5. implement executable vertical slices for every core workflow, including booking concurrency, atomic rescheduling, the five-state maintenance Kanban, and the technician-assignment gate;
6. implement responsive screens matching the wireframe structure, including the Kanban board (Screen 7), the dashboard quick actions and Upcoming Returns KPI (Screen 2), and the full Reports set (Screen 9);
7. add tests for the acceptance criteria;
8. add CI;
9. add `.env.example`;
10. add a complete README;
11. run and fix all required commands;
12. report known limitations without silently omitting failed requirements.

The agent must not:

- change the stack;
- introduce Next.js, NestJS, GraphQL, Redux, MongoDB, Firebase, or Supabase;
- store auth tokens in local storage;
- replace database constraints with frontend checks;
- create mock-only screens;
- use `any` as a shortcut;
- suppress TypeScript or ESLint errors globally;
- generate a microservice architecture;
- implement a technician portal, QR scanner, or booking heatmap before the rest of the acceptance criteria pass;
- implement non-goals before acceptance criteria pass.

### Required root commands

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:integration": "pnpm --filter api test:integration",
    "test:e2e": "pnpm --filter web test:e2e",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:seed": "pnpm --filter api db:seed",
    "db:studio": "pnpm --filter api db:studio",
    "format": "pnpm -r format",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```

The exact implementation of recursive scripts may be adjusted, but these command names are stable team contracts.

---

# 14. Milestones

Milestones begin only after the one-shot MVP baseline exists. A milestone is complete when its exit criteria pass on `main`.

## Milestone 0 — Stack Freeze and Repository Foundation

### Objective

Create a deterministic development platform before domain work diverges.

### Deliverables

- frozen versions;
- pnpm workspace;
- web/API apps;
- PostgreSQL Docker Compose;
- environment validation;
- CI skeleton;
- lint/type/test/build commands;
- app shell;
- health endpoint;
- README setup;
- CODEOWNERS;
- PR template.

### Primary owner

P1.

### Exit criteria

- clean clone can start locally;
- CI passes;
- no feature code is required to validate the platform;
- all four engineers can run the same commands.

---

## Milestone 1 — Agent-Generated Executable Baseline

### Objective

Generate a coherent executable baseline covering every core domain, then subject it to domain-owner review. This milestone is not the final team MVP.

### Deliverables

- executable vertical slices for all core modules, with scaffolding for the full reports set;
- deterministic seed;
- core screens;
- role-aware navigation;
- database constraints;
- notifications and logs;
- required tests;
- setup documentation.

### Primary owner

P1 integrates the coding-agent output. P2–P4 review their owned domains before the baseline is accepted.

### Exit criteria

Every MVP acceptance criterion passes.

The coding-agent output is not accepted merely because it builds. Domain owners must verify workflow and data-integrity behavior.

---

## Milestone 2 — Team-Completed MVP and Domain Stabilization

### Objective

Review, correct, and complete generated code as clear, owned modules until every MVP acceptance criterion passes.

### P1 objectives

- harden auth/session/RBAC;
- stabilize app shell and UI primitives (including the new KanbanBoard primitive);
- stabilize dashboard and notification contracts;
- improve CI speed and observability.

### P2 objectives

- complete organization setup, including category custom fields;
- refine category and asset validation, including QR-code uniqueness;
- add asset detail timeline;
- improve directory search/filter/pagination.

### P3 objectives

- harden allocation/transfer/return transactions;
- complete booking calendar and conflict UX, including cancel-and-rebook;
- add overdue calculations;
- add concurrency integration tests.

### P4 objectives

- harden maintenance transitions, including the technician-assignment gate;
- complete audit discrepancy resolution, including expected-location display;
- implement report queries (utilization, idle, maintenance frequency, retirement) and CSV;
- add lifecycle consistency tests.

### Exit criteria

- all modules follow the standard folder architecture;
- no controller contains business logic;
- all domain APIs have validation and stable errors;
- each owner has tests for domain invariants;
- no owner routinely edits another owner's paths.

---

## Milestone 3 — Workflow Integrity and Permission Matrix

### Objective

Make every state transition and approval path explicit and testable.

### Deliverables

- documented transition tables (including the maintenance Kanban's five states);
- centralized policy functions;
- Department Head scope rules;
- maintenance restore behavior;
- deactivation guards;
- idempotent approval commands;
- immutable closed-audit behavior;
- conflict error UX;
- activity-log completeness.

### Exit criteria

- forbidden transitions fail with stable errors;
- permission tests cover all roles for critical commands;
- race-condition tests pass;
- asset status can no longer diverge from active workflows;
- repeated commands do not duplicate data.

---

## Milestone 4 — Audit, Analytics, and Operational UX

### Objective

Make the product useful for an operational demonstration, not only technically correct.

### Deliverables

- audit workbench with expected-location display;
- discrepancy report;
- dashboard drill-down links;
- meaningful empty states;
- report summaries (utilization, idle assets, maintenance frequency, retirement);
- CSV exports;
- notification filtering;
- asset history timeline;
- responsive table behavior;
- accessible dialogs, forms, and Kanban board.

### Exit criteria

- demo users can complete all critical workflows without database edits;
- dashboard counts reconcile with report totals;
- audit closure produces a traceable result;
- major screens satisfy accessibility checks;
- no hardcoded KPI values.

---

## Milestone 5 — Release Hardening

### Objective

Produce a stable hackathon/review build.

### Deliverables

- production Dockerfiles;
- environment-specific configuration;
- secure cookie configuration;
- request rate limits;
- backup/restore notes;
- error pages;
- logging and request IDs;
- E2E smoke suite;
- demo-reset procedure;
- architecture diagram;
- known-limitations document (explicitly listing QR-scanner, technician-portal, and booking-heatmap as deferred);
- release tag.

### Exit criteria

- production build starts from a clean environment;
- migrations run before application traffic;
- no default production secrets;
- critical E2E suite passes;
- demo reset is deterministic;
- release notes identify scope and limitations;
- tagged commit is reproducible from the lockfile.

---

# 15. Definition of Done for Every Work Item

A work item is done only when:

- acceptance criteria are met;
- authorization is enforced server-side;
- input is validated;
- data integrity is protected by transaction/constraint where required;
- tests cover the happy path and meaningful failure path;
- activity logging is added for mutations;
- user-visible errors are actionable;
- loading, empty, and error UI states exist;
- no unrelated files are changed;
- documentation/contracts are updated;
- CI passes;
- the domain owner approves;
- shared-file approval is obtained when relevant.

---

# 16. Architecture Decision Records

Create a short ADR for decisions that are expensive to reverse.

Initial ADRs:

```text
0001-pnpm-monorepo.md
0002-rest-api.md
0003-prisma-with-raw-postgres-constraints.md
0004-database-backed-cookie-sessions.md
0005-single-organization-mvp.md
0006-unified-asset-and-bookable-resource.md
0007-trunk-based-development.md
0008-path-based-code-ownership.md
0009-maintenance-requires-technician-assignment.md
0010-qr-code-as-stored-value-not-scanner.md
```

Each ADR contains:

- context;
- decision;
- alternatives considered;
- consequences;
- status;
- date.

Do not use ADRs for trivial implementation details.

---

# 17. Known Post-MVP Decisions

These are intentionally deferred:

- true multi-tenant onboarding and tenant isolation strategy;
- asset/resource subtype model;
- external technician identities, role, login, and portal;
- email and messaging providers;
- file/object storage;
- preventive maintenance scheduling;
- recurring bookings;
- capacity-based resources;
- QR label printing and camera-based scanner support (a stored, searchable QR value is in MVP scope; hardware scanning is not);
- booking heatmap visualization (list-based reports are in MVP scope; the heatmap is a stretch item — see 4.3.I);
- SSO;
- advanced predictive analytics;
- localization;
- audit evidence attachments;
- data-retention policy;
- production hosting provider.

Deferral means the MVP must avoid choices that make these impossible, not that it must implement them now.

---

# 18. Final Team Rules

1. Own a vertical domain, not only a frontend or backend layer.
2. Do not edit shared hotspots without the single writer.
3. Do not bypass review by placing domain code in generic shared folders.
4. Keep business rules in services and database constraints.
5. Keep PRs small and branches short-lived.
6. Rebase before review and squash on merge.
7. Do not accept generated code without domain review.
8. Do not add dependencies to solve small problems already handled by the platform.
9. Do not weaken types, lint rules, authorization, or constraints to make CI pass.
10. Optimize for a coherent, demonstrable product rather than the number of screens or commits.
