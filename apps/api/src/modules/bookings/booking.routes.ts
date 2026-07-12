import { Router } from "express"; import { z } from "zod"; import { paginationSchema } from "@assetflow/contracts"; import { requireAuth } from "../../platform/auth/session.js"; import { asyncHandler, data, pageMeta } from "../../platform/http/async-handler.js"; import * as service from "./booking.service.js";
export const bookingRouter = Router(); bookingRouter.use(requireAuth); const id = z.uuid(); const times = z.object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() });
bookingRouter.get("/bookings", asyncHandler(async (req, res) => {
  const p = paginationSchema.parse(req.query);
  const result = await service.listBookings(req.actor!.organizationId, typeof req.query.assetId === "string" ? id.parse(req.query.assetId) : undefined, p.page, p.pageSize);
  return data(req, res, result.items, 200, pageMeta(p.page, p.pageSize, result.total));
})); bookingRouter.get("/bookings/:id", asyncHandler(async (req, res) => data(req, res, await service.getBooking(id.parse(req.params.id), req.actor!.organizationId)))); bookingRouter.get("/resources/:assetId/bookings", asyncHandler(async (req, res) => {
  const p = paginationSchema.parse(req.query);
  const result = await service.listBookings(req.actor!.organizationId, id.parse(req.params.assetId), p.page, p.pageSize);
  return data(req, res, result.items, 200, pageMeta(p.page, p.pageSize, result.total));
}));
bookingRouter.post("/bookings", asyncHandler(async (req, res) => data(req, res, await service.createBooking(req.actor!.id, req.actor!.organizationId, req.requestId, times.extend({ assetId: id, bookedForUserId: id.optional(), bookedForDepartmentId: id.optional(), title: z.string().min(1), purpose: z.string().optional() }).parse(req.body)), 201)));
bookingRouter.post("/bookings/:id/cancel", asyncHandler(async (req, res) => data(req, res, await service.cancelBooking(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), z.object({ reason: z.string().optional() }).parse(req.body).reason)))); bookingRouter.post("/bookings/:id/reschedule", asyncHandler(async (req, res) => data(req, res, await service.reschedule(req.actor!.id, req.actor!.organizationId, req.requestId, id.parse(req.params.id), times.extend({ reason: z.string().optional() }).parse(req.body)), 201)));
