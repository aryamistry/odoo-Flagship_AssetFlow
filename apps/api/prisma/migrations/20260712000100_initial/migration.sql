-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('EMPLOYEE', 'ADMIN', 'ASSET_MANAGER', 'DEPARTMENT_HEAD');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('SITE', 'BUILDING', 'FLOOR', 'ROOM', 'AREA', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ALLOCATED', 'RESERVED', 'UNDER_MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AllocationEndReason" AS ENUM ('RETURNED', 'TRANSFERRED', 'MAINTENANCE', 'LOST', 'RETIRED', 'DISPOSED', 'ADMIN_CORRECTION');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'TECHNICIAN_ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceOutcome" AS ENUM ('RESTORE_PREVIOUS_ALLOCATION', 'MAKE_AVAILABLE', 'RETIRE', 'MARK_LOST');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditItemResult" AS ENUM ('PENDING', 'VERIFIED', 'MISSING', 'DAMAGED');

-- CreateEnum
CREATE TYPE "DiscrepancyType" AS ENUM ('MISSING', 'DAMAGED', 'LOCATION_MISMATCH', 'CUSTODIAN_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscrepancyStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DiscrepancyAction" AS ENUM ('MARK_LOST', 'CREATE_MAINTENANCE', 'CORRECT_LOCATION', 'CORRECT_CUSTODIAN', 'MARK_VERIFIED', 'DISMISS');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "default_timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_department_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "parent_location_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL,
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "primary_department_id" UUID,
    "employee_code" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "RoleType" NOT NULL,
    "department_id" UUID,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_useful_life_months" INTEGER,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_field_definitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "FieldType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "options_json" JSONB,
    "validation_json" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "category_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "qr_token" UUID NOT NULL,
    "qr_code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "serial_number" TEXT,
    "owning_department_id" UUID,
    "current_location_id" UUID,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "is_bookable" BOOLEAN NOT NULL DEFAULT false,
    "acquisition_date" DATE,
    "acquisition_cost_minor" BIGINT,
    "acquisition_currency" CHAR(3),
    "expected_retirement_on" DATE,
    "attachment_url" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_field_values" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "field_definition_id" UUID NOT NULL,
    "value_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asset_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "from_status" "AssetStatus",
    "to_status" "AssetStatus" NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_text" TEXT,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "changed_by_user_id" UUID,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_profiles" (
    "asset_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "minimum_duration_minutes" INTEGER NOT NULL DEFAULT 15,
    "maximum_duration_minutes" INTEGER,
    "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
    "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
    "advance_booking_days" INTEGER,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "allow_department_booking" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "resource_profiles_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "allocated_to_user_id" UUID,
    "allocated_to_department_id" UUID,
    "allocated_by_user_id" UUID NOT NULL,
    "allocated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_return_at" TIMESTAMPTZ,
    "checkout_condition" "AssetCondition" NOT NULL,
    "checkout_notes" TEXT,
    "ended_at" TIMESTAMPTZ,
    "ended_by_user_id" UUID,
    "end_reason" "AllocationEndReason",
    "checkin_condition" "AssetCondition",
    "checkin_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "source_allocation_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "to_user_id" UUID,
    "to_department_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_notes" TEXT,
    "resulting_allocation_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING',
    "proposed_condition" "AssetCondition",
    "request_notes" TEXT,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "checkin_condition" "AssetCondition",
    "checkin_notes" TEXT,
    "decision_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "booked_for_user_id" UUID,
    "booked_for_department_id" UUID,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "effective_start_at" TIMESTAMPTZ NOT NULL,
    "effective_end_at" TIMESTAMPTZ NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "cancelled_by_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancellation_reason" TEXT,
    "completed_at" TIMESTAMPTZ,
    "rescheduled_from_booking_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "issue_description" TEXT NOT NULL,
    "priority" "MaintenancePriority" NOT NULL,
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PENDING',
    "attachment_url" TEXT,
    "assigned_technician_user_id" UUID,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "rejected_by_user_id" UUID,
    "rejected_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "started_at" TIMESTAMPTZ,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "resolution_outcome" "MaintenanceOutcome",
    "previous_asset_status" "AssetStatus",
    "previous_allocation_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "maintenance_request_id" UUID NOT NULL,
    "from_status" "MaintenanceStatus",
    "to_status" "MaintenanceStatus" NOT NULL,
    "performed_by_user_id" UUID,
    "notes" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_cycles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AuditStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "scope_department_id" UUID,
    "scope_location_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ,
    "review_started_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audit_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audit_cycle_id" UUID NOT NULL,
    "auditor_user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "audit_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audit_cycle_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "snapshot_asset_tag" TEXT NOT NULL,
    "snapshot_asset_name" TEXT NOT NULL,
    "expected_status" "AssetStatus" NOT NULL,
    "expected_condition" "AssetCondition" NOT NULL,
    "expected_location_id" UUID,
    "expected_department_id" UUID,
    "expected_holder_user_id" UUID,
    "expected_holder_department_id" UUID,
    "result" "AuditItemResult" NOT NULL DEFAULT 'PENDING',
    "observed_location_id" UUID,
    "observed_condition" "AssetCondition",
    "checked_by_user_id" UUID,
    "checked_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_discrepancies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audit_item_id" UUID NOT NULL,
    "type" "DiscrepancyType" NOT NULL,
    "status" "DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "details" TEXT,
    "resolution_action" "DiscrepancyAction",
    "resolution_notes" TEXT,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "related_maintenance_request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audit_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "dedup_key" TEXT,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "request_id" UUID,
    "summary" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "departments_organization_id_status_idx" ON "departments"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_code_key" ON "departments"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organization_id_code_key" ON "locations"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_employee_code_key" ON "users"("organization_id", "employee_code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_revoked_at_idx" ON "user_roles"("user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_organization_id_code_key" ON "asset_categories"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "category_field_definitions_category_id_field_key_key" ON "category_field_definitions"("category_id", "field_key");

-- CreateIndex
CREATE INDEX "assets_organization_id_status_idx" ON "assets"("organization_id", "status");

-- CreateIndex
CREATE INDEX "assets_organization_id_category_id_idx" ON "assets"("organization_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organization_id_asset_tag_key" ON "assets"("organization_id", "asset_tag");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organization_id_serial_number_key" ON "assets"("organization_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organization_id_qr_code_key" ON "assets"("organization_id", "qr_code");

-- CreateIndex
CREATE UNIQUE INDEX "assets_qr_token_key" ON "assets"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "asset_field_values_asset_id_field_definition_id_key" ON "asset_field_values"("asset_id", "field_definition_id");

-- CreateIndex
CREATE INDEX "asset_status_history_asset_id_changed_at_idx" ON "asset_status_history"("asset_id", "changed_at");

-- CreateIndex
CREATE INDEX "allocations_organization_id_expected_return_at_idx" ON "allocations"("organization_id", "expected_return_at");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_requests_resulting_allocation_id_key" ON "transfer_requests"("resulting_allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_rescheduled_from_booking_id_key" ON "bookings"("rescheduled_from_booking_id");

-- CreateIndex
CREATE INDEX "bookings_asset_id_start_at_idx" ON "bookings"("asset_id", "start_at");

-- CreateIndex
CREATE INDEX "maintenance_requests_organization_id_status_priority_idx" ON "maintenance_requests"("organization_id", "status", "priority");

-- CreateIndex
CREATE INDEX "maintenance_events_maintenance_request_id_created_at_idx" ON "maintenance_events"("maintenance_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_cycles_organization_id_code_key" ON "audit_cycles"("organization_id", "code");

-- CreateIndex
CREATE INDEX "audit_assignments_audit_cycle_id_auditor_user_id_idx" ON "audit_assignments"("audit_cycle_id", "auditor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_items_audit_cycle_id_asset_id_key" ON "audit_items"("audit_cycle_id", "asset_id");

-- CreateIndex
CREATE INDEX "audit_discrepancies_audit_item_id_status_idx" ON "audit_discrepancies"("audit_item_id", "status");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_created_at_idx" ON "notifications"("recipient_user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_created_at_idx" ON "activity_logs"("organization_id", "created_at");

-- PostgreSQL integrity rules that Prisma cannot express.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX "one_active_allocation_per_asset"
ON "allocations" ("asset_id") WHERE "ended_at" IS NULL;

ALTER TABLE "bookings" ADD CONSTRAINT "booking_no_overlap"
EXCLUDE USING gist (
  "asset_id" WITH =,
  tstzrange("effective_start_at", "effective_end_at", '[)') WITH &&
) WHERE ("status" IN ('PENDING', 'CONFIRMED'));

CREATE UNIQUE INDEX "one_open_maintenance_per_asset"
ON "maintenance_requests" ("asset_id")
WHERE "status" IN ('PENDING', 'APPROVED', 'TECHNICIAN_ASSIGNED', 'IN_PROGRESS');

CREATE UNIQUE INDEX "one_pending_transfer_per_allocation"
ON "transfer_requests" ("source_allocation_id") WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "one_pending_return_per_allocation"
ON "return_requests" ("allocation_id") WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "one_active_role_assignment"
ON "user_roles" ("user_id", "role", COALESCE("department_id", '00000000-0000-0000-0000-000000000000'::uuid))
WHERE "revoked_at" IS NULL;

CREATE UNIQUE INDEX "notification_deduplication"
ON "notifications" ("recipient_user_id", "dedup_key") WHERE "dedup_key" IS NOT NULL;

ALTER TABLE "allocations" ADD CONSTRAINT "allocation_exactly_one_holder" CHECK (
  ("allocated_to_user_id" IS NOT NULL)::int + ("allocated_to_department_id" IS NOT NULL)::int = 1
);
ALTER TABLE "allocations" ADD CONSTRAINT "allocation_end_fields_together" CHECK (
  ("ended_at" IS NULL AND "end_reason" IS NULL) OR ("ended_at" IS NOT NULL AND "end_reason" IS NOT NULL)
);
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_exactly_one_destination" CHECK (
  ("to_user_id" IS NOT NULL)::int + ("to_department_id" IS NOT NULL)::int = 1
);
ALTER TABLE "bookings" ADD CONSTRAINT "booking_valid_interval" CHECK (
  "start_at" < "end_at" AND "effective_start_at" <= "start_at" AND "effective_end_at" >= "end_at"
);
ALTER TABLE "bookings" ADD CONSTRAINT "booking_exactly_one_beneficiary" CHECK (
  ("booked_for_user_id" IS NOT NULL)::int + ("booked_for_department_id" IS NOT NULL)::int = 1
);
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_technician_required" CHECK (
  "status" NOT IN ('TECHNICIAN_ASSIGNED', 'IN_PROGRESS', 'RESOLVED') OR "assigned_technician_user_id" IS NOT NULL
);
ALTER TABLE "audit_cycles" ADD CONSTRAINT "audit_valid_dates" CHECK ("start_date" <= "end_date");
ALTER TABLE "audit_cycles" ADD CONSTRAINT "audit_has_scope" CHECK (
  "scope_department_id" IS NOT NULL OR "scope_location_id" IS NOT NULL
);

-- Core referential integrity. Historical rows restrict deletion by design.
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_fk" FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT;
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_fk" FOREIGN KEY ("parent_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT;
ALTER TABLE "users" ADD CONSTRAINT "users_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "users" ADD CONSTRAINT "users_department_fk" FOREIGN KEY ("primary_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT;
ALTER TABLE "user_roles" ADD CONSTRAINT "roles_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "asset_categories" ADD CONSTRAINT "categories_org_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "category_field_definitions" ADD CONSTRAINT "category_fields_category_fk" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_fk" FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_department_fk" FOREIGN KEY ("owning_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_location_fk" FOREIGN KEY ("current_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT;
ALTER TABLE "asset_field_values" ADD CONSTRAINT "asset_values_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "asset_status_history" ADD CONSTRAINT "asset_history_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "resource_profiles" ADD CONSTRAINT "resource_profile_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfers_allocation_fk" FOREIGN KEY ("source_allocation_id") REFERENCES "allocations"("id") ON DELETE RESTRICT;
ALTER TABLE "return_requests" ADD CONSTRAINT "returns_allocation_fk" FOREIGN KEY ("allocation_id") REFERENCES "allocations"("id") ON DELETE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_request_fk" FOREIGN KEY ("maintenance_request_id") REFERENCES "maintenance_requests"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_assignments" ADD CONSTRAINT "audit_assignments_cycle_fk" FOREIGN KEY ("audit_cycle_id") REFERENCES "audit_cycles"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_cycle_fk" FOREIGN KEY ("audit_cycle_id") REFERENCES "audit_cycles"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "audit_discrepancies" ADD CONSTRAINT "audit_discrepancies_item_fk" FOREIGN KEY ("audit_item_id") REFERENCES "audit_items"("id") ON DELETE RESTRICT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
