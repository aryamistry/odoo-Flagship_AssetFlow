import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  prisma,
  logActivity,
  notify,
} from "../../platform/trace/trace.service.js";
import { AppError } from "../../platform/http/errors.js";

type Db = PrismaClient | Prisma.TransactionClient;
type BookingInput = {
  assetId: string;
  bookedForUserId?: string;
  bookedForDepartmentId?: string;
  title: string;
  purpose?: string;
  startAt: string;
  endAt: string;
  participantCount?: number;
  recurrence?: { frequency: "DAILY" | "WEEKLY"; occurrences: number };
};
type Availability = Record<string, Array<{ start: string; end: string }>>;

export async function listBookings(
  organizationId: string,
  assetId?: string,
  page = 1,
  pageSize = 25,
  statuses?: string[],
) {
  const where = {
    organizationId,
    assetId,
    status: statuses?.length ? { in: statuses as never[] } : undefined,
  };
  const [items, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      orderBy: { startAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total };
}

export async function getBooking(id: string, organizationId: string) {
  const item = await prisma.booking.findFirst({
    where: { id, organizationId },
  });
  if (!item) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found.");
  return item;
}

export async function getResourceProfile(
  organizationId: string,
  assetId: string,
) {
  const profile = await prisma.resourceProfile.findFirst({
    where: { organizationId, assetId },
  });
  if (!profile)
    throw new AppError(
      404,
      "RESOURCE_PROFILE_NOT_FOUND",
      "This asset has no booking profile.",
    );
  return profile;
}

export async function updateResourceProfile(
  organizationId: string,
  assetId: string,
  input: {
    timezone?: string;
    minimumDurationMinutes?: number;
    maximumDurationMinutes?: number | null;
    bufferBeforeMinutes?: number;
    bufferAfterMinutes?: number;
    advanceBookingDays?: number | null;
    requiresApproval?: boolean;
    allowDepartmentBooking?: boolean;
    capacity?: number;
    availability?: Availability | null;
    allowRecurring?: boolean;
  },
) {
  await getResourceProfile(organizationId, assetId);
  validateAvailability(input.availability);
  const { availability, ...profileFields } = input;
  return prisma.resourceProfile.update({
    where: { assetId },
    data: {
      ...profileFields,
      availabilityJson:
        availability === undefined
          ? undefined
          : availability === null
            ? Prisma.JsonNull
            : (availability as Prisma.InputJsonValue),
    },
  });
}

function validateAvailability(value: Availability | null | undefined) {
  if (value === undefined || value === null) return;
  const days = new Set([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]);
  for (const [day, ranges] of Object.entries(value)) {
    if (!days.has(day) || !Array.isArray(ranges))
      throw new AppError(
        422,
        "INVALID_AVAILABILITY",
        "Availability must use weekday keys and time ranges.",
      );
    for (const range of ranges) {
      if (
        !/^\d{2}:\d{2}$/.test(range.start) ||
        !/^\d{2}:\d{2}$/.test(range.end) ||
        range.start >= range.end
      )
        throw new AppError(
          422,
          "INVALID_AVAILABILITY",
          "Each availability range must be a valid start/end time.",
        );
    }
  }
}

function localTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === kind)?.value ?? "";
  return {
    weekday: value("weekday").toLowerCase(),
    clock: `${value("hour")}:${value("minute")}`,
  };
}

function validateAvailabilityWindow(
  startAt: Date,
  endAt: Date,
  profile: { timezone: string; availabilityJson: Prisma.JsonValue | null },
) {
  if (
    !profile.availabilityJson ||
    typeof profile.availabilityJson !== "object" ||
    Array.isArray(profile.availabilityJson)
  )
    return;
  const availability = profile.availabilityJson as unknown as Availability;
  const start = localTime(startAt, profile.timezone);
  const end = localTime(endAt, profile.timezone);
  if (start.weekday !== end.weekday)
    throw new AppError(
      422,
      "OUTSIDE_RESOURCE_AVAILABILITY",
      "This resource cannot be booked across local calendar days.",
    );
  const ranges = availability[start.weekday] ?? [];
  if (
    !ranges.some(
      (range) => start.clock >= range.start && end.clock <= range.end,
    )
  )
    throw new AppError(
      422,
      "OUTSIDE_RESOURCE_AVAILABILITY",
      "The booking falls outside the resource's configured availability.",
    );
}

async function validateSlot(
  db: Db,
  organizationId: string,
  assetId: string,
  startAt: Date,
  endAt: Date,
  participantCount: number,
  excludeId?: string,
) {
  if (startAt >= endAt)
    throw new AppError(
      422,
      "INVALID_BOOKING_INTERVAL",
      "Booking end must be after its start.",
    );
  if (!Number.isInteger(participantCount) || participantCount < 1)
    throw new AppError(
      422,
      "INVALID_PARTICIPANT_COUNT",
      "Participant count must be at least one.",
    );
  const profile = await db.resourceProfile.findFirst({
    where: { assetId, organizationId },
  });
  const asset = await db.asset.findFirst({
    where: { id: assetId, organizationId },
  });
  if (!profile || !asset?.isBookable)
    throw new AppError(
      422,
      "RESOURCE_NOT_BOOKABLE",
      "This asset is not bookable.",
    );
  if (
    ["UNDER_MAINTENANCE", "LOST", "RETIRED", "DISPOSED"].includes(asset.status)
  )
    throw new AppError(
      409,
      "RESOURCE_UNAVAILABLE",
      "This resource is unavailable.",
    );
  const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
  if (
    durationMinutes < profile.minimumDurationMinutes ||
    (profile.maximumDurationMinutes &&
      durationMinutes > profile.maximumDurationMinutes)
  )
    throw new AppError(
      422,
      "INVALID_BOOKING_DURATION",
      "The booking does not meet the resource's duration policy.",
    );
  if (
    profile.advanceBookingDays &&
    startAt > new Date(Date.now() + profile.advanceBookingDays * 86_400_000)
  )
    throw new AppError(
      422,
      "BOOKING_TOO_FAR_AHEAD",
      "This resource cannot be booked that far ahead.",
    );
  if (participantCount > profile.capacity)
    throw new AppError(
      422,
      "RESOURCE_CAPACITY_EXCEEDED",
      "Participant count exceeds this resource's capacity.",
    );
  validateAvailabilityWindow(startAt, endAt, profile);
  const effectiveStartAt = new Date(
    startAt.getTime() - profile.bufferBeforeMinutes * 60_000,
  );
  const effectiveEndAt = new Date(
    endAt.getTime() + profile.bufferAfterMinutes * 60_000,
  );
  const occupied = await db.booking.aggregate({
    where: {
      assetId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { in: ["PENDING", "CONFIRMED"] },
      effectiveStartAt: { lt: effectiveEndAt },
      effectiveEndAt: { gt: effectiveStartAt },
    },
    _sum: { participantCount: true },
  });
  if (
    (occupied._sum.participantCount ?? 0) + participantCount >
    profile.capacity
  )
    throw new AppError(
      409,
      "BOOKING_CAPACITY_EXCEEDED",
      "The requested slot does not have enough remaining capacity.",
    );
  return { profile, effectiveStartAt, effectiveEndAt };
}

export async function findAvailability(
  organizationId: string,
  assetId: string,
  startAtValue: string,
  endAtValue: string,
  participantCount = 1,
) {
  const startAt = new Date(startAtValue);
  const endAt = new Date(endAtValue);
  try {
    const slot = await validateSlot(
      prisma,
      organizationId,
      assetId,
      startAt,
      endAt,
      participantCount,
    );
    return {
      available: true,
      capacity: slot.profile.capacity,
      effectiveStartAt: slot.effectiveStartAt,
      effectiveEndAt: slot.effectiveEndAt,
    };
  } catch (error) {
    if (error instanceof AppError)
      return { available: false, reason: error.code, detail: error.message };
    throw error;
  }
}

function bookingRecipient(input: BookingInput, actorId: string) {
  if (input.bookedForUserId && input.bookedForDepartmentId)
    throw new AppError(
      422,
      "INVALID_BOOKING_BENEFICIARY",
      "Choose either an employee or a department, not both.",
    );
  return {
    bookedForUserId: input.bookedForDepartmentId
      ? null
      : (input.bookedForUserId ?? actorId),
    bookedForDepartmentId: input.bookedForDepartmentId ?? null,
  };
}

function recurrenceDates(input: BookingInput) {
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (!input.recurrence)
    return [{ startAt: start, endAt: end, occurrenceNumber: null }];
  if (input.recurrence.occurrences < 2 || input.recurrence.occurrences > 52)
    throw new AppError(
      422,
      "INVALID_RECURRENCE",
      "Recurring bookings need between 2 and 52 occurrences.",
    );
  const multiplier = input.recurrence.frequency === "WEEKLY" ? 7 : 1;
  return Array.from({ length: input.recurrence.occurrences }, (_, index) => ({
    startAt: new Date(start.getTime() + index * multiplier * 86_400_000),
    endAt: new Date(end.getTime() + index * multiplier * 86_400_000),
    occurrenceNumber: index + 1,
  }));
}

export async function createBooking(
  actorId: string,
  organizationId: string,
  requestId: string,
  input: BookingInput,
) {
  const participantCount = input.participantCount ?? 1;
  const occurrences = recurrenceDates(input);
  const first = await validateSlot(
    prisma,
    organizationId,
    input.assetId,
    occurrences[0]!.startAt,
    occurrences[0]!.endAt,
    participantCount,
  );
  if (input.recurrence && !first.profile.allowRecurring)
    throw new AppError(
      422,
      "RECURRING_BOOKING_NOT_ALLOWED",
      "This resource does not allow recurring bookings.",
    );
  const recipient = bookingRecipient(input, actorId);
  const recurrenceGroupId = input.recurrence ? crypto.randomUUID() : null;
  return prisma.$transaction(async (tx) => {
    const created = [];
    for (const occurrence of occurrences) {
      const slot = await validateSlot(
        tx,
        organizationId,
        input.assetId,
        occurrence.startAt,
        occurrence.endAt,
        participantCount,
      );
      const item = await tx.booking.create({
        data: {
          organizationId,
          assetId: input.assetId,
          requestedByUserId: actorId,
          ...recipient,
          title: input.title.trim(),
          purpose: input.purpose?.trim() ?? null,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          effectiveStartAt: slot.effectiveStartAt,
          effectiveEndAt: slot.effectiveEndAt,
          participantCount,
          status: slot.profile.requiresApproval ? "PENDING" : "CONFIRMED",
          recurrenceGroupId,
          recurrenceRule: input.recurrence
            ? `FREQ=${input.recurrence.frequency};COUNT=${input.recurrence.occurrences}`
            : null,
          occurrenceNumber: occurrence.occurrenceNumber,
        },
      });
      created.push(item);
    }
    const recipientId = recipient.bookedForUserId ?? actorId;
    await notify(tx, {
      organizationId,
      recipientUserId: recipientId,
      type:
        created[0]!.status === "PENDING"
          ? "BOOKING_PENDING"
          : "BOOKING_CONFIRMED",
      title:
        created[0]!.status === "PENDING"
          ? "Booking awaiting approval"
          : "Booking confirmed",
      body: `${input.title} ${created.length > 1 ? `has ${created.length} occurrences and is` : "was"} ${created[0]!.status.toLowerCase()}.`,
      entityType: "BOOKING",
      entityId: created[0]!.id,
    });
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: input.recurrence
        ? "RECURRING_BOOKING_CREATED"
        : "BOOKING_CREATED",
      entityType: "BOOKING",
      entityId: created[0]!.id,
      summary: `Created ${created.length} booking occurrence${created.length === 1 ? "" : "s"} for ${input.title}.`,
    });
    return created;
  });
}

async function offerWaitlist(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assetId: string,
  startAt: Date,
  endAt: Date,
) {
  const entry = await tx.bookingWaitlistEntry.findFirst({
    where: {
      organizationId,
      assetId,
      status: "PENDING",
      desiredStartAt: { lt: endAt },
      desiredEndAt: { gt: startAt },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!entry) return null;
  const expiresAt = new Date(Date.now() + 24 * 3_600_000);
  await tx.bookingWaitlistEntry.update({
    where: { id: entry.id },
    data: { status: "OFFERED", offeredAt: new Date(), expiresAt },
  });
  await notify(tx, {
    organizationId,
    recipientUserId: entry.bookedForUserId ?? entry.requestedByUserId,
    type: "WAITLIST_OFFERED",
    title: "Resource slot available",
    body: `${entry.title} may now be booked. The offer expires in 24 hours.`,
    entityType: "BOOKING_WAITLIST",
    entityId: entry.id,
  });
  return entry;
}

export async function cancelBooking(
  actorId: string,
  organizationId: string,
  requestId: string,
  id: string,
  reason?: string,
) {
  const item = await getBooking(id, organizationId);
  if (
    !["PENDING", "CONFIRMED"].includes(item.status) ||
    item.startAt <= new Date()
  )
    throw new AppError(
      409,
      "BOOKING_NOT_CANCELLABLE",
      "Only future active bookings can be cancelled.",
    );
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: actorId,
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
      },
    });
    await offerWaitlist(
      tx,
      organizationId,
      item.assetId,
      item.startAt,
      item.endAt,
    );
    await notify(tx, {
      organizationId,
      recipientUserId: item.bookedForUserId ?? item.requestedByUserId,
      type: "BOOKING_CANCELLED",
      title: "Booking cancelled",
      body: `${item.title} was cancelled.`,
      entityType: "BOOKING",
      entityId: id,
    });
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: "BOOKING_CANCELLED",
      entityType: "BOOKING",
      entityId: id,
      summary: `Cancelled booking ${item.title}.`,
    });
    return updated;
  });
}

export async function reschedule(
  actorId: string,
  organizationId: string,
  requestId: string,
  id: string,
  input: { startAt: string; endAt: string; reason?: string },
) {
  const original = await getBooking(id, organizationId);
  if (
    !["PENDING", "CONFIRMED"].includes(original.status) ||
    original.startAt <= new Date()
  )
    throw new AppError(
      409,
      "BOOKING_NOT_RESCHEDULABLE",
      "Only future active bookings can be rescheduled.",
    );
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const slot = await validateSlot(
    prisma,
    organizationId,
    original.assetId,
    startAt,
    endAt,
    original.participantCount,
    original.id,
  );
  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledByUserId: actorId,
        cancelledAt: new Date(),
        cancellationReason: input.reason ?? "Rescheduled",
      },
    });
    const replacement = await tx.booking.create({
      data: {
        organizationId,
        assetId: original.assetId,
        requestedByUserId: actorId,
        bookedForUserId: original.bookedForUserId,
        bookedForDepartmentId: original.bookedForDepartmentId,
        title: original.title,
        purpose: original.purpose,
        startAt,
        endAt,
        effectiveStartAt: slot.effectiveStartAt,
        effectiveEndAt: slot.effectiveEndAt,
        participantCount: original.participantCount,
        status: original.status,
        rescheduledFromBookingId: original.id,
      },
    });
    await offerWaitlist(
      tx,
      organizationId,
      original.assetId,
      original.startAt,
      original.endAt,
    );
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: "BOOKING_RESCHEDULED",
      entityType: "BOOKING",
      entityId: replacement.id,
      summary: `Rescheduled booking ${original.title}.`,
    });
    return replacement;
  });
}

export async function approveBooking(
  actorId: string,
  organizationId: string,
  requestId: string,
  id: string,
) {
  const booking = await getBooking(id, organizationId);
  if (booking.status !== "PENDING")
    throw new AppError(
      409,
      "BOOKING_ALREADY_DECIDED",
      "Only pending bookings can be approved.",
    );
  return prisma.$transaction(async (tx) => {
    await validateSlot(
      tx,
      organizationId,
      booking.assetId,
      booking.startAt,
      booking.endAt,
      booking.participantCount,
      booking.id,
    );
    const updated = await tx.booking.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        approvedByUserId: actorId,
        approvedAt: new Date(),
      },
    });
    await notify(tx, {
      organizationId,
      recipientUserId: booking.bookedForUserId ?? booking.requestedByUserId,
      type: "BOOKING_CONFIRMED",
      title: "Booking approved",
      body: `${booking.title} is confirmed.`,
      entityType: "BOOKING",
      entityId: id,
    });
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: "BOOKING_APPROVED",
      entityType: "BOOKING",
      entityId: id,
      summary: `Approved booking ${booking.title}.`,
    });
    return updated;
  });
}

export async function rejectBooking(
  actorId: string,
  organizationId: string,
  requestId: string,
  id: string,
  reason: string,
) {
  const booking = await getBooking(id, organizationId);
  if (booking.status !== "PENDING")
    throw new AppError(
      409,
      "BOOKING_ALREADY_DECIDED",
      "Only pending bookings can be rejected.",
    );
  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedByUserId: actorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
    await offerWaitlist(
      tx,
      organizationId,
      booking.assetId,
      booking.startAt,
      booking.endAt,
    );
    await notify(tx, {
      organizationId,
      recipientUserId: booking.bookedForUserId ?? booking.requestedByUserId,
      type: "BOOKING_REJECTED",
      title: "Booking rejected",
      body: reason,
      entityType: "BOOKING",
      entityId: id,
    });
    await logActivity(tx, {
      organizationId,
      actorUserId: actorId,
      requestId,
      action: "BOOKING_REJECTED",
      entityType: "BOOKING",
      entityId: id,
      summary: `Rejected booking ${booking.title}.`,
    });
    return updated;
  });
}

export async function listWaitlist(
  organizationId: string,
  assetId?: string,
  requestedByUserId?: string,
) {
  return prisma.bookingWaitlistEntry.findMany({
    where: { organizationId, assetId, requestedByUserId },
    orderBy: { createdAt: "asc" },
  });
}

export async function joinWaitlist(
  actorId: string,
  organizationId: string,
  requestId: string,
  input: Omit<BookingInput, "recurrence">,
) {
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const participantCount = input.participantCount ?? 1;
  const profile = await getResourceProfile(organizationId, input.assetId);
  if (
    startAt >= endAt ||
    participantCount < 1 ||
    participantCount > profile.capacity
  )
    throw new AppError(
      422,
      "INVALID_WAITLIST_REQUEST",
      "The desired slot or participant count is invalid.",
    );
  validateAvailabilityWindow(startAt, endAt, profile);
  const recipient = bookingRecipient(input, actorId);
  const entry = await prisma.bookingWaitlistEntry.create({
    data: {
      organizationId,
      assetId: input.assetId,
      requestedByUserId: actorId,
      ...recipient,
      title: input.title.trim(),
      purpose: input.purpose?.trim() ?? null,
      desiredStartAt: startAt,
      desiredEndAt: endAt,
      participantCount,
    },
  });
  await logActivity(prisma, {
    organizationId,
    actorUserId: actorId,
    requestId,
    action: "BOOKING_WAITLIST_JOINED",
    entityType: "BOOKING_WAITLIST",
    entityId: entry.id,
    summary: `Joined the waitlist for ${input.title}.`,
  });
  return entry;
}

export async function acceptWaitlist(
  actorId: string,
  organizationId: string,
  requestId: string,
  id: string,
) {
  const entry = await prisma.bookingWaitlistEntry.findFirst({
    where: { id, organizationId },
  });
  if (!entry || entry.requestedByUserId !== actorId)
    throw new AppError(
      404,
      "WAITLIST_ENTRY_NOT_FOUND",
      "Waitlist entry not found.",
    );
  if (
    entry.status !== "OFFERED" ||
    (entry.expiresAt && entry.expiresAt <= new Date())
  )
    throw new AppError(
      409,
      "WAITLIST_OFFER_EXPIRED",
      "This waitlist offer is no longer available.",
    );
  const created = await createBooking(actorId, organizationId, requestId, {
    assetId: entry.assetId,
    bookedForUserId: entry.bookedForUserId ?? undefined,
    bookedForDepartmentId: entry.bookedForDepartmentId ?? undefined,
    title: entry.title,
    purpose: entry.purpose ?? undefined,
    startAt: entry.desiredStartAt.toISOString(),
    endAt: entry.desiredEndAt.toISOString(),
    participantCount: entry.participantCount,
  });
  await prisma.bookingWaitlistEntry.update({
    where: { id },
    data: { status: "FULFILLED" },
  });
  return created;
}

export async function cancelWaitlist(
  actorId: string,
  organizationId: string,
  id: string,
) {
  const entry = await prisma.bookingWaitlistEntry.findFirst({
    where: { id, organizationId, requestedByUserId: actorId },
  });
  if (!entry || !["PENDING", "OFFERED"].includes(entry.status))
    throw new AppError(
      404,
      "WAITLIST_ENTRY_NOT_FOUND",
      "Active waitlist entry not found.",
    );
  return prisma.bookingWaitlistEntry.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

export async function getNotificationPreferences(
  userId: string,
  organizationId: string,
) {
  return prisma.notificationPreference.findMany({
    where: { userId, organizationId },
    orderBy: { type: "asc" },
  });
}
export async function setNotificationPreference(
  userId: string,
  organizationId: string,
  type: string,
  isEnabled: boolean,
) {
  return prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { organizationId, userId, type, isEnabled },
    update: { isEnabled },
  });
}

export async function runBookingReminders(organizationId?: string) {
  const now = new Date();
  const targetTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let sent = 0;
  const bookings = await prisma.booking.findMany({
    where: {
      organizationId,
      status: "CONFIRMED",
      startAt: { gte: now, lte: targetTime },
    },
  });
  for (const booking of bookings) {
    const day = now.toISOString().slice(0, 10);
    const idempotencyKey = `booking-reminder-${booking.id}-${day}`;
    try {
      await prisma.jobRun.create({
        data: {
          organizationId: booking.organizationId,
          jobName: "booking-reminder",
          idempotencyKey,
          status: "STARTED",
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        continue;
      throw error;
    }
    const recipientUserId =
      booking.bookedForUserId ?? booking.requestedByUserId;
    const preference = await prisma.notificationPreference.findUnique({
      where: {
        userId_type: { userId: recipientUserId, type: "BOOKING_REMINDER" },
      },
    });
    if (preference?.isEnabled !== false) {
      await notify(prisma, {
        organizationId: booking.organizationId,
        recipientUserId,
        type: "BOOKING_REMINDER",
        title: "Upcoming resource booking",
        body: `Reminder: ${booking.title} starts within 24 hours.`,
        entityType: "BOOKING",
        entityId: booking.id,
        dedupKey: idempotencyKey,
      });
      sent++;
    }
    await prisma.jobRun.update({
      where: { idempotencyKey },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        resultJson: { sent: preference?.isEnabled !== false },
      },
    });
  }
  return { remindersSent: sent };
}
