export type EntityCategory =
  | "landmark"
  | "nature"
  | "statue"
  | "electronics"
  | "science"
  | "animal"
  | "other";

export type RoleplayMode = "as_object" | "as_character";

export type CanonicalEntity = {
  entityId: string;
  label: string;
  category: EntityCategory;
  confidence: number;
  detectedLabel?: string;
  researchSubject: string;
  roleplayName: string;
  roleplayMode: RoleplayMode;
};

export type FactItem = {
  claim: string;
  confidence: number;
  sourceUrls: string[];
  freshnessDate: string;
};

export type PersonaArchetype = "playful" | "wise" | "adventurous" | "inventor";

export type PersonaProfile = {
  voiceArchetype: PersonaArchetype;
  speakingStyle: string;
  hookTemplateId: string;
};

export type SafetyVerdict = "allow" | "transform" | "block";

export type ModerationResult = {
  verdict: SafetyVerdict;
  reasons: string[];
  transformedText?: string;
};

export type AnalysisStatus = "queued" | "processing" | "ready" | "failed";

export type AnalysisResult = {
  analysisId: string;
  sessionId: string;
  imageUrl: string;
  status: AnalysisStatus;
  createdAt: string;
  updatedAt: string;
  entity?: CanonicalEntity;
  hookText?: string;
  firstReplyText?: string;
  firstReplyAudioStreamUrl?: string;
  safetyStatus?: SafetyVerdict;
  conversationId?: string;
  error?: string;
};

export type SessionInfo = {
  sessionId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  locale: string;
  userAgent: string;
  deviceCapabilities?: {
    speechRecognition: boolean;
    mediaRecorder: boolean;
  };
};

export type FactPack = {
  entity: CanonicalEntity;
  facts: FactItem[];
  summary: string;
  generatedAt: string;
};

export type ConversationTurn = {
  turnId: string;
  userInput: string;
  assistantText: string;
  safetyVerdict: SafetyVerdict;
  createdAt: string;
};

export type ConversationState = {
  conversationId: string;
  sessionId: string;
  entity: CanonicalEntity;
  factPack: FactPack;
  persona: PersonaProfile;
  usedFactIndexes: Set<number>;
  turns: ConversationTurn[];
  createdAt: string;
  updatedAt: string;
};

export type UploadTarget = {
  uploadId: string;
  token: string;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
  filePath?: string;
  mimeType?: string;
  imageUrl?: string;
};

export type VoiceAsset = {
  audioId: string;
  contentType: string;
  filePath: string;
  createdAt: string;
};

export type FeedbackSignal = "helpful" | "boring" | "unsafe" | "incorrect";

export type FeedbackItem = {
  sessionId: string;
  turnId: string;
  signal: FeedbackSignal;
  createdAt: string;
};

export type AnalyticsEventName =
  | "session_created"
  | "upload_started"
  | "analysis_requested"
  | "first_audio_ready"
  | "chat_turn"
  | "feedback_submitted";

export type AnalyticsEvent = {
  eventName: AnalyticsEventName;
  sessionId: string;
  createdAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type PolicyConfig = {
  blockedTopics: string[];
  allowedSourceDomains: string[];
  maxReplySeconds: number;
  minFactConfidence: number;
};

export type IncidentItem = {
  incidentId: string;
  sessionId: string;
  createdAt: string;
  reason: string;
  payload: string;
};
