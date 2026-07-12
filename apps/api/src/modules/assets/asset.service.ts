import type { AssetCondition, Prisma } from "@prisma/client";
import { prisma, logActivity } from "../../platform/trace/trace.service.js";
import { AppError } from "../../platform/http/errors.js";

export type AssetFilters = { page: number; pageSize: number; search?: string | undefined; categoryId?: string | undefined; status?: string | undefined; departmentId?: string | undefined; locationId?: string | undefined };
type FieldDefinition = { id: string; fieldType: string; isRequired: boolean; optionsJson: unknown; validationJson: unknown };
export function validateCategoryFields(definitions: FieldDefinition[], values: Array<{ fieldDefinitionId: string; value: unknown }>) {
  const valueMap = new Map(values.map((item) => [item.fieldDefinitionId, item.value]));
  for (const definition of definitions) {
    const value = valueMap.get(definition.id);
    if (definition.isRequired && (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length))) throw new AppError(422, "REQUIRED_CATEGORY_FIELD", "Complete every required category field.");
    if (value === undefined || value === null || value === "") continue;
    const validType = definition.fieldType === "BOOLEAN" ? typeof value === "boolean" : ["INTEGER", "DECIMAL"].includes(definition.fieldType) ? typeof value === "number" && Number.isFinite(value) && (definition.fieldType !== "INTEGER" || Number.isInteger(value)) : definition.fieldType === "MULTI_SELECT" ? Array.isArray(value) && value.every((item) => typeof item === "string") : typeof value === "string";
    if (!validType) throw new AppError(422, "INVALID_CATEGORY_FIELD", "A category field has an invalid value type.");
    const options = Array.isArray(definition.optionsJson) ? definition.optionsJson.map(String) : [];
    if (definition.fieldType === "SELECT" && options.length && !options.includes(String(value))) throw new AppError(422, "INVALID_CATEGORY_FIELD_OPTION", "Select one of the configured category-field options.");
    if (definition.fieldType === "MULTI_SELECT" && options.length && !(value as string[]).every((item) => options.includes(item))) throw new AppError(422, "INVALID_CATEGORY_FIELD_OPTION", "Select only configured category-field options.");
    const pattern = definition.validationJson && typeof definition.validationJson === "object" && "pattern" in definition.validationJson ? String((definition.validationJson as { pattern: unknown }).pattern) : null;
    if (pattern && typeof value === "string" && !new RegExp(pattern).test(value)) throw new AppError(422, "CATEGORY_FIELD_VALIDATION_FAILED", "A category field does not match its validation rule.");
  }
  if (values.some((item) => !definitions.some((definition) => definition.id === item.fieldDefinitionId))) throw new AppError(422, "INVALID_CATEGORY_FIELD", "A category field does not belong to the selected category.");
}
export async function listAssets(organizationId: string, filters: AssetFilters) {
  const where: Prisma.AssetWhereInput = { organizationId, categoryId: filters.categoryId, status: filters.status as never, owningDepartmentId: filters.departmentId, currentLocationId: filters.locationId, ...(filters.search ? { OR: [{ assetTag: { contains: filters.search, mode: "insensitive" } }, { name: { contains: filters.search, mode: "insensitive" } }, { serialNumber: { contains: filters.search, mode: "insensitive" } }, { qrCode: { contains: filters.search, mode: "insensitive" } }] } : {}) };
  const [items, total] = await prisma.$transaction([prisma.asset.findMany({ where, orderBy: { assetTag: "asc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }), prisma.asset.count({ where })]); return { items, total };
}
export async function getAsset(id: string, organizationId: string) {
  const asset = await prisma.asset.findFirst({ where: { id, organizationId } }); if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  const [category, department, location, fields, activeAllocation, nextBookings, maintenance] = await Promise.all([
    prisma.assetCategory.findUnique({ where: { id: asset.categoryId } }), asset.owningDepartmentId ? prisma.department.findUnique({ where: { id: asset.owningDepartmentId } }) : null, asset.currentLocationId ? prisma.location.findUnique({ where: { id: asset.currentLocationId } }) : null,
    prisma.assetFieldValue.findMany({ where: { assetId: id } }), prisma.allocation.findFirst({ where: { assetId: id, endedAt: null } }), prisma.booking.findMany({ where: { assetId: id, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 5 }), prisma.maintenanceRequest.findFirst({ where: { assetId: id, status: { in: ["PENDING", "APPROVED", "TECHNICIAN_ASSIGNED", "IN_PROGRESS"] } } }),
  ]); return { ...asset, category, department, location, fields, activeAllocation, nextBookings, maintenance };
}
export async function createAsset(actorId: string, organizationId: string, requestId: string, input: { name: string; categoryId: string; serialNumber?: string | undefined; qrCode?: string | undefined; condition: AssetCondition; owningDepartmentId?: string | undefined; currentLocationId?: string | undefined; isBookable?: boolean | undefined; acquisitionDate?: string | undefined; acquisitionCostMinor?: number | undefined; acquisitionCurrency?: string | undefined; expectedRetirementOn?: string | undefined; attachmentUrl?: string | undefined; fields?: Array<{ fieldDefinitionId: string; value: unknown }> | undefined }) {
  if (!(await prisma.assetCategory.findFirst({ where: { id: input.categoryId, organizationId, status: "ACTIVE" } }))) throw new AppError(422, "INVALID_CATEGORY", "Select an active asset category.");
  const definitions = await prisma.categoryFieldDefinition.findMany({ where: { categoryId: input.categoryId, organizationId, status: "ACTIVE" }, select: { id: true, fieldType: true, isRequired: true, optionsJson: true, validationJson: true } });
  validateCategoryFields(definitions, input.fields ?? []);
  return prisma.$transaction(async (tx) => {
    const count = await tx.asset.count({ where: { organizationId } }); const assetTag = `AF-${String(count + 1).padStart(4, "0")}`;
    const asset = await tx.asset.create({ data: { organizationId, assetTag, name: input.name.trim(), categoryId: input.categoryId, serialNumber: input.serialNumber ?? null, qrCode: input.qrCode ?? null, condition: input.condition, owningDepartmentId: input.owningDepartmentId ?? null, currentLocationId: input.currentLocationId ?? null, isBookable: input.isBookable ?? false, acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : null, acquisitionCostMinor: input.acquisitionCostMinor ? BigInt(input.acquisitionCostMinor) : null, acquisitionCurrency: input.acquisitionCurrency ?? null, expectedRetirementOn: input.expectedRetirementOn ? new Date(input.expectedRetirementOn) : null, attachmentUrl: input.attachmentUrl ?? null, createdByUserId: actorId } });
    if (input.isBookable) await tx.resourceProfile.create({ data: { assetId: asset.id, organizationId, timezone: "Asia/Kolkata" } });
    if (input.fields?.length) await tx.assetFieldValue.createMany({ data: input.fields.map((field) => ({ organizationId, assetId: asset.id, fieldDefinitionId: field.fieldDefinitionId, valueJson: field.value as Prisma.InputJsonValue })) });
    await tx.assetStatusHistory.create({ data: { organizationId, assetId: asset.id, toStatus: "AVAILABLE", reasonCode: "REGISTERED", sourceType: "ADMIN", changedByUserId: actorId } });
    await logActivity(tx, { organizationId, actorUserId: actorId, requestId, action: "ASSET_REGISTERED", entityType: "ASSET", entityId: asset.id, summary: `Registered ${asset.assetTag} ${asset.name}.` }); return asset;
  });
}
export async function updateAsset(actorId: string, requestId: string, id: string, organizationId: string, input: { name?: string | undefined; description?: string | null | undefined; serialNumber?: string | null | undefined; qrCode?: string | null | undefined; condition?: AssetCondition | undefined; owningDepartmentId?: string | null | undefined; currentLocationId?: string | null | undefined; attachmentUrl?: string | null | undefined; expectedRetirementOn?: string | null | undefined; version: number }) {
  const current = await prisma.asset.findFirst({ where: { id, organizationId } }); if (!current) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found."); if (current.version !== input.version) throw new AppError(409, "ASSET_VERSION_CONFLICT", "This asset was updated by someone else. Refresh and retry.");
  const { version: _, expectedRetirementOn, ...rest } = input; return prisma.$transaction(async (tx) => { const updated = await tx.asset.update({ where: { id }, data: { ...rest, expectedRetirementOn: expectedRetirementOn === undefined ? undefined : expectedRetirementOn ? new Date(expectedRetirementOn) : null, version: { increment: 1 } } }); await logActivity(tx, { organizationId, actorUserId: actorId, requestId, action: "ASSET_METADATA_UPDATED", entityType: "ASSET", entityId: id, summary: `Updated metadata for ${updated.assetTag}.`, before: current, after: updated }); return updated; });
}
export async function history(id: string, organizationId: string) { await getAsset(id, organizationId); const [statuses, allocations, bookings, maintenance, audits] = await Promise.all([prisma.assetStatusHistory.findMany({ where: { assetId: id }, orderBy: { changedAt: "desc" } }), prisma.allocation.findMany({ where: { assetId: id }, orderBy: { allocatedAt: "desc" } }), prisma.booking.findMany({ where: { assetId: id }, orderBy: { startAt: "desc" } }), prisma.maintenanceRequest.findMany({ where: { assetId: id }, orderBy: { createdAt: "desc" } }), prisma.auditItem.findMany({ where: { assetId: id }, orderBy: { createdAt: "desc" } })]); return { statuses, allocations, bookings, maintenance, audits }; }
