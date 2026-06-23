import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import type { ReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { notFound } from "./errors";

// Local-disk driver for development and Railway volumes. The S3 driver replaces
// these functions behind the same interface when STORAGE_DRIVER=s3.

const uploadsDir = path.resolve(env.UPLOADS_DIR);

export function getUploadsDir(): string {
  return uploadsDir;
}

export async function ensureUploadsDir(): Promise<void> {
  await mkdir(uploadsDir, { recursive: true });
}

export async function saveFile(
  buffer: Buffer,
  originalName: string,
): Promise<string> {
  const ext = path.extname(originalName).slice(0, 10).replace(/[^.\w]/g, "");
  const key = `${randomUUID()}${ext}`;
  await ensureUploadsDir();
  await writeFile(path.join(uploadsDir, key), buffer);
  return key;
}

export function fileStream(key: string): ReadStream {
  // Keys are server-generated UUIDs — reject anything else (path traversal).
  if (!/^[\w-]+(\.\w+)?$/.test(key)) throw notFound("File not found");
  const filePath = path.join(uploadsDir, key);
  if (!existsSync(filePath)) throw notFound("File not found");
  return createReadStream(filePath);
}

export function fileUrl(key: string | null | undefined): string | null {
  return key ? `/api/v1/files/${key}` : null;
}
