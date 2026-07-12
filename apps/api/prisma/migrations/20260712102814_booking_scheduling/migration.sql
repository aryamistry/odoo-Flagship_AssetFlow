-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'OFFERED', 'FULFILLED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "approved_at" TIMESTAMPTZ,
ADD COLUMN     "approved_by_user_id" UUID,
ADD COLUMN     "occurrence_number" INTEGER,
ADD COLUMN     "participant_count" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "recurrence_group_id" UUID,
ADD COLUMN     "recurrence_rule" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMPTZ,
ADD COLUMN     "rejected_by_user_id" UUID,
ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "resource_profiles" ADD COLUMN     "allow_recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "availability_json" JSONB,
ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "booking_waitlist_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "booked_for_user_id" UUID,
    "booked_for_department_id" UUID,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "desired_start_at" TIMESTAMPTZ NOT NULL,
    "desired_end_at" TIMESTAMPTZ NOT NULL,
    "participant_count" INTEGER NOT NULL DEFAULT 1,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "offered_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "booking_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "job_name" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result_json" JSONB,
    "error_text" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_waitlist_entries_asset_id_status_desired_start_at_idx" ON "booking_waitlist_entries"("asset_id", "status", "desired_start_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_idempotency_key_key" ON "job_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "bookings_recurrence_group_id_idx" ON "bookings"("recurrence_group_id");

-- Preserve existing foreign keys from the initial baseline. Prisma models intentionally
-- use scalar IDs so cross-domain services remain decoupled; raw SQL owns these rules.
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT;
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "booking_waitlist_requester_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "resource_profiles" ADD CONSTRAINT "resource_profile_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "bookings" ADD CONSTRAINT "booking_participant_count_positive" CHECK ("participant_count" > 0);
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "waitlist_valid_interval" CHECK ("desired_start_at" < "desired_end_at");
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "waitlist_participant_count_positive" CHECK ("participant_count" > 0);
ALTER TABLE "booking_waitlist_entries" ADD CONSTRAINT "waitlist_exactly_one_beneficiary" CHECK (
  ("booked_for_user_id" IS NOT NULL)::int + ("booked_for_department_id" IS NOT NULL)::int = 1
);

-- Capacity one had previously been represented by a PostgreSQL exclusion
-- constraint. A per-resource lock plus this trigger retains race protection while
-- allowing a room or pooled resource to accept overlapping participant bookings.
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "booking_no_overlap";

CREATE OR REPLACE FUNCTION "enforce_booking_capacity"()
RETURNS trigger AS $$
DECLARE
  resource_capacity INTEGER;
  occupied_capacity INTEGER;
BEGIN
  IF NEW."status" NOT IN ('PENDING', 'CONFIRMED') THEN
    RETURN NEW;
  END IF;

  SELECT "capacity" INTO resource_capacity
  FROM "resource_profiles"
  WHERE "asset_id" = NEW."asset_id"
  FOR UPDATE;

  IF resource_capacity IS NULL THEN
    RAISE EXCEPTION 'resource profile missing for booking asset %', NEW."asset_id" USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM("participant_count"), 0) INTO occupied_capacity
  FROM "bookings"
  WHERE "asset_id" = NEW."asset_id"
    AND "id" IS DISTINCT FROM NEW."id"
    AND "status" IN ('PENDING', 'CONFIRMED')
    AND tstzrange("effective_start_at", "effective_end_at", '[)') && tstzrange(NEW."effective_start_at", NEW."effective_end_at", '[)');

  IF occupied_capacity + NEW."participant_count" > resource_capacity THEN
    RAISE EXCEPTION 'booking capacity exceeded for asset %', NEW."asset_id" USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "booking_capacity_guard"
BEFORE INSERT OR UPDATE OF "asset_id", "effective_start_at", "effective_end_at", "status", "participant_count"
ON "bookings"
FOR EACH ROW EXECUTE FUNCTION "enforce_booking_capacity"();
