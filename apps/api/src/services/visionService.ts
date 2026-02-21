import type { CanonicalEntity } from "../types/domain.js";
import { geminiClient } from "./providers/geminiClient.js";
import { moderationService } from "./moderationService.js";

export class VisionService {
  async detectEntity(input: {
    sessionId: string;
    imagePath: string;
    mimeType: string;
  }): Promise<CanonicalEntity> {
    const entity = await geminiClient.detectEntityFromImage(input.imagePath, input.mimeType);
    const imageModeration = moderationService.moderateImageLabel(input.sessionId, entity.label);

    if (imageModeration.verdict === "block") {
      return {
        entityId: "entity-mystery-object",
        label: imageModeration.transformedText ?? "mystery object",
        category: "other",
        confidence: 0.2,
      };
    }

    return entity;
  }
}

export const visionService = new VisionService();
