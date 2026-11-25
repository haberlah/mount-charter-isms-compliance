import {
  createActionItemSchema,
  createWorkspaceSchema,
  updateActionItemSchema,
  updateWorkspaceSchema,
} from "@shared/schema";
import { Router } from "express";
import { storage } from "../storage";
import { parseIntParam, resolveWorkspaceId, sendValidationError } from "./helpers";

export const workspacesRouter = Router();

workspacesRouter.get("/workspaces", (_req, res) => {
  res.json({
    workspaces: storage.listWorkspaces(false),
    archivedWorkspaces: storage.listWorkspaces(true).filter((w) => w.archivedAt != null),
  });
});

workspacesRouter.post("/workspaces", (req, res) => {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid workspace",
      parsed.error.issues,
    );
  }
  const ws = storage.createWorkspace(parsed.data.name);
  res.status(201).json(ws);
});

workspacesRouter.patch("/workspaces/:id", (req, res) => {
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid workspace ID");
  const parsed = updateWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid workspace name");
  }
  const ws = storage.renameWorkspace(id, parsed.data.name);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  res.json(ws);
});

workspacesRouter.post("/workspaces/:id/archive", (req, res) => {
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid workspace ID");
  const ws = storage.archiveWorkspace(id);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  res.json({ archived: ws, activeWorkspaces: storage.listWorkspaces(false) });
});

workspacesRouter.post("/workspaces/:id/restore", (req, res) => {
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid workspace ID");
  const ws = storage.restoreWorkspace(id);
  if (!ws) return res.status(404).json({ error: "Workspace not found" });
  res.json({ restored: ws, activeWorkspaces: storage.listWorkspaces(false) });
});

workspacesRouter.get("/dashboard", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.getDashboardStats(workspaceId));
});

workspacesRouter.get("/action-items", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.listActionItems(workspaceId));
});

workspacesRouter.post("/action-items", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = createActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid action item");
  }
  res.status(201).json(storage.createActionItem(workspaceId, parsed.data.title));
});

workspacesRouter.patch("/action-items/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid action item ID");
  const parsed = updateActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid update");
  }
  const updated = storage.updateActionItem(workspaceId, id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Action item not found" });
  res.json(updated);
});

workspacesRouter.delete("/action-items/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid action item ID");
  const deleted = storage.deleteActionItem(workspaceId, id);
  if (!deleted) return res.status(404).json({ error: "Action item not found" });
  res.json({ deleted: true });
});
