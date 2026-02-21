import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

type ElevenLabsSynthesis = {
  audio: Buffer;
  contentType: string;
};

export class ElevenLabsClient {
  isEnabled(): boolean {
    return Boolean(env.elevenLabsApiKey);
  }

  async synthesize(input: { text: string; voiceId?: string }): Promise<ElevenLabsSynthesis | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const voiceId = input.voiceId ?? env.defaultVoiceId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.voiceRequestTimeoutMs);

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": env.elevenLabsApiKey ?? "",
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: input.text,
          model_id: env.elevenLabsModel,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.65,
            style: 0.65,
            use_speaker_boost: true,
          },
        }),
      });

      if (!response.ok) {
        logger.warn("ElevenLabs request failed", { status: response.status, body: await response.text() });
        return null;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return {
        audio: buffer,
        contentType: response.headers.get("content-type") ?? "audio/mpeg",
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn("ElevenLabs request timed out", { timeoutMs: env.voiceRequestTimeoutMs });
        return null;
      }

      logger.warn("ElevenLabs request threw", { error: String(error) });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const elevenLabsClient = new ElevenLabsClient();
