import { Router } from "express";
import { z } from "zod";
import { paginationSchema } from "@assetflow/contracts";
import { asyncHandler, data, pageMeta } from "../../platform/http/async-handler.js";
import { requireAuth, requireRole } from "../../platform/auth/session.js";
import * as service from "./organization.service.js";

export const organizationRouter = Router(); organizationRouter.use(requireAuth);
const id = z.uuid(); const status = z.enum(["ACTIVE", "INACTIVE"]); const locationType = z.enum(["SITE", "BUILDING", "FLOOR", "ROOM", "AREA", "OTHER"]);
const departmentCreate = z.object({ code: z.string().min(1).max(20), name: z.string().min(1).max(100), description: z.string().max(500).optional(), parentDepartmentId: id.optional() });
organizationRouter.get("/departments", asyncHandler(async (req, res) => data(req, res, await service.listDepartments(req.actor!.organizationId))));
organizationRouter.post("/departments", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.createDepartment(req.actor!.id, req.actor!.organizationId, req.requestId, departmentCreate.parse(req.body)), 201)));
organizationRouter.patch("/departments/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.updateDepartment(id.parse(req.params.id), req.actor!.organizationId, departmentCreate.partial().extend({ description: z.string().nullable().optional(), parentDepartmentId: id.nullable().optional(), status: status.optional() }).parse(req.body)))));
const locationCreate = z.object({ code: z.string().min(1).max(30), name: z.string().min(1).max(100), type: locationType, description: z.string().max(500).optional(), parentLocationId: id.optional() });
organizationRouter.get("/locations", asyncHandler(async (req, res) => data(req, res, await service.listLocations(req.actor!.organizationId))));
organizationRouter.post("/locations", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.createLocation(req.actor!.organizationId, locationCreate.parse(req.body)), 201)));
organizationRouter.patch("/locations/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.updateLocation(id.parse(req.params.id), req.actor!.organizationId, locationCreate.partial().extend({ description: z.string().nullable().optional(), parentLocationId: id.nullable().optional(), status: status.optional() }).parse(req.body)))));
const categoryCreate = z.object({ code: z.string().min(1).max(30), name: z.string().min(1).max(100), description: z.string().max(500).optional(), defaultUsefulLifeMonths: z.number().int().positive().optional() });
organizationRouter.get("/categories", asyncHandler(async (req, res) => data(req, res, await service.listCategories(req.actor!.organizationId))));
organizationRouter.post("/categories", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.createCategory(req.actor!.organizationId, categoryCreate.parse(req.body)), 201)));
organizationRouter.patch("/categories/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.updateCategory(id.parse(req.params.id), req.actor!.organizationId, categoryCreate.partial().extend({ description: z.string().nullable().optional(), defaultUsefulLifeMonths: z.number().int().positive().nullable().optional(), status: status.optional() }).parse(req.body)))));
const field = z.object({ fieldKey: z.string().regex(/^[a-z][a-z0-9_]*$/), label: z.string().min(1), fieldType: z.enum(["TEXT", "LONG_TEXT", "INTEGER", "DECIMAL", "BOOLEAN", "DATE", "DATETIME", "SELECT", "MULTI_SELECT"]), isRequired: z.boolean().optional(), optionsJson: z.unknown().optional(), validationJson: z.unknown().optional(), sortOrder: z.number().int().optional() });
organizationRouter.get("/categories/:id/fields", asyncHandler(async (req, res) => data(req, res, await service.listCategoryFields(id.parse(req.params.id), req.actor!.organizationId))));
organizationRouter.post("/categories/:id/fields", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.createCategoryField(id.parse(req.params.id), req.actor!.organizationId, field.parse(req.body)), 201)));
organizationRouter.patch("/category-fields/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.updateCategoryField(id.parse(req.params.id), req.actor!.organizationId, field.omit({ fieldKey: true, fieldType: true }).partial().extend({ status: status.optional() }).parse(req.body)))));
organizationRouter.get("/employees", requireRole("ADMIN", "ASSET_MANAGER", "DEPARTMENT_HEAD"), asyncHandler(async (req, res) => { const p = paginationSchema.parse(req.query); const result = await service.listEmployees(req.actor!.organizationId, p.page, p.pageSize); return data(req, res, result.items, 200, pageMeta(p.page, p.pageSize, result.total)); }));
organizationRouter.patch("/employees/:id", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.updateEmployee(id.parse(req.params.id), req.actor!.organizationId, z.object({ primaryDepartmentId: id.nullable().optional(), status: z.enum(["ACTIVE", "INACTIVE", "LOCKED"]).optional() }).parse(req.body)))));
organizationRouter.put("/employees/:id/roles", requireRole("ADMIN"), asyncHandler(async (req, res) => data(req, res, await service.setRoles(req.actor!.id, id.parse(req.params.id), req.actor!.organizationId, req.requestId, z.array(z.object({ role: z.enum(["EMPLOYEE", "ADMIN", "ASSET_MANAGER", "DEPARTMENT_HEAD"]), departmentId: id.optional() })).min(1).parse(req.body)))));

