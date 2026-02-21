export type EntityCategory =
  | "landmark"
  | "nature"
  | "statue"
  | "electronics"
  | "science"
  | "animal"
  | "other";

export type CanonicalEntity = {
  entityId: string;
  label: string;
  category: EntityCategory;
  confidence: number;
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

export type ConversationTurn = {
  turnId: string;
  userInput: string;
  assistantText: string;
  safetyVerdict: SafetyVerdict;
  createdAt: string;
};

export type FactPack = {
  entity: CanonicalEntity;
  facts: FactItem[];
  summary: string;
  generatedAt: string;
};

export type AnalysisStatus = "queued" | "processing" | "ready" | "failed";

export type AnalysisResult = {
  analysisId: string;
  status: AnalysisStatus;
  entity?: CanonicalEntity;
  hookText?: string;
  firstReplyText?: string;
  firstReplyAudioStreamUrl?: string;
  safetyStatus?: SafetyVerdict;
  error?: string;
};

export type SessionInfo = {
  sessionId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  locale: string;
  userAgent: string;
};

export type ModerationResult = {
  verdict: SafetyVerdict;
  reasons: string[];
  transformedText?: string;
};

export type VoiceAsset = {
  audioId: string;
  mimeType: string;
  createdAt: string;
};
