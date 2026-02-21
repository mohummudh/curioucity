import type {
  AnalysisResult,
  AnalyticsEvent,
  ConversationState,
  FeedbackItem,
  IncidentItem,
  PolicyConfig,
  SessionInfo,
  UploadTarget,
  VoiceAsset,
} from "../types/domain.js";

export class InMemoryStore {
  public readonly sessions = new Map<string, SessionInfo>();
  public readonly uploads = new Map<string, UploadTarget>();
  public readonly analyses = new Map<string, AnalysisResult>();
  public readonly factCache = new Map<string, { value: unknown; expiresAt: string }>();
  public readonly conversations = new Map<string, ConversationState>();
  public readonly voiceAssets = new Map<string, VoiceAsset>();
  public readonly feedback = new Array<FeedbackItem>();
  public readonly analytics = new Array<AnalyticsEvent>();
  public readonly incidents = new Array<IncidentItem>();

  public policy: PolicyConfig = {
    blockedTopics: [
      "violence",
      "sexual",
      "self-harm",
      "illegal instructions",
      "personal data",
      "hate speech",
    ],
    allowedSourceDomains: [
      "nasa.gov",
      "nationalgeographic.com",
      "smithsonianmag.com",
      "britannica.com",
      "wikipedia.org",
      "noaa.gov",
      "usgs.gov",
    ],
    maxReplySeconds: 18,
    minFactConfidence: 0.55,
  };
}

export const store = new InMemoryStore();
