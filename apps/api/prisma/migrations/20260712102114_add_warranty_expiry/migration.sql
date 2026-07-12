-- DropForeignKey
ALTER TABLE "allocations" DROP CONSTRAINT "allocations_asset_fk";

-- DropForeignKey
ALTER TABLE "asset_categories" DROP CONSTRAINT "categories_org_fk";

-- DropForeignKey
ALTER TABLE "asset_field_values" DROP CONSTRAINT "asset_values_asset_fk";

-- DropForeignKey
ALTER TABLE "asset_status_history" DROP CONSTRAINT "asset_history_asset_fk";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_category_fk";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_department_fk";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_location_fk";

-- DropForeignKey
ALTER TABLE "audit_assignments" DROP CONSTRAINT "audit_assignments_cycle_fk";

-- DropForeignKey
ALTER TABLE "audit_discrepancies" DROP CONSTRAINT "audit_discrepancies_item_fk";

-- DropForeignKey
ALTER TABLE "audit_items" DROP CONSTRAINT "audit_items_asset_fk";

-- DropForeignKey
ALTER TABLE "audit_items" DROP CONSTRAINT "audit_items_cycle_fk";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_asset_fk";

-- DropForeignKey
ALTER TABLE "category_field_definitions" DROP CONSTRAINT "category_fields_category_fk";

-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_org_fk";

-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_parent_fk";

-- DropForeignKey
ALTER TABLE "locations" DROP CONSTRAINT "locations_org_fk";

-- DropForeignKey
ALTER TABLE "locations" DROP CONSTRAINT "locations_parent_fk";

-- DropForeignKey
ALTER TABLE "maintenance_events" DROP CONSTRAINT "maintenance_events_request_fk";

-- DropForeignKey
ALTER TABLE "maintenance_requests" DROP CONSTRAINT "maintenance_asset_fk";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_fk";

-- DropForeignKey
ALTER TABLE "resource_profiles" DROP CONSTRAINT "resource_profile_asset_fk";

-- DropForeignKey
ALTER TABLE "return_requests" DROP CONSTRAINT "returns_allocation_fk";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_fk";

-- DropForeignKey
ALTER TABLE "transfer_requests" DROP CONSTRAINT "transfers_allocation_fk";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "roles_user_fk";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_department_fk";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_org_fk";

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "warranty_expiry_date" DATE;
