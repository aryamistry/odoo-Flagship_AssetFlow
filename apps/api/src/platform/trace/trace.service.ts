import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../database/prisma.js";

type Db = PrismaClient | Prisma.TransactionClient;
export async function logActivity(db: Db, input: { organizationId: string; actorUserId?: string; requestId?: string; action: string; entityType: string; entityId?: string; summary: string; before?: unknown; after?: unknown }) {
  await db.activityLog.create({ data: {
    organizationId: input.organizationId, actorUserId: input.actorUserId ?? null, requestId: input.requestId ?? null,
    action: input.action, entityType: input.entityType, entityId: input.entityId ?? null, summary: input.summary,
    beforeJson: input.before === undefined ? Prisma.JsonNull : input.before as Prisma.InputJsonValue,
    afterJson: input.after === undefined ? Prisma.JsonNull : input.after as Prisma.InputJsonValue,
  } });
}

export async function notify(db: Db, input: { organizationId: string; recipientUserId: string; type: string; title: string; body: string; entityType?: string; entityId?: string; dedupKey?: string }) {
  await db.notification.create({ data: input });
}

export { prisma };
