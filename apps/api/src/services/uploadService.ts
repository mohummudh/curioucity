import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { store } from "../stores/inMemoryStore.js";
import type { UploadTarget } from "../types/domain.js";

export class UploadService {
  private readonly uploadDir = path.resolve(env.dataDir, "uploads");

  async ensureDirs(): Promise<void> {
    await fs.mkdir(this.uploadDir, { recursive: true });
  }

  async createUploadTarget(sessionId: string): Promise<{
    uploadId: string;
    uploadUrl: string;
    imageUrl: string;
    expiresAt: string;
  }> {
    await this.ensureDirs();

    const uploadId = randomUUID();
    const token = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + env.uploadTtlMinutes * 60 * 1000).toISOString();

    const target: UploadTarget = {
      uploadId,
      token,
      sessionId,
      createdAt: createdAt.toISOString(),
      expiresAt,
      consumed: false,
    };

    store.uploads.set(uploadId, target);

    return {
      uploadId,
      uploadUrl: `${env.apiBaseUrl}/v1/upload/${uploadId}?token=${token}`,
      imageUrl: `${env.apiBaseUrl}/v1/media/${uploadId}`,
      expiresAt,
    };
  }

  getUpload(uploadId: string): UploadTarget | null {
    return store.uploads.get(uploadId) ?? null;
  }

  async acceptUpload(uploadId: string, token: string, body: Buffer, mimeType: string): Promise<UploadTarget> {
    const target = store.uploads.get(uploadId);
    if (!target) {
      throw new Error("Unknown upload target");
    }

    if (target.token !== token) {
      throw new Error("Invalid upload token");
    }

    if (Date.parse(target.expiresAt) < Date.now()) {
      throw new Error("Upload target expired");
    }

    if (target.consumed) {
      throw new Error("Upload already consumed");
    }

    const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const filePath = path.resolve(this.uploadDir, `${uploadId}.${extension}`);
    await fs.writeFile(filePath, body);

    const updated: UploadTarget = {
      ...target,
      consumed: true,
      filePath,
      mimeType,
      imageUrl: `${env.apiBaseUrl}/v1/media/${uploadId}`,
    };

    store.uploads.set(uploadId, updated);
    return updated;
  }

  resolveImage(uploadId: string): UploadTarget | null {
    const target = store.uploads.get(uploadId);
    if (!target || !target.filePath) {
      return null;
    }

    return target;
  }
}

export const uploadService = new UploadService();
