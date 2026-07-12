import { prisma } from "../../platform/database/prisma.js";
import { AppError } from "../../platform/http/errors.js";
import { env } from "../../platform/config/env.js";
import { hashPassword, verifyPassword } from "../../platform/auth/password.js";
import { createSession } from "../../platform/auth/session.js";
import { logActivity } from "../../platform/trace/trace.service.js";

const publicUser = (user: { id: string; organizationId: string; email: string; firstName: string; lastName: string | null; primaryDepartmentId: string | null; status: string }, roles: unknown[]) => ({ ...user, roles });

export async function signup(input: { email: string; password: string; firstName: string; lastName?: string | undefined }, requestId: string) {
  const organization = await prisma.organization.findFirst({ where: { status: "ACTIVE" } });
  if (!organization) throw new AppError(409, "ORGANIZATION_UNAVAILABLE", "Signup is not available.");
  const email = input.email.trim().toLowerCase();
  if (await prisma.user.findFirst({ where: { organizationId: organization.id, email } })) throw new AppError(409, "EMAIL_ALREADY_EXISTS", "An account already uses this email.");
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { organizationId: organization.id, email, firstName: input.firstName.trim(), lastName: input.lastName?.trim() ?? null, passwordHash: await hashPassword(input.password, env.SESSION_PEPPER) } });
    const role = await tx.userRole.create({ data: { organizationId: organization.id, userId: user.id, role: "EMPLOYEE" } });
    await logActivity(tx, { organizationId: organization.id, actorUserId: user.id, requestId, action: "AUTH_SIGNUP", entityType: "USER", entityId: user.id, summary: `${user.firstName} created an employee account.` });
    return { user, roles: [role] };
  });
  return { user: publicUser(result.user, result.roles), token: await createSession(result.user) };
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findFirst({ where: { email: input.email.trim().toLowerCase() } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash, env.SESSION_PEPPER))) throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  if (user.status !== "ACTIVE") throw new AppError(403, "ACCOUNT_INACTIVE", "This account is not active.");
  const roles = await prisma.userRole.findMany({ where: { userId: user.id, revokedAt: null }, select: { role: true, departmentId: true } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { user: publicUser(user, roles), token: await createSession(user) };
}
