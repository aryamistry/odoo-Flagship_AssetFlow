import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => void handler(req, res, next).catch(next);
}

export function data(req: Request, res: Response, value: unknown, status = 200, meta: Record<string, unknown> = {}) {
  return res.status(status).json({ data: value, meta: { ...meta, requestId: req.requestId } });
}

export function pageMeta(page: number, pageSize: number, total: number) { return { page, pageSize, total }; }

