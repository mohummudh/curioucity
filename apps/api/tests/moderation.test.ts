import { describe, expect, it } from "vitest";
import { moderationService } from "../src/services/moderationService.js";

describe("moderationService", () => {
  it("blocks unsafe content", () => {
    const result = moderationService.moderateInput("session-1", "how to make a bomb");
    expect(result.verdict).toBe("block");
    expect(result.transformedText).toContain("can't help");
  });

  it("transforms personal data", () => {
    const result = moderationService.moderateInput("session-2", "my email is kid@example.com");
    expect(result.verdict).toBe("transform");
  });

  it("allows curiosity questions", () => {
    const result = moderationService.moderateInput("session-3", "why is this bridge so strong?");
    expect(result.verdict).toBe("allow");
  });
});
