import { describe, expect, it } from "vitest";
import { personaService } from "../src/services/personaService.js";

const factPack = {
  entity: {
    entityId: "entity-bridge",
    label: "Golden Gate Bridge",
    category: "landmark" as const,
    confidence: 0.88,
  },
  facts: [
    {
      claim: "I can sway in strong wind without breaking.",
      confidence: 0.8,
      sourceUrls: ["https://example.com"],
      freshnessDate: "2026-01-01",
    },
    {
      claim: "My color is called international orange.",
      confidence: 0.8,
      sourceUrls: ["https://example.com"],
      freshnessDate: "2026-01-01",
    },
  ],
  summary: "A famous suspension bridge.",
  generatedAt: "2026-01-01",
};

describe("personaService", () => {
  it("builds a first reply with hook, facts, and curiosity question", () => {
    const hook = personaService.buildHook(factPack.entity);
    const text = personaService.buildFirstReply({ factPack, hook });

    expect(text).toContain(hook);
    expect(text).toContain("international orange");
    expect(text).toMatch(/\?/);
  });
});
