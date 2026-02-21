import path from "node:path";

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const voiceProvider = (() => {
  const value = (process.env.VOICE_PROVIDER ?? "gemini").toLowerCase();
  if (value === "gemini" || value === "elevenlabs" || value === "auto") {
    return value;
  }

  return "gemini";
})();

export const env = {
  port: Number(process.env.PORT ?? 8787),
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:8787",
  webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:5173",
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 60),
  uploadTtlMinutes: Number(process.env.UPLOAD_TTL_MINUTES ?? 10),
  factCacheTtlMinutes: Number(process.env.FACT_CACHE_TTL_MINUTES ?? 1440),
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES ?? 8 * 1024 * 1024),
  geminiRequestTimeoutMs: Number(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? 6000),
  voiceRequestTimeoutMs: Number(process.env.VOICE_REQUEST_TIMEOUT_MS ?? 6000),
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  geminiTtsModel: process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts",
  geminiTtsFallbackModel: process.env.GEMINI_TTS_FALLBACK_MODEL ?? "gemini-2.5-pro-preview-tts",
  geminiTtsVoiceDefault: process.env.GEMINI_TTS_VOICE_DEFAULT ?? "Leda",
  geminiTtsVoicePlayful: process.env.GEMINI_TTS_VOICE_PLAYFUL ?? "Leda",
  geminiTtsVoiceWise: process.env.GEMINI_TTS_VOICE_WISE ?? "Kore",
  geminiTtsVoiceAdventurous: process.env.GEMINI_TTS_VOICE_ADVENTUROUS ?? "Aoede",
  geminiTtsVoiceInventor: process.env.GEMINI_TTS_VOICE_INVENTOR ?? "Orus",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
  elevenLabsModel: process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5",
  defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL",
  voicePlayful: process.env.ELEVENLABS_VOICE_PLAYFUL,
  voiceWise: process.env.ELEVENLABS_VOICE_WISE,
  voiceAdventurous: process.env.ELEVENLABS_VOICE_ADVENTUROUS,
  voiceInventor: process.env.ELEVENLABS_VOICE_INVENTOR,
  voiceProvider,
  strictSafety: bool(process.env.STRICT_SAFETY, true),
  adminKey: process.env.ADMIN_KEY ?? "parent-mode",
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
};
