import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { store } from "../stores/inMemoryStore.js";
import type { ModerationResult } from "../types/domain.js";

const BLOCKED_PATTERNS = [
  /\bkill\b/i,
  /\bweapon\b/i,
  /\bsuicide\b/i,
  /\bsexual\b/i,
  /\bporn\b/i,
  /\bhow to make (?:a )?bomb\b/i,
  /\bdrug\b/i,
  /\bgive me your address\b/i,
  /\bphone number\b/i,
  /\bemail\b/i,
  /\bpassword\b/i,
];

const PII_PATTERNS = [
  /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  /\b\d{1,5}\s+[\w\s]+(?:st|street|ave|avenue|blvd|boulevard|rd|road|ln|lane|dr|drive)\b/i,
];

const SAFE_REDIRECT =
  "I can't help with that topic. But I can share a cool, safe fact and ask a curiosity question instead.";

export class ModerationService {
  moderateInput(sessionId: string, text: string): ModerationResult {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return { verdict: "allow", reasons: [] };
    }

    const piiReason = this.findPiiReason(trimmed);
    if (piiReason) {
      this.recordIncident(sessionId, piiReason, trimmed);
      return {
        verdict: "transform",
        reasons: [piiReason],
        transformedText: "Let's skip personal details and explore science or history instead!",
      };
    }

    const blockedReason = this.findBlockedReason(trimmed);
    if (blockedReason) {
      this.recordIncident(sessionId, blockedReason, trimmed);
      return {
        verdict: "block",
        reasons: [blockedReason],
        transformedText: SAFE_REDIRECT,
      };
    }

    return { verdict: "allow", reasons: [] };
  }

  moderateOutput(sessionId: string, text: string): ModerationResult {
    const blockedReason = this.findBlockedReason(text);
    if (blockedReason) {
      this.recordIncident(sessionId, `output:${blockedReason}`, text);
      return {
        verdict: env.strictSafety ? "transform" : "allow",
        reasons: [blockedReason],
        transformedText:
          "I found a safer way to explain this. Let's stay on kid-friendly science and discovery!",
      };
    }

    return { verdict: "allow", reasons: [] };
  }

  moderateImageLabel(sessionId: string, label: string): ModerationResult {
    const blockedReason = this.findBlockedReason(label);
    if (blockedReason) {
      this.recordIncident(sessionId, `image:${blockedReason}`, label);
      return {
        verdict: "block",
        reasons: [blockedReason],
        transformedText: "mystery object",
      };
    }

    return { verdict: "allow", reasons: [] };
  }

  private findBlockedReason(text: string): string | null {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(text)) {
        return "blocked_topic";
      }
    }
    return null;
  }

  private findPiiReason(text: string): string | null {
    for (const pattern of PII_PATTERNS) {
      if (pattern.test(text)) {
        return "personal_data";
      }
    }
    return null;
  }

  private recordIncident(sessionId: string, reason: string, payload: string): void {
    store.incidents.push({
      incidentId: randomUUID(),
      sessionId,
      reason,
      payload,
      createdAt: new Date().toISOString(),
    });
  }
}

export const moderationService = new ModerationService();
