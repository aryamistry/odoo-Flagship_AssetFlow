import type { FieldType, LocationType, RecordStatus, RoleType, UserStatus } from "@prisma/client";
import { prisma, logActivity } from "../../platform/trace/trace.service.js";
import { AppError } from "../../platform/http/errors.js";

export async function listDepartments(organizationId: string) { return prisma.department.findMany({ where: { organizationId }, orderBy: { name: "asc" } }); }
export async function createDepartment(actorId: string, organizationId: string, requestId: string, input: { code: string; name: string; description?: string | undefined; parentDepartmentId?: string | undefined }) {
  const item = await prisma.department.create({ data: { organizationId, code: input.code.trim().toUpperCase(), name: input.name.trim(), description: input.description ?? null, parentDepartmentId: input.parentDepartmentId ?? null } });
  await logActivity(prisma, { organizationId, actorUserId: actorId, requestId, action: "DEPARTMENT_CREATED", entityType: "DEPARTMENT", entityId: item.id, summary: `Created department ${item.name}.` }); return item;
}
export async function updateDepartment(id: string, organizationId: string, input: { name?: string | undefined; description?: string | null | undefined; parentDepartmentId?: string | null | undefined; status?: RecordStatus | undefined }) {
  await requireOwned("department", id, organizationId); return prisma.department.update({ where: { id }, data: input });
}

export async function listLocations(organizationId: string) { return prisma.location.findMany({ where: { organizationId }, orderBy: [{ parentLocationId: "asc" }, { name: "asc" }] }); }
export async function createLocation(organizationId: string, input: { code: string; name: string; type: LocationType; description?: string | undefined; parentLocationId?: string | undefined }) { return prisma.location.create({ data: { organizationId, code: input.code.trim().toUpperCase(), name: input.name.trim(), type: input.type, description: input.description ?? null, parentLocationId: input.parentLocationId ?? null } }); }
export async function updateLocation(id: string, organizationId: string, input: { name?: string | undefined; type?: LocationType | undefined; description?: string | null | undefined; parentLocationId?: string | null | undefined; status?: RecordStatus | undefined }) { await requireOwned("location", id, organizationId); return prisma.location.update({ where: { id }, data: input }); }

export async function listCategories(organizationId: string) { return prisma.assetCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } }); }
export async function createCategory(organizationId: string, input: { code: string; name: string; description?: string | undefined; defaultUsefulLifeMonths?: number | undefined }) { return prisma.assetCategory.create({ data: { organizationId, code: input.code.trim().toUpperCase(), name: input.name.trim(), description: input.description ?? null, defaultUsefulLifeMonths: input.defaultUsefulLifeMonths ?? null } }); }
export async function updateCategory(id: string, organizationId: string, input: { name?: string | undefined; description?: string | null | undefined; defaultUsefulLifeMonths?: number | null | undefined; status?: RecordStatus | undefined }) { await requireOwned("assetCategory", id, organizationId); return prisma.assetCategory.update({ where: { id }, data: input }); }
export async function listCategoryFields(categoryId: string, organizationId: string) { return prisma.categoryFieldDefinition.findMany({ where: { categoryId, organizationId }, orderBy: { sortOrder: "asc" } }); }
export async function createCategoryField(categoryId: string, organizationId: string, input: { fieldKey: string; label: string; fieldType: FieldType; isRequired?: boolean | undefined; optionsJson?: unknown; validationJson?: unknown; sortOrder?: number | undefined }) {
  await requireOwned("assetCategory", categoryId, organizationId);
  return prisma.categoryFieldDefinition.create({ data: { organizationId, categoryId, fieldKey: input.fieldKey.trim().toLowerCase(), label: input.label.trim(), fieldType: input.fieldType, isRequired: input.isRequired ?? false, optionsJson: input.optionsJson as never, validationJson: input.validationJson as never, sortOrder: input.sortOrder ?? 0 } });
}
export async function updateCategoryField(id: string, organizationId: string, input: { label?: string | undefined; isRequired?: boolean | undefined; optionsJson?: unknown; validationJson?: unknown; sortOrder?: number | undefined; status?: RecordStatus | undefined }) { await requireOwned("categoryFieldDefinition", id, organizationId); return prisma.categoryFieldDefinition.update({ where: { id }, data: input as never }); }

export async function listEmployees(organizationId: string, page: number, pageSize: number) {
  const where = { organizationId }; const [items, total] = await prisma.$transaction([prisma.user.findMany({ where, select: { id: true, email: true, firstName: true, lastName: true, employeeCode: true, primaryDepartmentId: true, status: true, createdAt: true }, orderBy: { firstName: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.user.count({ where })]);
  const roles = await prisma.userRole.findMany({ where: { userId: { in: items.map((item) => item.id) }, revokedAt: null }, select: { userId: true, role: true, departmentId: true } });
  return { items: items.map((item) => ({ ...item, roles: roles.filter((role) => role.userId === item.id) })), total };
}
export async function updateEmployee(id: string, organizationId: string, input: { primaryDepartmentId?: string | null | undefined; status?: UserStatus | undefined }) {
  const user = await requireOwned("user", id, organizationId);
  if (input.status === "INACTIVE" && user.status === "ACTIVE") {
    const [allocations, maintenance, audits] = await Promise.all([
      prisma.allocation.count({ where: { organizationId, allocatedToUserId: id, endedAt: null } }),
      prisma.maintenanceRequest.count({ where: { organizationId, assignedTechnicianUserId: id, status: { in: ["TECHNICIAN_ASSIGNED", "IN_PROGRESS"] } } }),
      prisma.auditAssignment.count({ where: { organizationId, auditorUserId: id, revokedAt: null } }),
    ]); if (allocations + maintenance + audits > 0) throw new AppError(409, "ACTIVE_RESPONSIBILITIES", "Reassign active responsibilities before deactivating this employee.");
  }
  const updated = await prisma.user.update({ where: { id }, data: input });
  if (input.status && input.status !== "ACTIVE") await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  return updated;
}
export async function setRoles(actorId: string, id: string, organizationId: string, requestId: string, input: Array<{ role: RoleType; departmentId?: string | undefined }>) {
  await requireOwned("user", id, organizationId); const normalized = input.some((item) => item.role === "EMPLOYEE") ? input : [{ role: "EMPLOYEE" as const }, ...input];
  return prisma.$transaction(async (tx) => {
    await tx.userRole.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.userRole.createMany({ data: normalized.map((role) => ({ organizationId, userId: id, role: role.role, departmentId: role.role === "DEPARTMENT_HEAD" ? role.departmentId ?? null : null, assignedByUserId: actorId })) });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await logActivity(tx, { organizationId, actorUserId: actorId, requestId, action: "USER_ROLES_CHANGED", entityType: "USER", entityId: id, summary: "Updated employee roles." });
    return tx.userRole.findMany({ where: { userId: id, revokedAt: null } });
  });
}

async function requireOwned(model: "department" | "location" | "assetCategory" | "categoryFieldDefinition" | "user", id: string, organizationId: string) {
  const item = await (prisma[model] as never as { findFirst(args: unknown): Promise<{ id: string; status?: UserStatus } | null> }).findFirst({ where: { id, organizationId } });
  if (!item) throw new AppError(404, "NOT_FOUND", "The requested record was not found."); return item;
}

