import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./platform/config/env.js";
import { AppError, errorHandler, notFound } from "./platform/http/errors.js";
import { authenticate } from "./platform/auth/session.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { organizationRouter } from "./modules/organization/organization.routes.js";
import { assetRouter } from "./modules/assets/asset.routes.js";
import { allocationRouter } from "./modules/allocations/allocation.routes.js";
import { bookingRouter } from "./modules/bookings/booking.routes.js";
import { maintenanceRouter } from "./modules/maintenance/maintenance.routes.js";
import { auditRouter } from "./modules/audits/audit.routes.js";
import { operationsRouter } from "./modules/operations/operations.routes.js";

export function createApp() {
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) => typeof value === "bigint" ? value.toString() : value);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.header("origin");
    if (origin && origin !== env.WEB_ORIGIN) return next(new AppError(403, "INVALID_ORIGIN", "The request origin is not allowed."));
    next();
  });
  app.use((req, res, next) => {
    req.requestId = req.header("x-request-id") ?? crypto.randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.use(authenticate);
  app.get("/api/v1/health", (req, res) => res.json({ data: { status: "ok" }, meta: { requestId: req.requestId } }));
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1", organizationRouter);
  app.use("/api/v1", assetRouter);
  app.use("/api/v1", allocationRouter);
  app.use("/api/v1", bookingRouter);
  app.use("/api/v1", maintenanceRouter);
  app.use("/api/v1", auditRouter);
  app.use("/api/v1", operationsRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
