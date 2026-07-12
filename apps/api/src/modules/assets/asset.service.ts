import type { AssetCondition, Prisma } from "@prisma/client";
import { prisma, logActivity } from "../../platform/trace/trace.service.js";
import { AppError } from "../../platform/http/errors.js";

export type AssetFilters = { page: number; pageSize: number; search?: string | undefined; categoryId?: string | undefined; status?: string | undefined; departmentId?: string | undefined; locationId?: string | undefined; warranty?: string | undefined };
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
  let warrantyExpiry: Prisma.DateTimeFilter | undefined = undefined;
  const now = new Date();
  if (filters.warranty === "expired") {
    warrantyExpiry = { lt: now };
  } else if (filters.warranty === "expiring") {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    warrantyExpiry = { gte: now, lte: thirtyDaysFromNow };
  }
  const where: Prisma.AssetWhereInput = {
    organizationId,
    categoryId: filters.categoryId,
    status: filters.status as never,
    owningDepartmentId: filters.departmentId,
    currentLocationId: filters.locationId,
    warrantyExpiryDate: warrantyExpiry,
    ...(filters.search ? { OR: [{ assetTag: { contains: filters.search, mode: "insensitive" } }, { name: { contains: filters.search, mode: "insensitive" } }, { serialNumber: { contains: filters.search, mode: "insensitive" } }, { qrCode: { contains: filters.search, mode: "insensitive" } }] } : {})
  };
  const [items, total] = await prisma.$transaction([prisma.asset.findMany({ where, orderBy: { assetTag: "asc" }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize }), prisma.asset.count({ where })]); return { items, total };
}
export async function getAsset(id: string, organizationId: string) {
  const asset = await prisma.asset.findFirst({ where: { id, organizationId } }); if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  const [category, department, location, fields, activeAllocation, nextBookings, maintenance] = await Promise.all([
    prisma.assetCategory.findUnique({ where: { id: asset.categoryId } }), asset.owningDepartmentId ? prisma.department.findUnique({ where: { id: asset.owningDepartmentId } }) : null, asset.currentLocationId ? prisma.location.findUnique({ where: { id: asset.currentLocationId } }) : null,
    prisma.assetFieldValue.findMany({ where: { assetId: id } }), prisma.allocation.findFirst({ where: { assetId: id, endedAt: null } }), prisma.booking.findMany({ where: { assetId: id, status: { in: ["PENDING", "CONFIRMED"] }, endAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 5 }), prisma.maintenanceRequest.findFirst({ where: { assetId: id, status: { in: ["PENDING", "APPROVED", "TECHNICIAN_ASSIGNED", "IN_PROGRESS"] } } }),
  ]); return { ...asset, category, department, location, fields, activeAllocation, nextBookings, maintenance };
}
export async function createAsset(actorId: string, organizationId: string, requestId: string, input: { name: string; categoryId: string; serialNumber?: string | undefined; qrCode?: string | undefined; condition: AssetCondition; owningDepartmentId?: string | undefined; currentLocationId?: string | undefined; isBookable?: boolean | undefined; acquisitionDate?: string | undefined; acquisitionCostMinor?: number | undefined; acquisitionCurrency?: string | undefined; expectedRetirementOn?: string | undefined; warrantyExpiryDate?: string | undefined; attachmentUrl?: string | undefined; fields?: Array<{ fieldDefinitionId: string; value: unknown }> | undefined }) {
  if (!(await prisma.assetCategory.findFirst({ where: { id: input.categoryId, organizationId, status: "ACTIVE" } }))) throw new AppError(422, "INVALID_CATEGORY", "Select an active asset category.");
  const definitions = await prisma.categoryFieldDefinition.findMany({ where: { categoryId: input.categoryId, organizationId, status: "ACTIVE" }, select: { id: true, fieldType: true, isRequired: true, optionsJson: true, validationJson: true } });
  validateCategoryFields(definitions, input.fields ?? []);
  return prisma.$transaction(async (tx) => {
    const count = await tx.asset.count({ where: { organizationId } }); const assetTag = `AF-${String(count + 1).padStart(4, "0")}`;
    const asset = await tx.asset.create({ data: { organizationId, assetTag, name: input.name.trim(), categoryId: input.categoryId, serialNumber: input.serialNumber ?? null, qrCode: input.qrCode ?? null, condition: input.condition, owningDepartmentId: input.owningDepartmentId ?? null, currentLocationId: input.currentLocationId ?? null, isBookable: input.isBookable ?? false, acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : null, acquisitionCostMinor: input.acquisitionCostMinor ? BigInt(input.acquisitionCostMinor) : null, acquisitionCurrency: input.acquisitionCurrency ?? null, expectedRetirementOn: input.expectedRetirementOn ? new Date(input.expectedRetirementOn) : null, warrantyExpiryDate: input.warrantyExpiryDate ? new Date(input.warrantyExpiryDate) : null, attachmentUrl: input.attachmentUrl ?? null, createdByUserId: actorId } });
    if (input.isBookable) await tx.resourceProfile.create({ data: { assetId: asset.id, organizationId, timezone: "Asia/Kolkata" } });
    if (input.fields?.length) await tx.assetFieldValue.createMany({ data: input.fields.map((field) => ({ organizationId, assetId: asset.id, fieldDefinitionId: field.fieldDefinitionId, valueJson: field.value as Prisma.InputJsonValue })) });
    await tx.assetStatusHistory.create({ data: { organizationId, assetId: asset.id, toStatus: "AVAILABLE", reasonCode: "REGISTERED", sourceType: "ADMIN", changedByUserId: actorId } });
    await logActivity(tx, { organizationId, actorUserId: actorId, requestId, action: "ASSET_REGISTERED", entityType: "ASSET", entityId: asset.id, summary: `Registered ${asset.assetTag} ${asset.name}.` }); return asset;
  });
}
export async function updateAsset(actorId: string, requestId: string, id: string, organizationId: string, input: { name?: string | undefined; description?: string | null | undefined; serialNumber?: string | null | undefined; qrCode?: string | null | undefined; condition?: AssetCondition | undefined; owningDepartmentId?: string | null | undefined; currentLocationId?: string | null | undefined; attachmentUrl?: string | null | undefined; expectedRetirementOn?: string | null | undefined; warrantyExpiryDate?: string | null | undefined; version: number }) {
  const current = await prisma.asset.findFirst({ where: { id, organizationId } }); if (!current) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found."); if (current.version !== input.version) throw new AppError(409, "ASSET_VERSION_CONFLICT", "This asset was updated by someone else. Refresh and retry.");
  const { version: _, expectedRetirementOn, warrantyExpiryDate, ...rest } = input; return prisma.$transaction(async (tx) => { const updated = await tx.asset.update({ where: { id }, data: { ...rest, expectedRetirementOn: expectedRetirementOn === undefined ? undefined : expectedRetirementOn ? new Date(expectedRetirementOn) : null, warrantyExpiryDate: warrantyExpiryDate === undefined ? undefined : warrantyExpiryDate ? new Date(warrantyExpiryDate) : null, version: { increment: 1 } } }); await logActivity(tx, { organizationId, actorUserId: actorId, requestId, action: "ASSET_METADATA_UPDATED", entityType: "ASSET", entityId: id, summary: `Updated metadata for ${updated.assetTag}.`, before: current, after: updated }); return updated; });
}
export async function history(id: string, organizationId: string) { await getAsset(id, organizationId); const [statuses, allocations, bookings, maintenance, audits] = await Promise.all([prisma.assetStatusHistory.findMany({ where: { assetId: id }, orderBy: { changedAt: "desc" } }), prisma.allocation.findMany({ where: { assetId: id }, orderBy: { allocatedAt: "desc" } }), prisma.booking.findMany({ where: { assetId: id }, orderBy: { startAt: "desc" } }), prisma.maintenanceRequest.findMany({ where: { assetId: id }, orderBy: { createdAt: "desc" } }), prisma.auditItem.findMany({ where: { assetId: id }, orderBy: { createdAt: "desc" } })]); return { statuses, allocations, bookings, maintenance, audits }; }

export async function lookupByToken(organizationId: string, token: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  const asset = await prisma.asset.findFirst({
    where: {
      organizationId,
      OR: [
        ...(isUuid ? [{ qrToken: token }] : []),
        { qrCode: token },
        { serialNumber: token },
        { assetTag: token }
      ]
    }
  });
  if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  return getAsset(asset.id, organizationId);
}

export async function exportAssets(organizationId: string, filters: { search?: string; categoryId?: string; status?: string; departmentId?: string; locationId?: string }) {
  const where: Prisma.AssetWhereInput = {
    organizationId,
    categoryId: filters.categoryId,
    status: filters.status as any,
    owningDepartmentId: filters.departmentId,
    currentLocationId: filters.locationId,
    ...(filters.search ? {
      OR: [
        { assetTag: { contains: filters.search, mode: "insensitive" } },
        { name: { contains: filters.search, mode: "insensitive" } },
        { serialNumber: { contains: filters.search, mode: "insensitive" } },
        { qrCode: { contains: filters.search, mode: "insensitive" } }
      ]
    } : {})
  };
  const [assets, categories, departments, locations] = await Promise.all([
    prisma.asset.findMany({ where, orderBy: { assetTag: "asc" } }),
    prisma.assetCategory.findMany({ where: { organizationId } }),
    prisma.department.findMany({ where: { organizationId } }),
    prisma.location.findMany({ where: { organizationId } })
  ]);
  const catMap = new Map(categories.map(c => [c.id, c.name]));
  const deptMap = new Map(departments.map(d => [d.id, d.name]));
  const locMap = new Map(locations.map(l => [l.id, l.name]));
  return assets.map(asset => ({
    ...asset,
    categoryName: catMap.get(asset.categoryId) ?? "",
    departmentName: asset.owningDepartmentId ? (deptMap.get(asset.owningDepartmentId) ?? "") : "",
    locationName: asset.currentLocationId ? (locMap.get(asset.currentLocationId) ?? "") : ""
  }));
}

export async function bulkUpdate(
  actorId: string,
  requestId: string,
  organizationId: string,
  input: {
    ids: string[];
    currentLocationId?: string | null;
    owningDepartmentId?: string | null;
    condition?: AssetCondition;
    status?: any;
  }
) {
  return prisma.$transaction(async (tx) => {
    const assets = await tx.asset.findMany({ where: { id: { in: input.ids }, organizationId } });
    const updatedAssets: any[] = [];
    for (const asset of assets) {
      const dataToUpdate: any = {};
      if (input.currentLocationId !== undefined) dataToUpdate.currentLocationId = input.currentLocationId;
      if (input.owningDepartmentId !== undefined) dataToUpdate.owningDepartmentId = input.owningDepartmentId;
      if (input.condition !== undefined) dataToUpdate.condition = input.condition;
      if (input.status !== undefined && input.status !== asset.status) dataToUpdate.status = input.status;
      if (Object.keys(dataToUpdate).length === 0) continue;
      const updated = await tx.asset.update({
        where: { id: asset.id },
        data: { ...dataToUpdate, version: { increment: 1 } }
      });
      if (dataToUpdate.status) {
        await tx.assetStatusHistory.create({
          data: {
            organizationId,
            assetId: asset.id,
            fromStatus: asset.status,
            toStatus: dataToUpdate.status,
            reasonCode: "BULK_UPDATE",
            sourceType: "ADMIN",
            changedByUserId: actorId
          }
        });
      }
      updatedAssets.push(updated);
    }
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: "ASSET_BULK_UPDATED",
      entityType: "ASSET",
      summary: `Bulk updated ${updatedAssets.length} assets.`
    });
    return updatedAssets;
  });
}

export async function bulkImport(
  actorId: string,
  organizationId: string,
  requestId: string,
  input: { confirm: boolean; rows: any[] }
) {
  const [categories, departments, locations] = await Promise.all([
    prisma.assetCategory.findMany({ where: { organizationId, status: "ACTIVE" } }),
    prisma.department.findMany({ where: { organizationId, status: "ACTIVE" } }),
    prisma.location.findMany({ where: { organizationId, status: "ACTIVE" } })
  ]);
  const catMap = new Map(categories.map(c => [c.code.toLowerCase(), c.id]));
  const catNameMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));
  const deptMap = new Map(departments.map(d => [d.code.toLowerCase(), d.id]));
  const deptNameMap = new Map(departments.map(d => [d.name.toLowerCase(), d.id]));
  const locMap = new Map(locations.map(l => [l.code.toLowerCase(), l.id]));
  const locNameMap = new Map(locations.map(l => [l.name.toLowerCase(), l.id]));
  
  const existingAssets = await prisma.asset.findMany({
    where: { organizationId },
    select: { serialNumber: true, qrCode: true }
  });
  const existingSerials = new Set(existingAssets.map(a => a.serialNumber?.toLowerCase()).filter(Boolean));
  const existingQrCodes = new Set(existingAssets.map(a => a.qrCode?.toLowerCase()).filter(Boolean));
  
  const results: any[] = [];
  let hasErrors = false;
  const csvSerials = new Set<string>();
  const csvQrCodes = new Set<string>();
  
  for (let i = 0; i < input.rows.length; i++) {
    const row = input.rows[i];
    const errors: string[] = [];
    if (!row.name || typeof row.name !== "string" || !row.name.trim()) {
      errors.push("Name is required.");
    }
    let categoryId: string | null = null;
    const catVal = String(row.category || row.categoryId || row.categoryCode || "").trim().toLowerCase();
    if (!catVal) {
      errors.push("Category is required.");
    } else {
      categoryId = catMap.get(catVal) || catNameMap.get(catVal) || (categories.find(c => c.id.toLowerCase() === catVal)?.id ?? null);
      if (!categoryId) {
        errors.push(`Category '${row.category || row.categoryId || row.categoryCode}' not found or inactive.`);
      }
    }
    let condition: AssetCondition = "GOOD";
    if (row.condition) {
      const condVal = String(row.condition).trim().toUpperCase();
      if (["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"].includes(condVal)) {
        condition = condVal as AssetCondition;
      } else {
        errors.push(`Invalid condition '${row.condition}'. Must be one of: NEW, GOOD, FAIR, POOR, DAMAGED, UNKNOWN.`);
      }
    }
    let owningDepartmentId: string | null = null;
    if (row.owningDepartment || row.owningDepartmentId || row.department || row.departmentCode) {
      const deptVal = String(row.owningDepartment || row.owningDepartmentId || row.department || row.departmentCode).trim().toLowerCase();
      owningDepartmentId = deptMap.get(deptVal) || deptNameMap.get(deptVal) || (departments.find(d => d.id.toLowerCase() === deptVal)?.id ?? null);
      if (!owningDepartmentId) {
        errors.push(`Department '${row.owningDepartment || row.owningDepartmentId || row.department || row.departmentCode}' not found or inactive.`);
      }
    }
    let currentLocationId: string | null = null;
    if (row.currentLocation || row.currentLocationId || row.location || row.locationCode) {
      const locVal = String(row.currentLocation || row.currentLocationId || row.location || row.locationCode).trim().toLowerCase();
      currentLocationId = locMap.get(locVal) || locNameMap.get(locVal) || (locations.find(l => l.id.toLowerCase() === locVal)?.id ?? null);
      if (!currentLocationId) {
        errors.push(`Location '${row.currentLocation || row.currentLocationId || row.location || row.locationCode}' not found or inactive.`);
      }
    }
    let serialNumber: string | null = null;
    if (row.serialNumber && String(row.serialNumber).trim()) {
      serialNumber = String(row.serialNumber).trim();
      const lowerSerial = serialNumber.toLowerCase();
      if (existingSerials.has(lowerSerial)) errors.push(`Serial number '${serialNumber}' already exists.`);
      if (csvSerials.has(lowerSerial)) errors.push(`Duplicate serial number '${serialNumber}' in file.`);
      csvSerials.add(lowerSerial);
    }
    let qrCode: string | null = null;
    if (row.qrCode && String(row.qrCode).trim()) {
      qrCode = String(row.qrCode).trim();
      const lowerQr = qrCode.toLowerCase();
      if (existingQrCodes.has(lowerQr)) errors.push(`QR code '${qrCode}' already exists.`);
      if (csvQrCodes.has(lowerQr)) errors.push(`Duplicate QR code '${qrCode}' in file.`);
      csvQrCodes.add(lowerQr);
    }
    let isBookable = false;
    if (row.isBookable !== undefined) {
      isBookable = String(row.isBookable).toLowerCase() === "true" || row.isBookable === true;
    }
    let acquisitionDate: Date | null = null;
    if (row.acquisitionDate && String(row.acquisitionDate).trim()) {
      const d = new Date(row.acquisitionDate);
      if (isNaN(d.getTime())) errors.push(`Invalid acquisition date '${row.acquisitionDate}'.`);
      else acquisitionDate = d;
    }
    let expectedRetirementOn: Date | null = null;
    if (row.expectedRetirementOn && String(row.expectedRetirementOn).trim()) {
      const d = new Date(row.expectedRetirementOn);
      if (isNaN(d.getTime())) errors.push(`Invalid expected retirement date '${row.expectedRetirementOn}'.`);
      else expectedRetirementOn = d;
    }
    let warrantyExpiryDate: Date | null = null;
    if (row.warrantyExpiryDate && String(row.warrantyExpiryDate).trim()) {
      const d = new Date(row.warrantyExpiryDate);
      if (isNaN(d.getTime())) errors.push(`Invalid warranty expiry date '${row.warrantyExpiryDate}'.`);
      else warrantyExpiryDate = d;
    }
    if (errors.length > 0) hasErrors = true;
    results.push({
      index: i,
      raw: row,
      resolved: {
        name: row.name?.trim(),
        categoryId,
        condition,
        serialNumber,
        qrCode,
        owningDepartmentId,
        currentLocationId,
        isBookable,
        acquisitionDate,
        expectedRetirementOn,
        warrantyExpiryDate,
        attachmentUrl: row.attachmentUrl ? String(row.attachmentUrl).trim() : null
      },
      errors,
      valid: errors.length === 0
    });
  }
  if (hasErrors || !input.confirm) {
    return {
      success: !hasErrors,
      preview: results,
      totalRows: input.rows.length,
      validRows: results.filter(r => r.valid).length,
      invalidRows: results.filter(r => !r.valid).length
    };
  }
  return prisma.$transaction(async (tx) => {
    const count = await tx.asset.count({ where: { organizationId } });
    const createdAssets: any[] = [];
    for (let i = 0; i < results.length; i++) {
      const assetTag = `AF-${String(count + i + 1).padStart(4, "0")}`;
      const data = results[i].resolved;
      const asset = await tx.asset.create({
        data: {
          organizationId,
          assetTag,
          name: data.name,
          categoryId: data.categoryId!,
          serialNumber: data.serialNumber,
          qrCode: data.qrCode,
          condition: data.condition,
          owningDepartmentId: data.owningDepartmentId,
          currentLocationId: data.currentLocationId,
          isBookable: data.isBookable,
          acquisitionDate: data.acquisitionDate,
          expectedRetirementOn: data.expectedRetirementOn,
          warrantyExpiryDate: data.warrantyExpiryDate,
          attachmentUrl: data.attachmentUrl,
          createdByUserId: actorId
        }
      });
      if (data.isBookable) {
        await tx.resourceProfile.create({
          data: { assetId: asset.id, organizationId, timezone: "Asia/Kolkata" }
        });
      }
      await tx.assetStatusHistory.create({
        data: {
          organizationId,
          assetId: asset.id,
          toStatus: "AVAILABLE",
          reasonCode: "REGISTERED",
          sourceType: "ADMIN",
          changedByUserId: actorId
        }
      });
      createdAssets.push(asset);
    }
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: "ASSET_BULK_IMPORTED",
      entityType: "ASSET",
      summary: `Bulk imported ${createdAssets.length} assets.`
    });
    return {
      success: true,
      importedCount: createdAssets.length,
      assets: createdAssets
    };
  });
}
