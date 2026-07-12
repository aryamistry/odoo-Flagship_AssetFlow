import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found."));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const prismaConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? new AppError(409, "DUPLICATE_VALUE", "A record with this unique value already exists.") : null;
  const normalized = error instanceof ZodError
    ? new AppError(400, "VALIDATION_ERROR", error.issues.map((issue) => issue.message).join(", "))
    : error instanceof AppError ? error : prismaConflict ?? new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  res.status(normalized.status).json({
    type: `https://assetflow.local/problems/${normalized.code.toLowerCase().replaceAll("_", "-")}`,
    title: normalized.message,
    status: normalized.status,
    detail: normalized.message,
    code: normalized.code,
    requestId: req.requestId,
    errors: error instanceof ZodError ? error.issues : [],
  });
}
