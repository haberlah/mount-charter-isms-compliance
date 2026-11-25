import { Router } from "express";
import multer from "multer";
import { buildWorkspaceBackupZip, restoreWorkspaceFromBackupZip } from "../backup";
import { listCollectors, runCollector } from "../collectors";
import {
  buildAuditorBundleZip,
  buildDeadlinesIcs,
  buildExecutiveReportHtml,
} from "../report-generator";
import { getParam, resolveWorkspaceId } from "./helpers";

export const operationsRouter = Router();

const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

// ─── Executive HTML/PDF Report, Auditor Evidence Bundle ZIP & .ics Calendar ──

operationsRouter.get("/exports/executive-report.html", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const html = buildExecutiveReportHtml(workspaceId);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.query.download === "1") {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="mount-charter-executive-report.html"',
    );
  }
  res.send(html);
});

operationsRouter.get("/exports/auditor-bundle.zip", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const zipBuf = buildAuditorBundleZip(workspaceId);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="mount-charter-auditor-evidence-bundle.zip"',
  );
  res.send(zipBuf);
});

operationsRouter.get("/exports/deadlines.ics", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ics = buildDeadlinesIcs(workspaceId);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="mount-charter-compliance-deadlines.ics"',
  );
  res.send(ics);
});

// ─── Portable Workspace Backup & Restore ─────────────────────────────────────

operationsRouter.get("/workspaces/:id/backup.zip", (req, res) => {
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid workspace id" });
  }
  try {
    const zipBuf = buildWorkspaceBackupZip(id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="mount-charter-workspace-backup-${date}.zip"`,
    );
    res.send(zipBuf);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Backup failed" });
  }
});

operationsRouter.post("/workspaces/restore", backupUpload.single("backup"), (req, res) => {
  if (!req.file?.buffer) {
    return res
      .status(400)
      .json({ error: "Upload a Mount Charter backup .zip file under field 'backup'" });
  }
  try {
    const result = restoreWorkspaceFromBackupZip(req.file.buffer);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Backup restore failed" });
  }
});

// ─── Opt-In Local Read-Only CLI Evidence Collectors ──────────────────────────

operationsRouter.get("/collectors", (_req, res) => {
  res.json(listCollectors());
});

operationsRouter.post("/collectors/:id/run", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const collectorId = getParam(req.params.id);
  try {
    const result = await runCollector(workspaceId, collectorId);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Collector run failed" });
  }
});
