import fs from "node:fs/promises";
import type { CanonicalEntity, EntityCategory, FactItem } from "../../types/domain.js";
import { env } from "../../config/env.js";
import { extractJsonObject } from "../../utils/json.js";
import { logger } from "../../utils/logger.js";

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type VisionOutput = {
  label: string;
  category: EntityCategory;
  confidence: number;
  alternatives: Array<{ label: string; confidence: number }>;
};

type ResearchOutput = {
  summary: string;
  facts: Array<{ claim: string; confidence: number; sourceUrls: string[]; freshnessDate?: string }>;
};

const categoryFromLabel = (label: string): EntityCategory => {
  const lower = label.toLowerCase();
  if (["tower", "bridge", "temple", "monument", "cathedral", "museum"].some((t) => lower.includes(t))) {
    return "landmark";
  }
  if (["bird", "fish", "lion", "dog", "cat", "butterfly", "animal"].some((t) => lower.includes(t))) {
    return "animal";
  }
  if (["tree", "flower", "mountain", "waterfall", "forest", "ocean", "river"].some((t) => lower.includes(t))) {
    return "nature";
  }
  if (["statue", "sculpture", "bust"].some((t) => lower.includes(t))) {
    return "statue";
  }
  if (["circuit", "phone", "computer", "drone", "robot", "electronics"].some((t) => lower.includes(t))) {
    return "electronics";
  }
  if (["planet", "fossil", "microscope", "satellite", "volcano", "crystal"].some((t) => lower.includes(t))) {
    return "science";
  }
  return "other";
};

export class GeminiClient {
  private readonly endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`;

  private isEnabled(): boolean {
    return Boolean(env.geminiApiKey);
  }

  private async generate(parts: Array<Record<string, unknown>>, systemInstruction?: string): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.geminiRequestTimeoutMs);

    try {
      const response = await fetch(`${this.endpoint}?key=${env.geminiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: systemInstruction
            ? {
                parts: [{ text: systemInstruction }],
              }
            : undefined,
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
          },
        }),
      });

      if (!response.ok) {
        logger.warn("Gemini request failed", { status: response.status, body: await response.text() });
        return null;
      }

      const payload = (await response.json()) as GeminiGenerateResponse;
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? null;
      return text;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn("Gemini request timed out", { timeoutMs: env.geminiRequestTimeoutMs });
        return null;
      }

      logger.warn("Gemini request threw", { error: String(error) });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async detectEntityFromImage(imagePath: string, mimeType: string): Promise<CanonicalEntity> {
    if (this.isEnabled()) {
      const bytes = await fs.readFile(imagePath);
      const prompt =
        "Identify the main object in this image for a child-friendly educational app. Return strict JSON: {label, category, confidence, alternatives:[{label,confidence}]}. category must be one of landmark,nature,statue,electronics,science,animal,other.";
      const text = await this.generate(
        [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: bytes.toString("base64"),
            },
          },
        ],
        "You classify image subjects for children and return only valid JSON.",
      );

      const parsed = text ? extractJsonObject<VisionOutput>(text) : null;
      if (parsed?.label) {
        return {
          entityId: `entity-${parsed.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          label: parsed.label,
          category: parsed.category,
          confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
        };
      }
    }

    const fallbackLabel = this.fallbackLabelFromFilename(imagePath);
    return {
      entityId: `entity-${fallbackLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: fallbackLabel,
      category: categoryFromLabel(fallbackLabel),
      confidence: 0.42,
    };
  }

  async deepResearch(
    entity: CanonicalEntity,
    allowedSourceDomains: string[],
  ): Promise<{ summary: string; facts: FactItem[] }> {
    if (this.isEnabled()) {
      const domainText = allowedSourceDomains.join(", ");
      const prompt = [
        `Research ${entity.label} (${entity.category}) for children ages 7-10.`,
        "Return strict JSON with: {summary, facts:[{claim, confidence, sourceUrls, freshnessDate}]}",
        "Rules:",
        "- Provide 4 to 6 highly interesting facts.",
        "- Use concise language that can be spoken.",
        "- Include only trustworthy educational sources.",
        `- Prefer these domains when possible: ${domainText}.`,
        "- confidence between 0 and 1.",
      ].join("\n");

      const text = await this.generate(
        [{ text: prompt }],
        "You are a rigorous research assistant. Verify claims and include citation URLs in each fact.",
      );

      const parsed = text ? extractJsonObject<ResearchOutput>(text) : null;
      if (parsed?.facts?.length) {
        const facts: FactItem[] = parsed.facts
          .filter((fact) => fact.claim && Array.isArray(fact.sourceUrls) && fact.sourceUrls.length > 0)
          .map((fact) => ({
            claim: fact.claim,
            confidence: Math.max(0, Math.min(1, fact.confidence ?? 0.55)),
            sourceUrls: fact.sourceUrls,
            freshnessDate: fact.freshnessDate ?? new Date().toISOString().slice(0, 10),
          }));

        if (facts.length > 0) {
          return {
            summary: parsed.summary ?? `${entity.label} is full of fascinating stories and science.`,
            facts,
          };
        }
      }
    }

    return this.fallbackResearch(entity);
  }

  async generateFollowupReply(input: {
    entity: CanonicalEntity;
    question: string;
    summary: string;
    candidateFacts: FactItem[];
    recentTurns: Array<{ user: string; assistant: string }>;
  }): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const prompt = JSON.stringify(
      {
        instruction:
          "Answer in first-person as the object for a child age 7-10. Keep it kid-safe, wonder-driven, and under 80 words. End with one curiosity question.",
        entity: input.entity,
        question: input.question,
        summary: input.summary,
        candidateFacts: input.candidateFacts,
        recentTurns: input.recentTurns,
      },
      null,
      2,
    );

    const text = await this.generate([{ text: prompt }], "Return strict JSON: {reply}");
    const parsed = text ? extractJsonObject<{ reply: string }>(text) : null;
    return parsed?.reply ?? null;
  }

  async transcribeAudio(base64Audio: string, mimeType: string): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const prompt = "Transcribe this speech from a child into clean English text. Return strict JSON {text}.";
    const text = await this.generate(
      [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Audio,
          },
        },
      ],
      "You are a transcription assistant. Return only JSON.",
    );

    const parsed = text ? extractJsonObject<{ text: string }>(text) : null;
    return parsed?.text ?? null;
  }

  private fallbackResearch(entity: CanonicalEntity): { summary: string; facts: FactItem[] } {
    const date = new Date().toISOString().slice(0, 10);
    const fallbackFacts: Record<EntityCategory, Array<{ claim: string; source: string }>> = {
      landmark: [
        { claim: `${entity.label} was built with engineering tricks that were advanced for its time.`, source: "https://www.britannica.com" },
        { claim: `People from around the world visit ${entity.label} to learn history and culture.`, source: "https://www.nationalgeographic.com" },
        { claim: `Weather and time slowly shape ${entity.label}, so experts help preserve it.`, source: "https://www.smithsonianmag.com" },
      ],
      nature: [
        { claim: `${entity.label} is part of an ecosystem where many living things depend on each other.`, source: "https://www.nationalgeographic.com" },
        { claim: `Changes in climate and seasons can transform how ${entity.label} looks over time.`, source: "https://www.noaa.gov" },
        { claim: `Scientists study ${entity.label} to understand Earth systems and biodiversity.`, source: "https://www.usgs.gov" },
      ],
      statue: [
        { claim: `Artists use shapes, balance, and materials to make statues feel alive.`, source: "https://www.britannica.com" },
        { claim: `${entity.label} can represent a story, a hero, or an important moment.`, source: "https://www.smithsonianmag.com" },
        { claim: `Conservators protect statues from weather and pollution damage.`, source: "https://www.nationalgeographic.com" },
      ],
      electronics: [
        { claim: `${entity.label} works by guiding electricity through tiny pathways called circuits.`, source: "https://www.britannica.com" },
        { claim: `Many electronics use sensors to detect light, motion, sound, or temperature.`, source: "https://www.nasa.gov" },
        { claim: `Engineers design electronics by solving tradeoffs between speed, power, and size.`, source: "https://www.nationalgeographic.com" },
      ],
      science: [
        { claim: `${entity.label} helps scientists test ideas and discover how nature works.`, source: "https://www.nasa.gov" },
        { claim: `Scientific discoveries often come from careful measurements repeated many times.`, source: "https://www.britannica.com" },
        { claim: `New technology can turn old science questions into fresh discoveries.`, source: "https://www.smithsonianmag.com" },
      ],
      animal: [
        { claim: `${entity.label} has adaptations that help it survive in its habitat.`, source: "https://www.nationalgeographic.com" },
        { claim: `Animal behavior can change between day and night or across seasons.`, source: "https://www.britannica.com" },
        { claim: `Scientists track animals to learn how ecosystems stay healthy.`, source: "https://www.noaa.gov" },
      ],
      other: [
        { claim: `${entity.label} has a story that connects science, history, and creativity.`, source: "https://www.britannica.com" },
        { claim: `Experts observe small details to uncover surprising facts about ${entity.label}.`, source: "https://www.nationalgeographic.com" },
        { claim: `Questions about ${entity.label} can lead to big discoveries.`, source: "https://www.smithsonianmag.com" },
      ],
    };

    const facts = (fallbackFacts[entity.category] ?? fallbackFacts.other).map((fact) => ({
      claim: fact.claim,
      confidence: 0.62,
      sourceUrls: [fact.source],
      freshnessDate: date,
    }));

    return {
      summary: `${entity.label} is full of clues about how our world works.`,
      facts,
    };
  }

  private fallbackLabelFromFilename(imagePath: string): string {
    const lower = imagePath.toLowerCase();
    const candidates = [
      "eiffel",
      "bridge",
      "tree",
      "flower",
      "statue",
      "phone",
      "robot",
      "planet",
      "bird",
    ];

    const found = candidates.find((candidate) => lower.includes(candidate));
    if (!found) {
      return "mystery object";
    }

    if (found === "eiffel") return "Eiffel Tower";
    if (found === "bridge") return "bridge";
    if (found === "tree") return "tree";
    if (found === "flower") return "flower";
    if (found === "phone") return "smartphone";
    return found;
  }
}

export const geminiClient = new GeminiClient();
