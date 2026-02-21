import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { store } from "../stores/inMemoryStore.js";
import type { PersonaArchetype } from "../types/domain.js";
import { elevenLabsClient } from "./providers/elevenLabsClient.js";
import { geminiTtsClient } from "./providers/geminiTtsClient.js";

const elevenLabsVoiceByArchetype = (archetype: PersonaArchetype): string | undefined => {
  if (archetype === "playful") return env.voicePlayful;
  if (archetype === "wise") return env.voiceWise;
  if (archetype === "adventurous") return env.voiceAdventurous;
  if (archetype === "inventor") return env.voiceInventor;
  return undefined;
};

const geminiVoiceByArchetype = (archetype: PersonaArchetype): string => {
  if (archetype === "playful") return env.geminiTtsVoicePlayful;
  if (archetype === "wise") return env.geminiTtsVoiceWise;
  if (archetype === "adventurous") return env.geminiTtsVoiceAdventurous;
  if (archetype === "inventor") return env.geminiTtsVoiceInventor;
  return env.geminiTtsVoiceDefault;
};

const providerOrder = (): Array<"gemini" | "elevenlabs"> => {
  if (env.voiceProvider === "elevenlabs") {
    return ["elevenlabs", "gemini"];
  }

  if (env.voiceProvider === "auto") {
    return ["gemini", "elevenlabs"];
  }

  return ["gemini", "elevenlabs"];
};

export class VoiceService {
  private readonly audioDir = path.resolve(env.dataDir, "audio");

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.audioDir, { recursive: true });
  }

  async synthesizeToAsset(input: {
    text: string;
    archetype: PersonaArchetype;
  }): Promise<{ audioId: string; streamUrl: string } | null> {
    await this.ensureDirs();

    let result: { audio: Buffer; contentType: string } | null = null;

    for (const provider of providerOrder()) {
      if (provider === "gemini") {
        result = await geminiTtsClient.synthesize({
          text: input.text,
          voiceName: geminiVoiceByArchetype(input.archetype),
        });
      } else {
        result = await elevenLabsClient.synthesize({
          text: input.text,
          voiceId: elevenLabsVoiceByArchetype(input.archetype),
        });
      }

      if (result) {
        break;
      }
    }

    if (!result) {
      return null;
    }

    const audioId = randomUUID();
    const extension = result.contentType.includes("mpeg")
      ? "mp3"
      : result.contentType.includes("wav")
        ? "wav"
        : "bin";
    const filePath = path.resolve(this.audioDir, `${audioId}.${extension}`);

    await fs.writeFile(filePath, result.audio);
    store.voiceAssets.set(audioId, {
      audioId,
      contentType: result.contentType,
      filePath,
      createdAt: new Date().toISOString(),
    });

    return {
      audioId,
      streamUrl: `${env.apiBaseUrl}/v1/audio/${audioId}`,
    };
  }

  resolveAudio(audioId: string): { filePath: string; contentType: string } | null {
    const voiceAsset = store.voiceAssets.get(audioId);
    if (!voiceAsset) {
      return null;
    }

    return {
      filePath: voiceAsset.filePath,
      contentType: voiceAsset.contentType,
    };
  }
}

export const voiceService = new VoiceService();
