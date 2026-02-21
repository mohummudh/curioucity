import { geminiClient } from "./providers/geminiClient.js";

export class SpeechService {
  async transcribeFromUrl(audioBlobUrl: string): Promise<string | null> {
    try {
      const response = await fetch(audioBlobUrl);
      if (!response.ok) {
        return null;
      }

      const mimeType = response.headers.get("content-type") ?? "audio/webm";
      const buffer = Buffer.from(await response.arrayBuffer());
      return this.transcribeBuffer(buffer, mimeType);
    } catch {
      return null;
    }
  }

  async transcribeBuffer(buffer: Buffer, mimeType: string): Promise<string | null> {
    const base64Audio = buffer.toString("base64");
    return geminiClient.transcribeAudio(base64Audio, mimeType);
  }
}

export const speechService = new SpeechService();
