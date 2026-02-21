import { env } from "../config/env.js";
import { store } from "../stores/inMemoryStore.js";
import type { CanonicalEntity, FactPack } from "../types/domain.js";
import { geminiClient } from "./providers/geminiClient.js";

const cacheKeyFor = (entity: CanonicalEntity): string =>
  `${entity.entityId}:age-7-10:en-US:strict-safety-v1`;

const sourceAllowed = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return store.policy.allowedSourceDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

export class ResearchService {
  async getFactPack(entity: CanonicalEntity): Promise<FactPack> {
    const key = cacheKeyFor(entity);
    const cached = store.factCache.get(key);
    if (cached && Date.parse(cached.expiresAt) > Date.now()) {
      return cached.value as FactPack;
    }

    const research = await geminiClient.deepResearch(entity, store.policy.allowedSourceDomains);
    const filteredFacts = research.facts
      .map((fact) => ({
        ...fact,
        sourceUrls: fact.sourceUrls.filter(sourceAllowed),
      }))
      .filter((fact) => fact.confidence >= store.policy.minFactConfidence && fact.sourceUrls.length > 0);

    const factPack: FactPack = {
      entity,
      summary: research.summary,
      facts: filteredFacts.length > 0 ? filteredFacts : research.facts,
      generatedAt: new Date().toISOString(),
    };

    store.factCache.set(key, {
      value: factPack,
      expiresAt: new Date(Date.now() + env.factCacheTtlMinutes * 60 * 1000).toISOString(),
    });

    return factPack;
  }
}

export const researchService = new ResearchService();
