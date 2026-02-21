import fs from "node:fs/promises";
import type { CanonicalEntity, EntityCategory, FactItem, RoleplayMode } from "../../types/domain.js";
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

type EntityResolutionOutput = {
  canonicalLabel: string;
  researchSubject: string;
  roleplayName: string;
  roleplayMode: RoleplayMode;
};

type ReplyOutput = {
  reply: string;
};

const CATEGORY_SET = new Set<EntityCategory>([
  "landmark",
  "nature",
  "statue",
  "electronics",
  "science",
  "animal",
  "other",
]);

const DEPICTION_PATTERN = /\b(bust|statue|sculpture|portrait|painting|figure)\b/i;

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
  if (["statue", "sculpture", "bust", "portrait"].some((t) => lower.includes(t))) {
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

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const sanitizeName = (value: string | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  const cleaned = normalizeWhitespace(value)
    .replace(/^the\s+/i, "")
    .replace(/[.,!?;:]+$/g, "")
    .trim();

  if (!cleaned || cleaned.length > 140) {
    return fallback;
  }

  return cleaned;
};

const heuristicIdentity = (detectedLabel: string, category: EntityCategory): EntityResolutionOutput => {
  const cleanedLabel = sanitizeName(detectedLabel, "mystery object");

  const depictionPatterns = [
    /^(?:a|an|the)?\s*(?:bust|statue|sculpture|portrait|painting|figure)\s+(?:of|depicting|showing)\s+(.+)$/i,
    /^(?:a|an|the)?\s*(.+?)\s+(?:bust|statue|sculpture|portrait|painting)$/i,
  ];

  if (category === "statue" || DEPICTION_PATTERN.test(cleanedLabel)) {
    for (const pattern of depictionPatterns) {
      const match = cleanedLabel.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const subject = sanitizeName(match[1], cleanedLabel);
      return {
        canonicalLabel: subject,
        researchSubject: subject,
        roleplayName: subject,
        roleplayMode: "as_character",
      };
    }
  }

  return {
    canonicalLabel: cleanedLabel,
    researchSubject: cleanedLabel,
    roleplayName: cleanedLabel,
    roleplayMode: "as_object",
  };
};

export class GeminiClient {
  private readonly endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`;

  private isEnabled(): boolean {
    return Boolean(env.geminiApiKey);
  }

  private normalizeCategory(category: string | undefined, label: string): EntityCategory {
    if (category && CATEGORY_SET.has(category as EntityCategory)) {
      return category as EntityCategory;
    }

    return categoryFromLabel(label);
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
            temperature: 0.35,
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

  private async resolveEntityIdentity(input: {
    detectedLabel: string;
    category: EntityCategory;
  }): Promise<EntityResolutionOutput> {
    const heuristic = heuristicIdentity(input.detectedLabel, input.category);

    const shouldRefineWithModel =
      this.isEnabled() && (input.category === "statue" || DEPICTION_PATTERN.test(input.detectedLabel));

    if (!shouldRefineWithModel) {
      return heuristic;
    }

    const prompt = JSON.stringify(
      {
        detectedLabel: input.detectedLabel,
        category: input.category,
        instruction: [
          "Resolve the best character identity for a kids voice roleplay app.",
          "If the image is a depiction (bust/statue/portrait of a person), set roleplayMode to as_character and set canonicalLabel/researchSubject/roleplayName to the depicted person.",
          "If not a depiction, set roleplayMode to as_object and keep identity as the object.",
          "Never return labels like 'bust of X' as canonicalLabel when roleplayMode is as_character.",
          "Return strict JSON only.",
        ].join(" "),
      },
      null,
      2,
    );

    const text = await this.generate([{ text: prompt }], "Return strict JSON: {canonicalLabel,researchSubject,roleplayName,roleplayMode}");
    const parsed = text ? extractJsonObject<EntityResolutionOutput>(text) : null;

    if (!parsed) {
      return heuristic;
    }

    const mode: RoleplayMode = parsed.roleplayMode === "as_character" ? "as_character" : "as_object";
    const subjectFallback = mode === "as_character" ? heuristic.researchSubject : heuristic.canonicalLabel;

    const researchSubject = sanitizeName(parsed.researchSubject, subjectFallback);
    const roleplayName = sanitizeName(parsed.roleplayName, researchSubject);
    let canonicalLabel = sanitizeName(parsed.canonicalLabel, researchSubject);

    if (mode === "as_character" && DEPICTION_PATTERN.test(canonicalLabel)) {
      canonicalLabel = researchSubject;
    }

    return {
      canonicalLabel,
      researchSubject,
      roleplayName,
      roleplayMode: mode,
    };
  }

  async detectEntityFromImage(imagePath: string, mimeType: string): Promise<CanonicalEntity> {
    if (this.isEnabled()) {
      const bytes = await fs.readFile(imagePath);
      const prompt =
        "Identify the main visible subject in this image for a child educational app. Return strict JSON: {label, category, confidence, alternatives:[{label,confidence}]}. category must be one of landmark,nature,statue,electronics,science,animal,other.";
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
        const detectedLabel = sanitizeName(parsed.label, "mystery object");
        const category = this.normalizeCategory(parsed.category, detectedLabel);
        const identity = await this.resolveEntityIdentity({
          detectedLabel,
          category,
        });

        return {
          entityId: `entity-${identity.canonicalLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          label: identity.canonicalLabel,
          detectedLabel,
          category,
          confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
          researchSubject: identity.researchSubject,
          roleplayName: identity.roleplayName,
          roleplayMode: identity.roleplayMode,
        };
      }
    }

    const fallbackLabel = this.fallbackLabelFromFilename(imagePath);
    const category = categoryFromLabel(fallbackLabel);
    const identity = heuristicIdentity(fallbackLabel, category);

    return {
      entityId: `entity-${identity.canonicalLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label: identity.canonicalLabel,
      detectedLabel: fallbackLabel,
      category,
      confidence: 0.42,
      researchSubject: identity.researchSubject,
      roleplayName: identity.roleplayName,
      roleplayMode: identity.roleplayMode,
    };
  }

  async deepResearch(
    entity: CanonicalEntity,
    allowedSourceDomains: string[],
  ): Promise<{ summary: string; facts: FactItem[] }> {
    if (this.isEnabled()) {
      const domainText = allowedSourceDomains.join(", ");
      const prompt = [
        `Research subject: ${entity.researchSubject}.`,
        `Detected visual label: ${entity.detectedLabel ?? entity.label}.`,
        `Roleplay identity: ${entity.roleplayName} (${entity.roleplayMode}).`,
        "Return strict JSON with: {summary, facts:[{claim, confidence, sourceUrls, freshnessDate}]}",
        "Rules:",
        "- Provide 4 to 6 highly interesting facts for children ages 7-10.",
        "- Focus on the research subject, not the artwork container, when roleplayMode is as_character.",
        "- Prefer facts that spark curiosity (surprises, myths vs truth, design secrets, big turning points).",
        "- Claims must be concise, child-friendly, and citation-backed.",
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
            summary: parsed.summary ?? `${entity.roleplayName} is full of fascinating stories and science.`,
            facts,
          };
        }
      }
    }

    return this.fallbackResearch(entity);
  }

  async generateOpeningReply(input: {
    entity: CanonicalEntity;
    hook: string;
    summary: string;
    candidateFacts: FactItem[];
  }): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const prompt = JSON.stringify(
      {
        instruction: [
          "Create the first spoken reply for a child ages 7-10.",
          `You are roleplaying as: ${input.entity.roleplayName}.`,
          `Roleplay mode: ${input.entity.roleplayMode}.`,
          "Always speak in first person.",
          "If mode is as_character, never describe yourself as 'the bust/statue/portrait of ...'.",
          "Use short spoken sentences and simple words a 7-year-old can understand.",
          "Sound like a warm storyteller, not a textbook.",
          "Start with the exact hook sentence provided.",
          "Then add one surprising twist or conflict fact (for example: people once disliked me at first).",
          "Add one more wow fact.",
          "End with one curiosity question that piques interest.",
          "Use contractions naturally.",
          "Keep under 90 words.",
          "Return strict JSON: {reply}.",
        ].join(" "),
        hook: input.hook,
        summary: input.summary,
        candidateFacts: input.candidateFacts,
      },
      null,
      2,
    );

    const text = await this.generate([{ text: prompt }], "Return strict JSON only.");
    const parsed = text ? extractJsonObject<ReplyOutput>(text) : null;
    return parsed?.reply ?? null;
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
        instruction: [
          "Answer as a child-safe, wonder-driven voice guide for ages 7-10.",
          `Roleplay identity: ${input.entity.roleplayName}.`,
          `Roleplay mode: ${input.entity.roleplayMode}.`,
          "Speak in first person.",
          "If mode is as_character, never call yourself 'the bust/statue/portrait of ...'.",
          "If needed, you may say a bust/statue is an artwork made of you.",
          "Use short conversational sentences, lively tone, and simple language.",
          "Add one fresh wow fact linked to the child's question.",
          "End with one curiosity question that invites the child to ask more.",
          "Use contractions naturally.",
          "Under 80 words.",
          "Return strict JSON: {reply}.",
        ].join(" "),
        entity: input.entity,
        question: input.question,
        summary: input.summary,
        candidateFacts: input.candidateFacts,
        recentTurns: input.recentTurns,
      },
      null,
      2,
    );

    const text = await this.generate([{ text: prompt }], "Return strict JSON only.");
    const parsed = text ? extractJsonObject<ReplyOutput>(text) : null;
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
    const subject = entity.researchSubject;

    const characterFacts = [
      { claim: `${subject} is remembered because their story influenced history and culture across generations.`, source: "https://www.britannica.com" },
      { claim: `People still study ${subject} to understand leadership, choices, and turning points in history.`, source: "https://www.smithsonianmag.com" },
      { claim: `Different places and books tell stories about ${subject}, so historians compare evidence carefully.`, source: "https://www.nationalgeographic.com" },
    ];

    const fallbackFacts: Record<EntityCategory, Array<{ claim: string; source: string }>> = {
      landmark: [
        { claim: `${subject} was built with engineering tricks that were advanced for its time.`, source: "https://www.britannica.com" },
        { claim: `People from around the world visit ${subject} to learn history and culture.`, source: "https://www.nationalgeographic.com" },
        { claim: `Weather and time slowly shape ${subject}, so experts help preserve it.`, source: "https://www.smithsonianmag.com" },
      ],
      nature: [
        { claim: `${subject} is part of an ecosystem where many living things depend on each other.`, source: "https://www.nationalgeographic.com" },
        { claim: `Changes in climate and seasons can transform how ${subject} looks over time.`, source: "https://www.noaa.gov" },
        { claim: `Scientists study ${subject} to understand Earth systems and biodiversity.`, source: "https://www.usgs.gov" },
      ],
      statue: entity.roleplayMode === "as_character"
        ? characterFacts
        : [
            { claim: `Artists use shapes, balance, and materials to make statues feel alive.`, source: "https://www.britannica.com" },
            { claim: `${subject} can represent a story, a hero, or an important moment.`, source: "https://www.smithsonianmag.com" },
            { claim: `Conservators protect statues from weather and pollution damage.`, source: "https://www.nationalgeographic.com" },
          ],
      electronics: [
        { claim: `${subject} works by guiding electricity through tiny pathways called circuits.`, source: "https://www.britannica.com" },
        { claim: `Many electronics use sensors to detect light, motion, sound, or temperature.`, source: "https://www.nasa.gov" },
        { claim: `Engineers design electronics by solving tradeoffs between speed, power, and size.`, source: "https://www.nationalgeographic.com" },
      ],
      science: [
        { claim: `${subject} helps scientists test ideas and discover how nature works.`, source: "https://www.nasa.gov" },
        { claim: `Scientific discoveries often come from careful measurements repeated many times.`, source: "https://www.britannica.com" },
        { claim: `New technology can turn old science questions into fresh discoveries.`, source: "https://www.smithsonianmag.com" },
      ],
      animal: [
        { claim: `${subject} has adaptations that help it survive in its habitat.`, source: "https://www.nationalgeographic.com" },
        { claim: `Animal behavior can change between day and night or across seasons.`, source: "https://www.britannica.com" },
        { claim: `Scientists track animals to learn how ecosystems stay healthy.`, source: "https://www.noaa.gov" },
      ],
      other: [
        { claim: `${subject} has a story that connects science, history, and creativity.`, source: "https://www.britannica.com" },
        { claim: `Experts observe small details to uncover surprising facts about ${subject}.`, source: "https://www.nationalgeographic.com" },
        { claim: `Questions about ${subject} can lead to big discoveries.`, source: "https://www.smithsonianmag.com" },
      ],
    };

    const facts = (fallbackFacts[entity.category] ?? fallbackFacts.other).map((fact) => ({
      claim: fact.claim,
      confidence: 0.62,
      sourceUrls: [fact.source],
      freshnessDate: date,
    }));

    return {
      summary: `${entity.roleplayName} is full of clues about how our world works.`,
      facts,
    };
  }

  private fallbackLabelFromFilename(imagePath: string): string {
    const lower = imagePath.toLowerCase();
    const candidates = ["eiffel", "bridge", "tree", "flower", "statue", "phone", "robot", "planet", "bird"];

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
