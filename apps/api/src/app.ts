import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./platform/config/env.js";
import { errorHandler, notFound } from "./platform/http/errors.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.requestId = req.header("x-request-id") ?? crypto.randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });
  app.get("/api/v1/health", (req, res) => res.json({ data: { status: "ok" }, meta: { requestId: req.requestId } }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

