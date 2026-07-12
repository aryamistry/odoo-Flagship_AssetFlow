import { z } from "zod";

export const roles = ["EMPLOYEE", "ADMIN", "ASSET_MANAGER", "DEPARTMENT_HEAD"] as const;
export const assetStatuses = ["AVAILABLE", "ALLOCATED", "RESERVED", "UNDER_MAINTENANCE", "LOST", "RETIRED", "DISPOSED"] as const;
export const assetConditions = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED", "UNKNOWN"] as const;
export const bookingStatuses = ["PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED"] as const;
export const maintenanceStatuses = ["PENDING", "APPROVED", "REJECTED", "TECHNICIAN_ASSIGNED", "IN_PROGRESS", "RESOLVED", "CANCELLED"] as const;
export const auditStatuses = ["DRAFT", "IN_PROGRESS", "REVIEW", "CLOSED", "CANCELLED"] as const;

export const idSchema = z.uuid();
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const loginSchema = z.object({ email: z.email(), password: z.string().min(8).max(128) });
export const signupSchema = loginSchema.extend({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().max(80).optional() });

export type Role = (typeof roles)[number];
export type AssetStatus = (typeof assetStatuses)[number];
export type AssetCondition = (typeof assetConditions)[number];

