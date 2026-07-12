import { prisma } from "../../platform/database/prisma.js";
export async function summary(organizationId: string) {
  const now = new Date();
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const tz = org?.defaultTimezone || "Asia/Kolkata";
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const getVal = (type: string) => parts.find((p) => p.type === type)!.value;
  
  const utcDate = new Date(Date.UTC(
    Number(getVal("year")),
    Number(getVal("month")) - 1,
    Number(getVal("day")),
    Number(getVal("hour")),
    Number(getVal("minute")),
    Number(getVal("second"))
  ));
  
  const diff = utcDate.getTime() - now.getTime();
  
  const todayLocal = new Date(Date.UTC(Number(getVal("year")), Number(getVal("month")) - 1, Number(getVal("day")), 0, 0, 0));
  const today = new Date(todayLocal.getTime() - diff);
  
  const tomorrowLocal = new Date(Date.UTC(Number(getVal("year")), Number(getVal("month")) - 1, Number(getVal("day")) + 1, 0, 0, 0));
  const tomorrow = new Date(tomorrowLocal.getTime() - diff);

  const inSevenDays = new Date(now.getTime() + 7 * 86_400_000); const [available, allocated, maintenanceToday, activeBookings, pendingTransfers, upcomingReturns, overdueReturns, recentActivity] = await Promise.all([
  prisma.asset.count({ where: { organizationId, status: "AVAILABLE" } }), prisma.asset.count({ where: { organizationId, status: "ALLOCATED" } }), prisma.maintenanceEvent.count({ where: { organizationId, createdAt: { gte: today, lt: tomorrow }, toStatus: { in: ["APPROVED", "TECHNICIAN_ASSIGNED", "IN_PROGRESS", "RESOLVED"] } } }), prisma.booking.count({ where: { organizationId, status: "CONFIRMED", endAt: { gt: now } } }), prisma.transferRequest.count({ where: { organizationId, status: "PENDING" } }), prisma.allocation.count({ where: { organizationId, endedAt: null, expectedReturnAt: { gte: now, lte: inSevenDays } } }), prisma.allocation.count({ where: { organizationId, endedAt: null, expectedReturnAt: { lt: now } } }), prisma.activityLog.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 8 }),
]); return { kpis: { available, allocated, maintenanceToday, activeBookings, pendingTransfers, upcomingReturns }, overdueReturns, recentActivity }; }

