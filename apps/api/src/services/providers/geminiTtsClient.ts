import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

type GeminiAudioResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};

type GeminiTtsSynthesis = {
  audio: Buffer;
  contentType: string;
};

const pcmToWav = (pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer => {
  const header = Buffer.alloc(44);
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
};

export class GeminiTtsClient {
  isEnabled(): boolean {
    return Boolean(env.geminiApiKey);
  }

  async synthesize(input: { text: string; voiceName?: string }): Promise<GeminiTtsSynthesis | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.voiceRequestTimeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiTtsModel}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.geminiApiKey ?? "",
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: input.text,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: input.voiceName ?? env.geminiTtsVoiceDefault,
                  },
                },
              },
            },
          }),
        },
      );

      if (!response.ok) {
        logger.warn("Gemini TTS request failed", { status: response.status, body: await response.text() });
        return null;
      }

      const payload = (await response.json()) as GeminiAudioResponse;
      const inlineData = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
      if (!inlineData?.data) {
        logger.warn("Gemini TTS response missing audio data");
        return null;
      }

      const audioBytes = Buffer.from(inlineData.data, "base64");
      const mimeType = inlineData.mimeType ?? "audio/pcm";
      if (mimeType.includes("wav")) {
        return {
          audio: audioBytes,
          contentType: "audio/wav",
        };
      }

      if (mimeType.includes("pcm")) {
        return {
          audio: pcmToWav(audioBytes),
          contentType: "audio/wav",
        };
      }

      return {
        audio: audioBytes,
        contentType: mimeType,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.warn("Gemini TTS request timed out", { timeoutMs: env.voiceRequestTimeoutMs });
        return null;
      }

      logger.warn("Gemini TTS request threw", { error: String(error) });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const geminiTtsClient = new GeminiTtsClient();
