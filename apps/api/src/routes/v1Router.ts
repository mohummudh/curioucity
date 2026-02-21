import fs from "node:fs/promises";
import express from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireSession } from "../middleware/sessionAuth.js";
import { adminService } from "../services/adminService.js";
import { analysisService } from "../services/analysisService.js";
import { analyticsService } from "../services/analyticsService.js";
import { conversationService } from "../services/conversationService.js";
import { ingestionService } from "../services/ingestionService.js";
import { sessionService } from "../services/sessionService.js";
import { speechService } from "../services/speechService.js";
import { uploadService } from "../services/uploadService.js";
import { voiceService } from "../services/voiceService.js";
import { store } from "../stores/inMemoryStore.js";
import type { FeedbackSignal } from "../types/domain.js";

export const v1Router = express.Router();

const sessionCreateSchema = z.object({
  locale: z.string().optional(),
  user_agent: z.string().optional(),
  device_capabilities: z
    .object({
      speechRecognition: z.boolean(),
      mediaRecorder: z.boolean(),
    })
    .optional(),
});

const photoAnalyzeSchema = z.object({
  session_id: z.string().uuid(),
  image_url: z.string().url(),
});

const chatTurnSchema = z.object({
  session_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  input_type: z.enum(["voice", "text"]),
  text: z.string().optional(),
  audio_blob_url: z.string().url().optional(),
});

const feedbackSchema = z.object({
  session_id: z.string().uuid(),
  turn_id: z.string().uuid(),
  signal: z.enum(["helpful", "boring", "unsafe", "incorrect"]),
});

v1Router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "wondertalk-api", timestamp: new Date().toISOString() });
});

v1Router.post("/session/create", (req, res) => {
  const parsed = sessionCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const session = sessionService.createSession({
    locale: parsed.data.locale,
    userAgent: parsed.data.user_agent ?? req.headers["user-agent"] ?? "unknown",
    deviceCapabilities: parsed.data.device_capabilities,
  });

  analyticsService.track("session_created", session.sessionId, {
    locale: session.locale,
  });

  return res.status(201).json({
    session_id: session.sessionId,
    token: session.token,
    expires_at: session.expiresAt,
  });
});

v1Router.post("/session/rotate", (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const rotated = sessionService.rotateSessionToken(session.sessionId);
  if (!rotated) {
    return res.status(404).json({ error: "Session not found" });
  }

  return res.json({
    session_id: rotated.sessionId,
    token: rotated.token,
    expires_at: rotated.expiresAt,
  });
});

v1Router.post("/photo/upload-url", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const target = await uploadService.createUploadTarget(session.sessionId);
  analyticsService.track("upload_started", session.sessionId, { uploadId: target.uploadId });

  return res.status(201).json({
    upload_id: target.uploadId,
    upload_url: target.uploadUrl,
    image_url: target.imageUrl,
    expires_at: target.expiresAt,
  });
});

v1Router.put(
  "/upload/:uploadId",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: env.maxImageBytes }),
  async (req, res) => {
    const { uploadId } = req.params;
    const token = req.query.token;

    if (typeof token !== "string") {
      return res.status(400).json({ error: "token query param is required" });
    }

    const mimeType = req.headers["content-type"];
    if (typeof mimeType !== "string") {
      return res.status(400).json({ error: "Content-Type header is required" });
    }

    try {
      ingestionService.validateMimeType(mimeType);
      const body =
        Buffer.isBuffer(req.body) ? req.body : req.body ? Buffer.from(req.body as ArrayBuffer) : Buffer.alloc(0);
      ingestionService.validateSize(body.byteLength);

      await uploadService.acceptUpload(uploadId, token, body, mimeType);
      return res.status(200).json({ ok: true });
    } catch (error) {
      return res.status(400).json({ error: String(error) });
    }
  },
);

v1Router.get("/media/:uploadId", async (req, res) => {
  const item = uploadService.resolveImage(req.params.uploadId);
  if (!item?.filePath || !item.mimeType) {
    return res.status(404).json({ error: "Image not found" });
  }

  const file = await fs.readFile(item.filePath);
  res.setHeader("Content-Type", item.mimeType);
  return res.send(file);
});

v1Router.post("/photo/analyze", (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const parsed = photoAnalyzeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  if (parsed.data.session_id !== session.sessionId) {
    return res.status(403).json({ error: "session_id mismatch" });
  }

  const analysis = analysisService.createAnalysis({
    sessionId: parsed.data.session_id,
    imageUrl: parsed.data.image_url,
  });

  return res.status(202).json({ analysis_id: analysis.analysisId, status: analysis.status });
});

v1Router.get("/photo/analyze/:analysisId", (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const analysis = analysisService.getAnalysis(req.params.analysisId);
  if (!analysis) {
    return res.status(404).json({ error: "analysis not found" });
  }

  if (analysis.sessionId !== session.sessionId) {
    return res.status(403).json({ error: "analysis/session mismatch" });
  }

  return res.json({
    analysis_id: analysis.analysisId,
    status: analysis.status,
    entity: analysis.entity,
    hook_text: analysis.hookText,
    first_reply_text: analysis.firstReplyText,
    first_reply_audio_stream_url: analysis.firstReplyAudioStreamUrl,
    safety_status: analysis.safetyStatus,
    conversation_id: analysis.conversationId,
    error: analysis.error,
  });
});

v1Router.post("/chat/turn", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const parsed = chatTurnSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  if (parsed.data.session_id !== session.sessionId) {
    return res.status(403).json({ error: "session_id mismatch" });
  }

  try {
    const result = await conversationService.chatTurn({
      sessionId: parsed.data.session_id,
      conversationId: parsed.data.conversation_id,
      text: parsed.data.input_type === "text" ? parsed.data.text : undefined,
      audioBlobUrl: parsed.data.input_type === "voice" ? parsed.data.audio_blob_url : undefined,
    });

    return res.status(200).json({
      reply_text: result.turn.assistantText,
      reply_audio_stream_url: result.replyAudioStreamUrl,
      followup_suggestions: result.followupSuggestions,
      turn_id: result.turn.turnId,
      safety_verdict: result.turn.safetyVerdict,
    });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

v1Router.post("/speech/transcribe", express.raw({ type: ["audio/webm", "audio/wav", "audio/mpeg"], limit: "8mb" }), async (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const mimeType = req.headers["content-type"];
  if (typeof mimeType !== "string") {
    return res.status(400).json({ error: "Content-Type is required" });
  }

  const body =
    Buffer.isBuffer(req.body) ? req.body : req.body ? Buffer.from(req.body as ArrayBuffer) : Buffer.alloc(0);
  const text = await speechService.transcribeBuffer(body, mimeType);

  if (!text) {
    return res.status(422).json({ error: "Unable to transcribe audio" });
  }

  return res.json({ text });
});

v1Router.get("/audio/:audioId", async (req, res) => {
  const audio = voiceService.resolveAudio(req.params.audioId);
  if (!audio) {
    return res.status(404).json({ error: "audio not found" });
  }

  const file = await fs.readFile(audio.filePath);
  res.setHeader("Content-Type", audio.contentType);
  res.setHeader("Cache-Control", "public, max-age=300");
  return res.send(file);
});

v1Router.post("/feedback", (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const parsed = feedbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  if (parsed.data.session_id !== session.sessionId) {
    return res.status(403).json({ error: "session_id mismatch" });
  }

  const signal = parsed.data.signal as FeedbackSignal;
  store.feedback.push({
    sessionId: parsed.data.session_id,
    turnId: parsed.data.turn_id,
    signal,
    createdAt: new Date().toISOString(),
  });

  analyticsService.track("feedback_submitted", parsed.data.session_id, { signal });

  return res.status(202).json({ ok: true });
});

v1Router.get("/admin/policy", (req, res) => {
  if (req.headers["x-admin-key"] !== env.adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json(adminService.getPolicy());
});

v1Router.put("/admin/policy", (req, res) => {
  if (req.headers["x-admin-key"] !== env.adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const schema = z.object({
    blockedTopics: z.array(z.string()).optional(),
    allowedSourceDomains: z.array(z.string()).optional(),
    maxReplySeconds: z.number().min(5).max(40).optional(),
    minFactConfidence: z.number().min(0).max(1).optional(),
  });

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  return res.json(adminService.updatePolicy(parsed.data));
});

v1Router.get("/admin/voices", (req, res) => {
  if (req.headers["x-admin-key"] !== env.adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json(adminService.getVoices());
});

v1Router.get("/admin/incidents", (req, res) => {
  if (req.headers["x-admin-key"] !== env.adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json(adminService.getIncidents());
});

v1Router.get("/admin/analytics", (req, res) => {
  if (req.headers["x-admin-key"] !== env.adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.json(analyticsService.getDashboard());
});
