import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema, signupSchema } from "@assetflow/contracts";
import { env } from "../../platform/config/env.js";
import { asyncHandler, data } from "../../platform/http/async-handler.js";
import { cookieOptions, requireAuth, revokeSession } from "../../platform/auth/session.js";
import * as service from "./auth.service.js";

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
authRouter.post("/signup", limiter, asyncHandler(async (req, res) => { const result = await service.signup(signupSchema.parse(req.body), req.requestId); res.cookie(env.SESSION_COOKIE_NAME, result.token, cookieOptions); return data(req, res, result.user, 201); }));
authRouter.post("/login", limiter, asyncHandler(async (req, res) => { const result = await service.login(loginSchema.parse(req.body)); res.cookie(env.SESSION_COOKIE_NAME, result.token, cookieOptions); return data(req, res, result.user); }));
authRouter.post("/logout", asyncHandler(async (req, res) => { await revokeSession(req.cookies[env.SESSION_COOKIE_NAME]); res.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions); return res.status(204).end(); }));
authRouter.get("/me", requireAuth, (req, res) => data(req, res, req.actor));
