import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  SESSION_COOKIE_NAME: z.string().default("assetflow_session"),
  SESSION_PEPPER: z.string().min(16),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(8),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().positive().default(72),
});

export const env = schema.parse(process.env);

