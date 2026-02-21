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
      const mystery = imageModeration.transformedText ?? "mystery object";
      return {
        entityId: "entity-mystery-object",
        label: mystery,
        detectedLabel: mystery,
        category: "other",
        confidence: 0.2,
        researchSubject: mystery,
        roleplayName: mystery,
        roleplayMode: "as_object",
      };
    }

    return entity;
  }
}

export const visionService = new VisionService();
