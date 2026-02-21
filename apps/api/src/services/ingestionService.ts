import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../config/env.js";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export class IngestionService {
  validateMimeType(mimeType: string): void {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error("Unsupported image type");
    }
  }

  validateSize(bytes: number): void {
    if (bytes <= 0 || bytes > env.maxImageBytes) {
      throw new Error(`Image must be <= ${env.maxImageBytes} bytes`);
    }
  }

  async preprocessImage(filePath: string): Promise<string> {
    const normalizedPath = filePath.replace(/\.(png|webp|jpg|jpeg)$/i, "") + "-normalized.jpg";

    const imageBuffer = await fs.readFile(filePath);
    this.validateSize(imageBuffer.byteLength);

    const normalized = await sharp(imageBuffer)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    await fs.writeFile(normalizedPath, normalized);
    return path.resolve(normalizedPath);
  }

  // Placeholder hook for malware scanners in production deployment.
  async malwareScan(_filePath: string): Promise<void> {
    return;
  }
}

export const ingestionService = new IngestionService();
