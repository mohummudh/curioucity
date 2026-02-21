import type { Request, Response } from "express";
import { sessionService } from "../services/sessionService.js";

export const extractSessionCredentials = (
  req: Request,
): {
  sessionId: string | null;
  token: string | null;
} => {
  const sessionId =
    (req.headers["x-session-id"] as string | undefined) ??
    (req.body?.session_id as string | undefined) ??
    (req.query.session_id as string | undefined) ??
    null;

  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token =
    (req.headers["x-session-token"] as string | undefined) ??
    (req.body?.token as string | undefined) ??
    bearer ??
    null;

  return {
    sessionId,
    token,
  };
};

export const requireSession = (req: Request, res: Response): { sessionId: string; token: string } | null => {
  const creds = extractSessionCredentials(req);

  if (!creds.sessionId || !creds.token) {
    res.status(401).json({ error: "session_id and token are required" });
    return null;
  }

  const session = sessionService.validateSession(creds.sessionId, creds.token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }

  return {
    sessionId: creds.sessionId,
    token: creds.token,
  };
};
