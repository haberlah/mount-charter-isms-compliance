import type { Request, Response } from "express";
import { storage } from "../storage";

export function resolveWorkspaceId(req: Request): number {
  const raw =
    (typeof req.headers["x-mount-charter-workspace"] === "string"
      ? req.headers["x-mount-charter-workspace"]
      : undefined) ||
    (typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined);
  if (raw) {
    const id = Number.parseInt(raw, 10);
    if (Number.isInteger(id) && id > 0) {
      const ws = storage.getWorkspace(id);
      if (ws && !ws.archivedAt) return ws.id;
    }
  }
  return storage.getDefaultWorkspace().id;
}

export function sendValidationError(res: Response, message: string, issues?: unknown): void {
  res.status(400).json({ error: message, issues });
}

export function parseIntParam(raw: string | string[] | undefined): number | null {
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (!val || !/^\d+$/.test(val)) return null;
  const n = Number.parseInt(val, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function getParam(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? raw[0] || "" : raw || "";
}
