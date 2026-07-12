import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/platform/auth/password.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://assetflow:assetflow@localhost:5432/assetflow?schema=public";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const pepper = process.env.SESSION_PEPPER ?? "development-only-change-me-please-32-bytes";
const password = "AssetFlow123!";

const ids = {
  org: "00000000-0000-4000-8000-000000000001",
  engineering: "00000000-0000-4000-8000-000000000101",
  facilities: "00000000-0000-4000-8000-000000000102",
  finance: "00000000-0000-4000-8000-000000000103",
  campus: "00000000-0000-4000-8000-000000000201",
  building: "00000000-0000-4000-8000-000000000202",
  store: "00000000-0000-4000-8000-000000000203",
  room: "00000000-0000-4000-8000-000000000204",
  parking: "00000000-0000-4000-8000-000000000205",
  admin: "00000000-0000-4000-8000-000000000301",
  manager: "00000000-0000-4000-8000-000000000302",
  head: "00000000-0000-4000-8000-000000000303",
  employee: "00000000-0000-4000-8000-000000000304",
  electronics: "00000000-0000-4000-8000-000000000401",
  furniture: "00000000-0000-4000-8000-000000000402",
  vehicle: "00000000-0000-4000-8000-000000000403",
  roomCategory: "00000000-0000-4000-8000-000000000404",
  laptopAvailable: "00000000-0000-4000-8000-000000000501",
  laptopAllocated: "00000000-0000-4000-8000-000000000502",
  projector: "00000000-0000-4000-8000-000000000503",
  meetingRoom: "00000000-0000-4000-8000-000000000504",
  vehicleAsset: "00000000-0000-4000-8000-000000000505",
  printer: "00000000-0000-4000-8000-000000000506",
};

async function main() {
  const passwordHash = await hashPassword(password, pepper);
  const now = new Date();
  const hours = (amount: number) => new Date(now.getTime() + amount * 3_600_000);
  const days = (amount: number) => new Date(now.getTime() + amount * 86_400_000);

  await prisma.organization.upsert({ where: { id: ids.org }, update: { name: "AssetFlow Demo" }, create: { id: ids.org, name: "AssetFlow Demo", slug: "assetflow-demo" } });
  for (const department of [
    { id: ids.engineering, code: "ENG", name: "Engineering" },
    { id: ids.facilities, code: "FAC", name: "Facilities" },
    { id: ids.finance, code: "FIN", name: "Finance" },
  ]) await prisma.department.upsert({ where: { id: department.id }, update: department, create: { ...department, organizationId: ids.org } });

  for (const location of [
    { id: ids.campus, code: "AMD", name: "Ahmedabad Campus", type: "SITE" as const, parentLocationId: null },
    { id: ids.building, code: "MAIN", name: "Main Building", type: "BUILDING" as const, parentLocationId: ids.campus },
    { id: ids.store, code: "ENG-STORE", name: "Engineering Store", type: "AREA" as const, parentLocationId: ids.building },
    { id: ids.room, code: "ROOM-B2", name: "Room B2", type: "ROOM" as const, parentLocationId: ids.building },
    { id: ids.parking, code: "PARKING", name: "Parking", type: "AREA" as const, parentLocationId: ids.campus },
  ]) await prisma.location.upsert({ where: { id: location.id }, update: location, create: { ...location, organizationId: ids.org } });

  for (const user of [
    { id: ids.admin, firstName: "Aarav", lastName: "Admin", email: "admin@assetflow.local", employeeCode: "EMP-001", primaryDepartmentId: ids.facilities },
    { id: ids.manager, firstName: "Maya", lastName: "Manager", email: "manager@assetflow.local", employeeCode: "EMP-002", primaryDepartmentId: ids.facilities },
    { id: ids.head, firstName: "Dev", lastName: "Head", email: "head@assetflow.local", employeeCode: "EMP-003", primaryDepartmentId: ids.engineering },
    { id: ids.employee, firstName: "Riya", lastName: "Employee", email: "employee@assetflow.local", employeeCode: "EMP-004", primaryDepartmentId: ids.engineering },
  ]) await prisma.user.upsert({ where: { id: user.id }, update: { ...user, passwordHash }, create: { ...user, passwordHash, organizationId: ids.org } });

  await prisma.userRole.deleteMany({ where: { organizationId: ids.org } });
  await prisma.userRole.createMany({ data: [
    { organizationId: ids.org, userId: ids.admin, role: "EMPLOYEE" }, { organizationId: ids.org, userId: ids.admin, role: "ADMIN" },
    { organizationId: ids.org, userId: ids.manager, role: "EMPLOYEE" }, { organizationId: ids.org, userId: ids.manager, role: "ASSET_MANAGER" },
    { organizationId: ids.org, userId: ids.head, role: "EMPLOYEE" }, { organizationId: ids.org, userId: ids.head, role: "DEPARTMENT_HEAD", departmentId: ids.engineering },
    { organizationId: ids.org, userId: ids.employee, role: "EMPLOYEE" },
  ] });

  for (const category of [
    { id: ids.electronics, code: "ELECTRONICS", name: "Electronics", defaultUsefulLifeMonths: 48 },
    { id: ids.furniture, code: "FURNITURE", name: "Furniture", defaultUsefulLifeMonths: 120 },
    { id: ids.vehicle, code: "VEHICLE", name: "Vehicle", defaultUsefulLifeMonths: 96 },
    { id: ids.roomCategory, code: "ROOM", name: "Room", defaultUsefulLifeMonths: null },
  ]) await prisma.assetCategory.upsert({ where: { id: category.id }, update: category, create: { ...category, organizationId: ids.org } });

  const assets = [
    { id: ids.laptopAvailable, assetTag: "AF-0001", name: "Developer Laptop", categoryId: ids.electronics, status: "AVAILABLE" as const, condition: "GOOD" as const, isBookable: false, currentLocationId: ids.store, owningDepartmentId: ids.engineering },
    { id: ids.laptopAllocated, assetTag: "AF-0002", name: "Design Laptop", categoryId: ids.electronics, status: "ALLOCATED" as const, condition: "GOOD" as const, isBookable: false, currentLocationId: ids.store, owningDepartmentId: ids.engineering },
    { id: ids.projector, assetTag: "AF-0003", name: "Conference Projector", categoryId: ids.electronics, status: "AVAILABLE" as const, condition: "GOOD" as const, isBookable: true, currentLocationId: ids.store, owningDepartmentId: ids.facilities },
    { id: ids.meetingRoom, assetTag: "AF-0004", name: "Room B2", categoryId: ids.roomCategory, status: "AVAILABLE" as const, condition: "GOOD" as const, isBookable: true, currentLocationId: ids.room, owningDepartmentId: ids.facilities },
    { id: ids.vehicleAsset, assetTag: "AF-0005", name: "Operations Vehicle", categoryId: ids.vehicle, status: "AVAILABLE" as const, condition: "FAIR" as const, isBookable: true, currentLocationId: ids.parking, owningDepartmentId: ids.facilities },
    { id: ids.printer, assetTag: "AF-0006", name: "Office Printer", categoryId: ids.electronics, status: "UNDER_MAINTENANCE" as const, condition: "DAMAGED" as const, isBookable: false, currentLocationId: ids.store, owningDepartmentId: ids.facilities },
  ];
  for (const asset of assets) await prisma.asset.upsert({ where: { id: asset.id }, update: asset, create: { ...asset, organizationId: ids.org, createdByUserId: ids.manager } });
  for (const assetId of [ids.projector, ids.meetingRoom, ids.vehicleAsset]) await prisma.resourceProfile.upsert({ where: { assetId }, update: {}, create: { assetId, organizationId: ids.org, timezone: "Asia/Kolkata" } });

  const allocationId = "00000000-0000-4000-8000-000000000601";
  await prisma.allocation.upsert({ where: { id: allocationId }, update: { expectedReturnAt: days(-2) }, create: { id: allocationId, organizationId: ids.org, assetId: ids.laptopAllocated, allocatedToUserId: ids.employee, allocatedByUserId: ids.manager, expectedReturnAt: days(-2), checkoutCondition: "GOOD" } });
  await prisma.transferRequest.upsert({ where: { id: "00000000-0000-4000-8000-000000000602" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000602", organizationId: ids.org, assetId: ids.laptopAllocated, sourceAllocationId: allocationId, requestedByUserId: ids.employee, toDepartmentId: ids.finance, reason: "Project reassignment" } });
  await prisma.booking.upsert({ where: { id: "00000000-0000-4000-8000-000000000701" }, update: { startAt: hours(24), endAt: hours(26), effectiveStartAt: hours(24), effectiveEndAt: hours(26) }, create: { id: "00000000-0000-4000-8000-000000000701", organizationId: ids.org, assetId: ids.meetingRoom, requestedByUserId: ids.employee, bookedForUserId: ids.employee, title: "Engineering planning", startAt: hours(24), endAt: hours(26), effectiveStartAt: hours(24), effectiveEndAt: hours(26), status: "CONFIRMED" } });

  await prisma.maintenanceRequest.upsert({ where: { id: "00000000-0000-4000-8000-000000000801" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000801", organizationId: ids.org, assetId: ids.printer, requestedByUserId: ids.employee, issueDescription: "Paper feed mechanism jams", priority: "HIGH", status: "TECHNICIAN_ASSIGNED", assignedTechnicianUserId: ids.manager, approvedByUserId: ids.manager, approvedAt: now, previousAssetStatus: "AVAILABLE" } });
  await prisma.maintenanceEvent.deleteMany({ where: { maintenanceRequestId: "00000000-0000-4000-8000-000000000801" } });
  await prisma.maintenanceEvent.create({ data: { organizationId: ids.org, maintenanceRequestId: "00000000-0000-4000-8000-000000000801", toStatus: "TECHNICIAN_ASSIGNED", performedByUserId: ids.manager } });
  await prisma.maintenanceRequest.upsert({ where: { id: "00000000-0000-4000-8000-000000000802" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000802", organizationId: ids.org, assetId: ids.projector, requestedByUserId: ids.employee, issueDescription: "Image flickers after warm-up", priority: "MEDIUM" } });

  const auditId = "00000000-0000-4000-8000-000000000901";
  await prisma.auditCycle.upsert({ where: { id: auditId }, update: {}, create: { id: auditId, organizationId: ids.org, code: "AUD-2026-001", name: "Engineering asset check", status: "IN_PROGRESS", startDate: days(-1), endDate: days(5), scopeDepartmentId: ids.engineering, createdByUserId: ids.admin, startedAt: now } });
  await prisma.auditAssignment.upsert({ where: { id: "00000000-0000-4000-8000-000000000902" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000902", organizationId: ids.org, auditCycleId: auditId, auditorUserId: ids.employee, assignedByUserId: ids.admin } });
  const itemId = "00000000-0000-4000-8000-000000000903";
  await prisma.auditItem.upsert({ where: { id: itemId }, update: {}, create: { id: itemId, organizationId: ids.org, auditCycleId: auditId, assetId: ids.laptopAllocated, snapshotAssetTag: "AF-0002", snapshotAssetName: "Design Laptop", expectedStatus: "ALLOCATED", expectedCondition: "GOOD", expectedLocationId: ids.store, expectedDepartmentId: ids.engineering, expectedHolderUserId: ids.employee, result: "MISSING", checkedByUserId: ids.employee, checkedAt: now } });
  await prisma.auditDiscrepancy.upsert({ where: { id: "00000000-0000-4000-8000-000000000904" }, update: {}, create: { id: "00000000-0000-4000-8000-000000000904", organizationId: ids.org, auditItemId: itemId, type: "MISSING", details: "Asset not found at expected location" } });

  process.stdout.write(`Seeded AssetFlow Demo. Login with admin@assetflow.local / ${password}\n`);
}

main().finally(() => prisma.$disconnect());
