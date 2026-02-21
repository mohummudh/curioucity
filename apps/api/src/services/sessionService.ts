import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { store } from "../stores/inMemoryStore.js";
import type { SessionInfo } from "../types/domain.js";

export class SessionService {
  createSession(input: {
    locale?: string;
    userAgent?: string;
    deviceCapabilities?: {
      speechRecognition: boolean;
      mediaRecorder: boolean;
    };
  }): SessionInfo {
    const sessionId = randomUUID();
    const token = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + env.sessionTtlMinutes * 60 * 1000);

    const session: SessionInfo = {
      sessionId,
      token,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      locale: input.locale ?? "en-US",
      userAgent: input.userAgent ?? "unknown",
      deviceCapabilities: input.deviceCapabilities,
    };

    store.sessions.set(sessionId, session);
    return session;
  }

  validateSession(sessionId: string, token: string): SessionInfo | null {
    const session = store.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const expired = Date.parse(session.expiresAt) < Date.now();
    if (expired || session.token !== token) {
      return null;
    }

    return session;
  }

  rotateSessionToken(sessionId: string): SessionInfo | null {
    const session = store.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const rotated: SessionInfo = {
      ...session,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + env.sessionTtlMinutes * 60 * 1000).toISOString(),
    };

    store.sessions.set(sessionId, rotated);
    return rotated;
  }
}

export const sessionService = new SessionService();
