import { Router } from "express"; import { z } from "zod"; import { assetConditions, paginationSchema } from "@assetflow/contracts"; import { requireAuth, requireRole } from "../../platform/auth/session.js"; import { asyncHandler, data, pageMeta } from "../../platform/http/async-handler.js"; import * as service from "./allocation.service.js";
export const allocationRouter = Router(); allocationRouter.use(requireAuth); const id = z.uuid();
allocationRouter.get("/allocations", asyncHandler(async (req, res) => {
  const p = paginationSchema.parse(req.query);
  const result = await service.listAllocations(req.actor!.organizationId, req.query.active === "true", p.page, p.pageSize);
  return data(req, res, result.items, 200, pageMeta(p.page, p.pageSize, result.total));
})); allocationRouter.get("/allocations/:id", asyncHandler(async (req, res) => data(req, res, await service.getAllocation(id.parse(req.params.id), req.actor!.organizationId))));
allocationRouter.post("/allocations", requireRole("ASSET_MANAGER"), asyncHandler(async (req, res) => data(req, res, await service.createAllocation(req.actor!.id, req.actor!.organizationId, req.requestId, z.object({ assetId: id, allocatedToUserId: id.optional(), allocatedToDepartmentId: id.optional(), expectedReturnAt: z.iso.datetime().optional(), checkoutCondition: z.enum(assetConditions), checkoutNotes: z.string().max(1000).optional() }).refine((v) => Boolean(v.allocatedToUserId) !== Boolean(v.allocatedToDepartmentId), "Choose exactly one recipient").parse(req.body)), 201)));
allocationRouter.post("/allocations/:id/request-return", asyncHandler(async (req, res) => data(req, res, await service.requestReturn(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), z.object({ proposedCondition: z.enum(assetConditions).optional(), requestNotes: z.string().max(1000).optional() }).parse(req.body)), 201)));
allocationRouter.get("/return-requests", requireRole("ASSET_MANAGER"), asyncHandler(async (req, res) => {
  const p = paginationSchema.parse(req.query);
  const result = await service.listReturns(req.actor!.organizationId, p.page, p.pageSize);
  return data(req, res, result.items, 200, pageMeta(p.page, p.pageSize, result.total));
}));
allocationRouter.get("/return-requests/:id", requireRole("ASSET_MANAGER"), asyncHandler(async (req, res) => data(req, res, await service.getReturn(id.parse(req.params.id), req.actor!.organizationId))));
allocationRouter.post("/return-requests/:id/approve", requireRole("ASSET_MANAGER"), asyncHandler(async (req, res) => data(req, res, await service.decideReturn(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), true, z.object({ checkinCondition: z.enum(assetConditions), checkinNotes: z.string().optional(), decisionNotes: z.string().optional() }).parse(req.body)))));
allocationRouter.post("/return-requests/:id/reject", requireRole("ASSET_MANAGER"), asyncHandler(async (req, res) => data(req, res, await service.decideReturn(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), false, z.object({ decisionNotes: z.string().min(1) }).parse(req.body)))));
allocationRouter.get("/transfer-requests", asyncHandler(async (req, res) => {
  const p = paginationSchema.parse(req.query);
  const result = await service.listTransfers(req.actor!.organizationId, p.page, p.pageSize);
  return data(req, res, result.items, 200, pageMeta(p.page, p.pageSize, result.total));
}));
allocationRouter.get("/transfer-requests/:id", asyncHandler(async (req, res) => data(req, res, await service.getTransfer(id.parse(req.params.id), req.actor!.organizationId))));
allocationRouter.post("/transfer-requests", asyncHandler(async (req, res) => data(req, res, await service.createTransfer(req.actor!.id, req.actor!.organizationId, req.requestId, z.object({ sourceAllocationId: id, toUserId: id.optional(), toDepartmentId: id.optional(), reason: z.string().min(1) }).refine((v) => Boolean(v.toUserId) !== Boolean(v.toDepartmentId), "Choose exactly one destination").parse(req.body)), 201)));
for (const decision of ["approve", "reject"] as const) allocationRouter.post(`/transfer-requests/:id/${decision}`, requireRole("ASSET_MANAGER", "DEPARTMENT_HEAD"), asyncHandler(async (req, res) => data(req, res, await service.decideTransfer(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), decision === "approve" ? "APPROVED" : "REJECTED", z.object({ notes: z.string().optional() }).parse(req.body).notes))));
allocationRouter.post("/transfer-requests/:id/cancel", asyncHandler(async (req, res) => data(req, res, await service.decideTransfer(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), "CANCELLED"))));
