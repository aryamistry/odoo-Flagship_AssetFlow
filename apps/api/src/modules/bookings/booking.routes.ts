import { Router } from "express";
import { z } from "zod";
import { paginationSchema } from "@assetflow/contracts";
import { requireAuth, requireRole } from "../../platform/auth/session.js";
import {
  asyncHandler,
  data,
  pageMeta,
} from "../../platform/http/async-handler.js";
import * as service from "./booking.service.js";

export const bookingRouter = Router();
bookingRouter.use(requireAuth);

const id = z.uuid();
const times = z.object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() });
const availability = z
  .record(
    z.string(),
    z.array(
      z.object({
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    ),
  )
  .nullable()
  .optional();
const bookingInputBase = times
  .extend({
    assetId: id,
    bookedForUserId: id.optional(),
    bookedForDepartmentId: id.optional(),
    title: z.string().trim().min(1).max(160),
    purpose: z.string().trim().max(2_000).optional(),
    participantCount: z.number().int().positive().default(1),
    recurrence: z
      .object({
        frequency: z.enum(["DAILY", "WEEKLY"]),
        occurrences: z.number().int().min(2).max(52),
      })
      .optional(),
  });
const bookingInput = bookingInputBase.refine(
  (value) => !(value.bookedForUserId && value.bookedForDepartmentId),
  "Choose either an employee or department.",
);
const waitlistInput = bookingInputBase.omit({ assetId: true, recurrence: true });
const resourceProfileInput = z.object({
  timezone: z.string().min(1).optional(),
  minimumDurationMinutes: z.number().int().min(1).optional(),
  maximumDurationMinutes: z.number().int().min(1).nullable().optional(),
  bufferBeforeMinutes: z.number().int().min(0).optional(),
  bufferAfterMinutes: z.number().int().min(0).optional(),
  advanceBookingDays: z.number().int().min(0).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  allowDepartmentBooking: z.boolean().optional(),
  capacity: z.number().int().positive().optional(),
  availability,
  allowRecurring: z.boolean().optional(),
});

bookingRouter.get(
  "/bookings",
  asyncHandler(async (req, res) => {
    const page = paginationSchema
      .extend({ statuses: z.string().optional() })
      .parse(req.query);
    const result = await service.listBookings(
      req.actor!.organizationId,
      typeof req.query.assetId === "string"
        ? id.parse(req.query.assetId)
        : undefined,
      page.page,
      page.pageSize,
      page.statuses?.split(",").filter(Boolean),
    );
    return data(
      req,
      res,
      result.items,
      200,
      pageMeta(page.page, page.pageSize, result.total),
    );
  }),
);
bookingRouter.get(
  "/bookings/approval-queue",
  requireRole("ASSET_MANAGER"),
  asyncHandler(async (req, res) => {
    const page = paginationSchema.parse(req.query);
    const result = await service.listBookings(
      req.actor!.organizationId,
      undefined,
      page.page,
      page.pageSize,
      ["PENDING"],
    );
    return data(
      req,
      res,
      result.items,
      200,
      pageMeta(page.page, page.pageSize, result.total),
    );
  }),
);
bookingRouter.post(
  "/bookings/jobs/reminders",
  requireRole("ASSET_MANAGER"),
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.runBookingReminders(req.actor!.organizationId),
    ),
  ),
);
bookingRouter.get(
  "/bookings/:id",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.getBooking(
        id.parse(req.params.id),
        req.actor!.organizationId,
      ),
    ),
  ),
);
bookingRouter.post(
  "/bookings",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.createBooking(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        bookingInput.parse(req.body),
      ),
      201,
    ),
  ),
);
bookingRouter.post(
  "/bookings/:id/cancel",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ reason: z.string().max(500).optional() })
      .parse(req.body);
    return data(
      req,
      res,
      await service.cancelBooking(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        id.parse(req.params.id),
        body.reason,
      ),
    );
  }),
);
bookingRouter.post(
  "/bookings/:id/reschedule",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.reschedule(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        id.parse(req.params.id),
        times
          .extend({ reason: z.string().max(500).optional() })
          .parse(req.body),
      ),
      201,
    ),
  ),
);
bookingRouter.post(
  "/bookings/:id/approve",
  requireRole("ASSET_MANAGER"),
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.approveBooking(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        id.parse(req.params.id),
      ),
    ),
  ),
);
bookingRouter.post(
  "/bookings/:id/reject",
  requireRole("ASSET_MANAGER"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ reason: z.string().trim().min(1).max(500) })
      .parse(req.body);
    return data(
      req,
      res,
      await service.rejectBooking(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        id.parse(req.params.id),
        body.reason,
      ),
    );
  }),
);

bookingRouter.get(
  "/resources/:assetId/bookings",
  asyncHandler(async (req, res) => {
    const page = paginationSchema.parse(req.query);
    const result = await service.listBookings(
      req.actor!.organizationId,
      id.parse(req.params.assetId),
      page.page,
      page.pageSize,
    );
    return data(
      req,
      res,
      result.items,
      200,
      pageMeta(page.page, page.pageSize, result.total),
    );
  }),
);
bookingRouter.get(
  "/resources/:assetId/profile",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.getResourceProfile(
        req.actor!.organizationId,
        id.parse(req.params.assetId),
      ),
    ),
  ),
);
bookingRouter.get(
  "/resources/:assetId/availability",
  asyncHandler(async (req, res) => {
    const query = times
      .extend({
        participantCount: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    return data(
      req,
      res,
      await service.findAvailability(
        req.actor!.organizationId,
        id.parse(req.params.assetId),
        query.startAt,
        query.endAt,
        query.participantCount,
      ),
    );
  }),
);
bookingRouter.patch(
  "/resources/:assetId/profile",
  requireRole("ASSET_MANAGER"),
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.updateResourceProfile(
        req.actor!.organizationId,
        id.parse(req.params.assetId),
        resourceProfileInput.parse(req.body),
      ),
    ),
  ),
);
bookingRouter.get(
  "/resources/:assetId/waitlist",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.listWaitlist(
        req.actor!.organizationId,
        id.parse(req.params.assetId),
        req.actor!.id,
      ),
    ),
  ),
);
bookingRouter.post(
  "/resources/:assetId/waitlist",
  asyncHandler(async (req, res) => {
    const body = waitlistInput.parse(req.body);
    return data(
      req,
      res,
      await service.joinWaitlist(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        { ...body, assetId: id.parse(req.params.assetId) },
      ),
      201,
    );
  }),
);
bookingRouter.post(
  "/waitlist/:id/accept",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.acceptWaitlist(
        req.actor!.id,
        req.actor!.organizationId,
        req.requestId,
        id.parse(req.params.id),
      ),
    ),
  ),
);
bookingRouter.post(
  "/waitlist/:id/cancel",
  asyncHandler(async (req, res) =>
    data(
      req,
      res,
      await service.cancelWaitlist(
        req.actor!.id,
        req.actor!.organizationId,
        id.parse(req.params.id),
      ),
    ),
  ),
);
