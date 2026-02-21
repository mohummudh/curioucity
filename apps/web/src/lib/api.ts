import type { AnalysisResult, ChatTurnResult, SessionToken } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787";

const authHeaders = (session: SessionToken): HeadersInit => ({
  "x-session-id": session.sessionId,
  "x-session-token": session.token,
  Authorization: `Bearer ${session.token}`,
  "Content-Type": "application/json",
});

export const api = {
  async createSession(): Promise<SessionToken> {
    const response = await fetch(`${API_BASE_URL}/v1/session/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: navigator.language,
        user_agent: navigator.userAgent,
        device_capabilities: {
          speechRecognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
          mediaRecorder: Boolean(window.MediaRecorder),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Session creation failed (${response.status})`);
    }

    const payload = (await response.json()) as { session_id: string; token: string; expires_at: string };
    return {
      sessionId: payload.session_id,
      token: payload.token,
      expiresAt: payload.expires_at,
    };
  },

  async createUploadTarget(session: SessionToken): Promise<{ uploadId: string; uploadUrl: string; imageUrl: string }> {
    const response = await fetch(`${API_BASE_URL}/v1/photo/upload-url`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ session_id: session.sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Upload URL request failed (${response.status})`);
    }

    const payload = (await response.json()) as { upload_id: string; upload_url: string; image_url: string };
    return {
      uploadId: payload.upload_id,
      uploadUrl: payload.upload_url,
      imageUrl: payload.image_url,
    };
  },

  async uploadImage(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: await file.arrayBuffer(),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Image upload failed (${response.status}): ${detail}`);
    }
  },

  async startAnalysis(session: SessionToken, imageUrl: string): Promise<{ analysisId: string; status: string }> {
    const response = await fetch(`${API_BASE_URL}/v1/photo/analyze`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ session_id: session.sessionId, image_url: imageUrl }),
    });

    if (!response.ok) {
      throw new Error(`Analysis start failed (${response.status})`);
    }

    const payload = (await response.json()) as { analysis_id: string; status: string };
    return {
      analysisId: payload.analysis_id,
      status: payload.status,
    };
  },

  async getAnalysis(session: SessionToken, analysisId: string): Promise<AnalysisResult> {
    const query = new URLSearchParams({ session_id: session.sessionId, token: session.token }).toString();
    const response = await fetch(`${API_BASE_URL}/v1/photo/analyze/${analysisId}?${query}`, {
      headers: authHeaders(session),
    });

    if (!response.ok) {
      throw new Error(`Analysis fetch failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      analysis_id: string;
      status: AnalysisResult["status"];
      entity?: AnalysisResult["entity"];
      hook_text?: string;
      first_reply_text?: string;
      first_reply_audio_stream_url?: string;
      safety_status?: AnalysisResult["safetyStatus"];
      conversation_id?: string;
      error?: string;
    };

    return {
      analysisId: payload.analysis_id,
      status: payload.status,
      entity: payload.entity,
      hookText: payload.hook_text,
      firstReplyText: payload.first_reply_text,
      firstReplyAudioStreamUrl: payload.first_reply_audio_stream_url,
      safetyStatus: payload.safety_status,
      conversationId: payload.conversation_id,
      error: payload.error,
    };
  },

  async chatTurn(input: {
    session: SessionToken;
    conversationId: string;
    text?: string;
    audioBlobUrl?: string;
  }): Promise<ChatTurnResult> {
    const response = await fetch(`${API_BASE_URL}/v1/chat/turn`, {
      method: "POST",
      headers: authHeaders(input.session),
      body: JSON.stringify({
        session_id: input.session.sessionId,
        conversation_id: input.conversationId,
        input_type: input.text ? "text" : "voice",
        text: input.text,
        audio_blob_url: input.audioBlobUrl,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Chat request failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as {
      turn_id: string;
      reply_text: string;
      reply_audio_stream_url?: string;
      followup_suggestions: string[];
      safety_verdict: ChatTurnResult["safetyVerdict"];
    };

    return {
      turnId: payload.turn_id,
      replyText: payload.reply_text,
      replyAudioStreamUrl: payload.reply_audio_stream_url,
      followupSuggestions: payload.followup_suggestions,
      safetyVerdict: payload.safety_verdict,
    };
  },

  async transcribeAudio(session: SessionToken, audioBlob: Blob): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/v1/speech/transcribe`, {
      method: "POST",
      headers: {
        "x-session-id": session.sessionId,
        "x-session-token": session.token,
        Authorization: `Bearer ${session.token}`,
        "Content-Type": audioBlob.type || "audio/webm",
      },
      body: await audioBlob.arrayBuffer(),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Audio transcription failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as { text: string };
    return payload.text;
  },

  async submitFeedback(input: {
    session: SessionToken;
    turnId: string;
    signal: "helpful" | "boring" | "unsafe" | "incorrect";
  }): Promise<void> {
    await fetch(`${API_BASE_URL}/v1/feedback`, {
      method: "POST",
      headers: authHeaders(input.session),
      body: JSON.stringify({
        session_id: input.session.sessionId,
        turn_id: input.turnId,
        signal: input.signal,
      }),
    });
  },

  async getAdminSnapshot(adminKey: string): Promise<{
    policy: unknown;
    voices: unknown;
    incidents: unknown;
    analytics: unknown;
  }> {
    const headers = {
      "x-admin-key": adminKey,
    };

    const [policy, voices, incidents, analytics] = await Promise.all([
      fetch(`${API_BASE_URL}/v1/admin/policy`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/v1/admin/voices`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/v1/admin/incidents`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/v1/admin/analytics`, { headers }).then((r) => r.json()),
    ]);

    return {
      policy,
      voices,
      incidents,
      analytics,
    };
  },
};
