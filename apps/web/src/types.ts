export type SessionToken = {
  sessionId: string;
  token: string;
  expiresAt: string;
};

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

export type AnalysisResult = {
  analysisId: string;
  status: "queued" | "processing" | "ready" | "failed";
  entity?: CanonicalEntity;
  hookText?: string;
  firstReplyText?: string;
  firstReplyAudioStreamUrl?: string;
  safetyStatus?: "allow" | "transform" | "block";
  conversationId?: string;
  error?: string;
};

export type ChatTurnResult = {
  turnId: string;
  replyText: string;
  replyAudioStreamUrl?: string;
  followupSuggestions: string[];
  safetyVerdict: "allow" | "transform" | "block";
};

export type Message = {
  id: string;
  role: "child" | "object";
  text: string;
  audioUrl?: string;
};
