import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "Mount Charter";
export const KEYCHAIN_SERVICE = "mount-charter";
export const HOST = "127.0.0.1";
export const DEFAULT_PORT = 3852;

export function getPort(): number {
  const raw = process.env.MOUNT_CHARTER_PORT || process.env.PORT;
  if (!raw) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return DEFAULT_PORT;
  return parsed;
}

export function getDataDir(): string {
  const override = process.env.MOUNT_CHARTER_DATA_DIR?.trim();
  const dir = override
    ? path.resolve(override)
    : path.join(os.homedir(), "Library", "Application Support", "Mount Charter");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Best-effort on non-POSIX filesystems
  }
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), "mount-charter.sqlite");
}

export function getBlobsDir(): string {
  const dir = path.join(getDataDir(), "blobs");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function getTempUploadsDir(): string {
  const dir = path.join(getDataDir(), "tmp-uploads");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function getExportsDir(): string {
  const dir = path.join(os.homedir(), "Documents", "Mount Charter", "exports");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const DEFAULT_AI_PROVIDER = "auto" as const;
export const DEFAULT_AI_ROUTING_PRESET = "balanced" as const;
export const DEFAULT_SCREENING_MODEL = "auto";
export const DEFAULT_SYNTHESIS_MODEL = "auto";
export const DEFAULT_DAILY_TOKEN_BUDGET = 250_000;
export const DEFAULT_DAILY_COST_BUDGET_USD = 5.0;
export const DEFAULT_MAX_CHUNKS_PER_RUN = 25;
export const MAX_UPLOAD_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file
export const MAX_UPLOAD_FILES = 10;
