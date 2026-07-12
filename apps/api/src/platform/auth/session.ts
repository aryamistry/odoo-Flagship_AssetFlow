import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../http/errors.js";

const digest = (token: string) => crypto.createHash("sha256").update(`${token}:${env.SESSION_PEPPER}`).digest("hex");

export async function createSession(user: { id: string; organizationId: string }) {
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, organizationId: user.organizationId, tokenHash: digest(token), expiresAt: new Date(Date.now() + env.SESSION_ABSOLUTE_HOURS * 3_600_000) } });
  return token;
}

export async function revokeSession(token: string | undefined) {
  if (token) await prisma.session.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/", maxAge: env.SESSION_ABSOLUTE_HOURS * 3_600_000 };

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies[env.SESSION_COOKIE_NAME] as string | undefined;
    if (!token) return next();
    const session = await prisma.session.findUnique({ where: { tokenHash: digest(token) } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.lastSeenAt <= new Date(Date.now() - env.SESSION_IDLE_HOURS * 3_600_000)) return next();
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== "ACTIVE") return next();
    const roles = await prisma.userRole.findMany({ where: { userId: user.id, revokedAt: null }, select: { role: true, departmentId: true } });
    req.actor = { id: user.id, organizationId: user.organizationId, email: user.email, firstName: user.firstName, lastName: user.lastName, primaryDepartmentId: user.primaryDepartmentId, roles };
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.actor) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue."));
  next();
}

export function hasRole(req: Request, ...roles: Array<"ADMIN" | "ASSET_MANAGER" | "DEPARTMENT_HEAD" | "EMPLOYEE">) {
  return Boolean(req.actor?.roles.some((item) => roles.includes(item.role)));
}

export function requireRole(...roles: Array<"ADMIN" | "ASSET_MANAGER" | "DEPARTMENT_HEAD" | "EMPLOYEE">) {
  return (req: Request, _res: Response, next: NextFunction) => hasRole(req, ...roles) ? next() : next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
}

