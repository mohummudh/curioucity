import { randomUUID } from "node:crypto";
import { store } from "../stores/inMemoryStore.js";
import type { AnalysisResult, ConversationState } from "../types/domain.js";
import { analyticsService } from "./analyticsService.js";
import { ingestionService } from "./ingestionService.js";
import { moderationService } from "./moderationService.js";
import { personaService } from "./personaService.js";
import { geminiClient } from "./providers/geminiClient.js";
import { researchService } from "./researchService.js";
import { uploadService } from "./uploadService.js";
import { visionService } from "./visionService.js";
import { voiceService } from "./voiceService.js";
import { logger } from "../utils/logger.js";

const parseUploadIdFromImageUrl = (imageUrl: string): string | null => {
  const match = imageUrl.match(/\/v1\/media\/([a-fA-F0-9-]+)/);
  return match?.[1] ?? null;
};

export class AnalysisService {
  createAnalysis(input: { sessionId: string; imageUrl: string }): AnalysisResult {
    const analysisId = randomUUID();
    const now = new Date().toISOString();

    const analysis: AnalysisResult = {
      analysisId,
      sessionId: input.sessionId,
      imageUrl: input.imageUrl,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };

    store.analyses.set(analysisId, analysis);
    analyticsService.track("analysis_requested", input.sessionId, { analysisId });

    void this.processAnalysis(analysisId).catch((error) => {
      logger.error("Failed to process analysis", { analysisId, error: String(error) });
    });

    return analysis;
  }

  getAnalysis(analysisId: string): AnalysisResult | null {
    return store.analyses.get(analysisId) ?? null;
  }

  private async processAnalysis(analysisId: string): Promise<void> {
    const existing = store.analyses.get(analysisId);
    if (!existing) {
      return;
    }

    this.updateAnalysis(analysisId, { status: "processing" });

    try {
      const uploadId = parseUploadIdFromImageUrl(existing.imageUrl);
      if (!uploadId) {
        throw new Error("Invalid image URL");
      }

      const upload = uploadService.resolveImage(uploadId);
      if (!upload?.filePath || !upload.mimeType) {
        throw new Error("Image not found");
      }

      if (upload.sessionId !== existing.sessionId) {
        throw new Error("Image session mismatch");
      }

      ingestionService.validateMimeType(upload.mimeType);
      await ingestionService.malwareScan(upload.filePath);
      const normalizedPath = await ingestionService.preprocessImage(upload.filePath);
      const normalizedMimeType = "image/jpeg";

      const entity = await visionService.detectEntity({
        sessionId: existing.sessionId,
        imagePath: normalizedPath,
        mimeType: normalizedMimeType,
      });

      const factPack = await researchService.getFactPack(entity);
      const persona = personaService.buildPersona(entity);
      const hook = personaService.buildHook(entity);
      const initialText =
        (await geminiClient.generateOpeningReply({
          entity,
          hook,
          summary: factPack.summary,
          candidateFacts: factPack.facts.slice(0, 3),
        })) ?? personaService.buildFirstReply({ factPack, hook });

      const moderated = moderationService.moderateOutput(existing.sessionId, initialText);
      const safeText = moderated.transformedText ?? initialText;

      const voiceAsset = await voiceService.synthesizeToAsset({
        text: safeText,
        archetype: persona.voiceArchetype,
      });

      const conversationId = randomUUID();
      const conversationState: ConversationState = {
        conversationId,
        sessionId: existing.sessionId,
        entity,
        factPack,
        persona,
        usedFactIndexes: new Set([0, 1]),
        turns: [
          {
            turnId: randomUUID(),
            userInput: "[initial-analysis]",
            assistantText: safeText,
            safetyVerdict: moderated.verdict,
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.conversations.set(conversationId, conversationState);

      this.updateAnalysis(analysisId, {
        status: "ready",
        entity,
        hookText: hook,
        firstReplyText: safeText,
        firstReplyAudioStreamUrl: voiceAsset?.streamUrl,
        safetyStatus: moderated.verdict,
        conversationId,
      });

      analyticsService.track("first_audio_ready", existing.sessionId, {
        analysisId,
        hasAudio: Boolean(voiceAsset),
        entity: entity.label,
      });
    } catch (error) {
      this.updateAnalysis(analysisId, {
        status: "failed",
        error: String(error),
      });
    }
  }

  private updateAnalysis(analysisId: string, patch: Partial<AnalysisResult>): void {
    const current = store.analyses.get(analysisId);
    if (!current) {
      return;
    }

    store.analyses.set(analysisId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }
}

export const analysisService = new AnalysisService();
