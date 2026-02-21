import { describe, expect, it } from "vitest";
import { sessionService } from "../src/services/sessionService.js";

describe("sessionService", () => {
  it("creates and validates a session", () => {
    const session = sessionService.createSession({ locale: "en-US", userAgent: "test" });
    const validated = sessionService.validateSession(session.sessionId, session.token);

    expect(validated).not.toBeNull();
    expect(validated?.sessionId).toBe(session.sessionId);
  });

  it("rejects wrong token", () => {
    const session = sessionService.createSession({ locale: "en-US", userAgent: "test" });
    const validated = sessionService.validateSession(session.sessionId, "nope");
    expect(validated).toBeNull();
  });
});
