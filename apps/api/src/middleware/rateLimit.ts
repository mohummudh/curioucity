import type { NextFunction, Request, Response } from "express";

type Counter = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 90;

const buckets = new Map<string, Counter>();

const keyFor = (req: Request): string => {
  const fingerprint = req.headers["x-device-fingerprint"];
  if (typeof fingerprint === "string" && fingerprint.length > 0) {
    return `fp:${fingerprint}`;
  }

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}`;
};

export const rateLimit = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path === "/v1/health") {
    next();
    return;
  }

  const key = keyFor(req);
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    next();
    return;
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({ error: "Rate limit exceeded. Please slow down and try again." });
    return;
  }

  current.count += 1;
  buckets.set(key, current);
  next();
};
