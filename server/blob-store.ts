import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getBlobsDir } from "./config";

export const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
]);

export const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/**
 * Verify file magic bytes match the declared MIME type to prevent spoofed uploads.
 */
export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length === 0) return false;
  switch (mimeType) {
    case "application/pdf":
      return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // OOXML documents are ZIP archives starting with PK\x03\x04
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
      );
    case "image/png":
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "text/plain":
    case "text/markdown":
    case "text/csv": {
      // Reject binary files containing NUL bytes in the first 4 KB
      const sample = buffer.subarray(0, Math.min(4096, buffer.length));
      return !sample.includes(0x00);
    }
    default:
      return false;
  }
}

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function blobPathForHash(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("Invalid content-addressed blob key");
  }
  const shard = sha256.slice(0, 2);
  const shardDir = path.join(getBlobsDir(), shard);
  fs.mkdirSync(shardDir, { recursive: true, mode: 0o700 });
  return path.join(shardDir, sha256);
}

/**
 * Atomically persist a buffer into the content-addressed local blob store
 * using temp-file + fsync + rename with 0o600 permissions.
 */
export function putBlob(buffer: Buffer): { blobKey: string; fileHash: string; fileSize: number } {
  const fileHash = computeSha256(buffer);
  const destPath = blobPathForHash(fileHash);
  if (!fs.existsSync(destPath)) {
    const tmpPath = `${destPath}.${randomBytes(6).toString("hex")}.tmp`;
    const fd = fs.openSync(tmpPath, "wx", 0o600);
    try {
      fs.writeSync(fd, buffer);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, destPath);
    try {
      fs.chmodSync(destPath, 0o600);
    } catch {
      // Best-effort
    }
  }
  return {
    blobKey: `${fileHash.slice(0, 2)}/${fileHash}`,
    fileHash,
    fileSize: buffer.length,
  };
}

export function getBlob(blobKey: string): Buffer | null {
  const parts = blobKey.split("/");
  if (parts.length !== 2 || !/^[a-f0-9]{2}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) {
    throw new Error("Invalid blob key");
  }
  const fullPath = path.join(getBlobsDir(), parts[0], parts[1]);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

export function deleteBlobIfUnreferenced(blobKey: string, remainingRefCount: number): void {
  if (remainingRefCount > 0) return;
  const parts = blobKey.split("/");
  if (parts.length !== 2 || !/^[a-f0-9]{2}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) {
    return;
  }
  const fullPath = path.join(getBlobsDir(), parts[0], parts[1]);
  try {
    fs.unlinkSync(fullPath);
  } catch {
    // Already deleted
  }
}
