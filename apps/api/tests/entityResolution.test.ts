import { describe, expect, it } from "vitest";
import { GeminiClient } from "../src/services/providers/geminiClient.js";

describe("entity identity resolution", () => {
  it("normalizes depiction labels to character identity", async () => {
    const client = new GeminiClient() as unknown as {
      isEnabled: () => boolean;
      resolveEntityIdentity: (input: { detectedLabel: string; category: string }) => Promise<{
        canonicalLabel: string;
        researchSubject: string;
        roleplayName: string;
        roleplayMode: string;
      }>;
    };

    client.isEnabled = () => false;

    const resolved = await client.resolveEntityIdentity({
      detectedLabel: "Bust of Alexander the Great",
      category: "statue",
    });

    expect(resolved.roleplayMode).toBe("as_character");
    expect(resolved.canonicalLabel).toBe("Alexander the Great");
    expect(resolved.researchSubject).toBe("Alexander the Great");
    expect(resolved.roleplayName).toBe("Alexander the Great");
  });

  it("keeps non-depictions as object roleplay", async () => {
    const client = new GeminiClient() as unknown as {
      isEnabled: () => boolean;
      resolveEntityIdentity: (input: { detectedLabel: string; category: string }) => Promise<{
        canonicalLabel: string;
        roleplayMode: string;
      }>;
    };

    client.isEnabled = () => false;

    const resolved = await client.resolveEntityIdentity({
      detectedLabel: "Golden Gate Bridge",
      category: "landmark",
    });

    expect(resolved.roleplayMode).toBe("as_object");
    expect(resolved.canonicalLabel).toBe("Golden Gate Bridge");
  });
});
