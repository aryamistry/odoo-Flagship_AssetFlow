import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("postgresql://assetflow:assetflow@localhost:5432/assetflow?schema=public"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().default("assetflow_session"),
  SESSION_PEPPER: z.string().min(16).default("development-only-change-me-please-32-bytes"),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().positive().default(72),
});

export const env = schema.parse(process.env);
