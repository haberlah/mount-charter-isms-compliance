import fs from "node:fs";
import path from "node:path";
import {
  createEvidenceLinkSchema,
  evidenceTypeValues,
  updateDocumentSchema,
  updateEvidenceLinkSchema,
} from "@shared/schema";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { AIBudgetError, AIConfigurationError, analyseDocumentChunks } from "../ai";
import {
  ALLOWED_MIME_TYPES,
  EXTENSION_TO_MIME,
  getBlob,
  putBlob,
  validateMagicBytes,
} from "../blob-store";
import { getTempUploadsDir, MAX_UPLOAD_FILE_SIZE, MAX_UPLOAD_FILES } from "../config";
import { chunkText, extractText } from "../document-processor";
import { safeHttpUrl } from "../security";
import { storage } from "../storage";
import { getParam, parseIntParam, resolveWorkspaceId, sendValidationError } from "./helpers";

export const evidenceRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, getTempUploadsDir()),
    filename: (_req, file, cb) => {
      const safeExt = path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, "");
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE,
    files: MAX_UPLOAD_FILES,
  },
});

function resolveMimeType(file: Express.Multer.File): string | null {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) return file.mimetype;
  const ext = path.extname(file.originalname).toLowerCase();
  return EXTENSION_TO_MIME[ext] || null;
}

evidenceRouter.get("/documents", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.listDocuments(workspaceId));
});

evidenceRouter.get("/documents/stats", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.getDocumentStats(workspaceId));
});

evidenceRouter.post(
  "/documents/upload",
  upload.array("files", MAX_UPLOAD_FILES),
  async (req, res) => {
    const workspaceId = resolveWorkspaceId(req);
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return sendValidationError(res, "No files provided");
    }

    const controlNumber =
      typeof req.body?.controlNumber === "string" ? req.body.controlNumber.trim() : "";
    const evidenceTypeRaw =
      typeof req.body?.evidenceType === "string" ? req.body.evidenceType.trim() : "";
    const evidenceType = (evidenceTypeValues as readonly string[]).includes(evidenceTypeRaw)
      ? (evidenceTypeRaw as (typeof evidenceTypeValues)[number])
      : null;
    const documentDate =
      typeof req.body?.documentDate === "string" && req.body.documentDate.trim()
        ? req.body.documentDate.trim()
        : null;
    const description =
      typeof req.body?.description === "string" && req.body.description.trim()
        ? req.body.description.trim().slice(0, 2000)
        : null;

    let targetWorkspaceControlId: number | null = null;
    if (controlNumber) {
      const ctrl = storage.getControlByNumber(controlNumber);
      if (ctrl) {
        targetWorkspaceControlId = storage.ensureWorkspaceControl(workspaceId, ctrl.id).id;
      }
    }

    const created = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const file of files) {
      try {
        const mimeType = resolveMimeType(file);
        if (!mimeType) {
          errors.push({ filename: file.originalname, error: "Unsupported file type" });
          continue;
        }
        const buffer = fs.readFileSync(file.path);
        if (!validateMagicBytes(buffer, mimeType)) {
          errors.push({
            filename: file.originalname,
            error: "File content does not match declared file type",
          });
          continue;
        }

        const { blobKey, fileHash, fileSize } = putBlob(buffer);
        const existing = storage.findDocumentByHash(workspaceId, fileHash);
        if (existing) {
          if (targetWorkspaceControlId) {
            storage.linkDocumentToControl(workspaceId, existing.id, targetWorkspaceControlId);
          }
          created.push({ ...existing, deduplicated: true });
          continue;
        }

        let extractedText = "";
        let pageCount: number | null = null;
        let extractionStatus: "extracted" | "error" = "extracted";
        let extractionError: string | null = null;

        try {
          const resExtract = await extractText(buffer, mimeType);
          extractedText = resExtract.text;
          pageCount = resExtract.pageCount ?? null;
        } catch (err) {
          extractionStatus = "error";
          extractionError = err instanceof Error ? err.message : "Text extraction failed";
        }

        const chunks = extractedText ? chunkText(extractedText) : [];
        const defaultTitle = path.basename(file.originalname, path.extname(file.originalname));
        const customTitle =
          files.length === 1 && typeof req.body?.title === "string" && req.body.title.trim()
            ? req.body.title.trim().slice(0, 300)
            : defaultTitle;

        const doc = storage.createDocument({
          workspaceId,
          title: customTitle,
          originalFilename: file.originalname,
          blobKey,
          mimeType,
          fileSize,
          fileHash,
          documentDate,
          evidenceType,
          description,
          extractedText,
          extractionStatus,
          extractionError,
          pageCount,
          chunks,
        });

        if (targetWorkspaceControlId) {
          storage.linkDocumentToControl(workspaceId, doc.id, targetWorkspaceControlId);
        }
        created.push(doc);
      } finally {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // Temp file already cleaned up
        }
      }
    }

    if (created.length === 0 && errors.length > 0) {
      return res.status(400).json({ error: errors[0].error, errors });
    }
    res.status(201).json({ documents: created, errors });
  },
);

evidenceRouter.patch("/documents/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid document ID");
  const parsed = updateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid update");
  }
  const updated = storage.updateDocument(workspaceId, id, parsed.data);
  if (!updated) return res.status(404).json({ error: "Document not found" });
  res.json(updated);
});

evidenceRouter.get("/documents/:id/download", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid document ID");
  const doc = storage.getDocument(workspaceId, id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  const blob = getBlob(doc.blobKey);
  if (!blob) return res.status(404).json({ error: "Stored file missing from local blob store" });
  const safeName = doc.originalFilename.replace(/["\r\n]/g, "_");
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.send(blob);
});

evidenceRouter.get("/documents/:id/preview", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid document ID");
  const doc = storage.getDocument(workspaceId, id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  const blob = getBlob(doc.blobKey);
  if (!blob) return res.status(404).json({ error: "Stored file missing from local blob store" });
  const safeName = doc.originalFilename.replace(/["\r\n]/g, "_");
  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
  res.send(blob);
});

evidenceRouter.get("/documents/:id/chunks", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid document ID");
  const doc = storage.getDocument(workspaceId, id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json({
    document: doc,
    chunks: storage.getDocumentChunks(workspaceId, id),
  });
});

const syncDocControlsSchema = z.object({
  controlNumbers: z.array(z.string().trim().min(1).max(20)).max(120),
});

evidenceRouter.put("/documents/:id/controls", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid document ID");
  const parsed = syncDocControlsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid controls list");
  }
  const ok = storage.syncDocumentControlLinks(workspaceId, id, parsed.data.controlNumbers);
  if (!ok) return res.status(404).json({ error: "Document not found" });
  res.json({
    updated: true,
    document: storage.listDocuments(workspaceId).find((d) => d.id === id),
  });
});

evidenceRouter.delete("/documents/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid document ID");
  const ok = storage.deleteDocument(workspaceId, id);
  if (!ok) return res.status(404).json({ error: "Document not found" });
  res.json({ deleted: true });
});

evidenceRouter.post("/controls/:controlNumber/documents/link", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  if (!ctrl) return res.status(404).json({ error: "Control not found" });
  const docId = Number(req.body?.documentId);
  if (!Number.isInteger(docId) || docId <= 0) {
    return sendValidationError(res, "Valid documentId is required");
  }
  const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
  const linked = storage.linkDocumentToControl(workspaceId, docId, wc.id);
  if (!linked) return res.status(404).json({ error: "Document not found in this workspace" });
  res.status(201).json({ linked: true });
});

evidenceRouter.delete("/controls/:controlNumber/documents/:documentId", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  const docId = parseIntParam(req.params.documentId);
  if (!ctrl || !docId) return res.status(404).json({ error: "Control or document not found" });
  const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
  storage.unlinkDocumentFromControl(workspaceId, docId, wc.id);
  res.json({ unlinked: true });
});

evidenceRouter.post("/controls/:controlNumber/documents/:documentId/analyse", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const ctrl = storage.getControlByNumber(getParam(req.params.controlNumber));
  const docId = parseIntParam(req.params.documentId);
  if (!ctrl || !docId) return res.status(404).json({ error: "Control or document not found" });

  // Strict workspace scoping: getDocument enforces workspaceId match (P0 IDOR fix)
  const doc = storage.getDocument(workspaceId, docId);
  if (!doc) return res.status(404).json({ error: "Document not found in this workspace" });

  const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
  storage.linkDocumentToControl(workspaceId, doc.id, wc.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  const sendEvent = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    storage.setDocumentControlAnalysisStatus(workspaceId, doc.id, wc.id, "analysing");
    const chunks = storage.getDocumentChunks(workspaceId, doc.id);
    if (doc.mimeType.startsWith("image/") || chunks.length === 0) {
      storage.setDocumentControlAnalysisStatus(workspaceId, doc.id, wc.id, "error");
      sendEvent("error", {
        status: 422,
        error: doc.mimeType.startsWith("image/")
          ? "Image files are stored as visual evidence and cannot be text-analysed by Claude."
          : "This document has no extracted text to analyse. Check extraction status in Evidence Library.",
      });
      return;
    }
    const questions = ctrl.aiQuestionnaire?.questions || [];
    const profile = storage.getProfile(workspaceId);
    const tokensUsedToday = storage.getTokensUsedToday(workspaceId);

    const { matches, totalTokensUsed, model, truncatedChunks } = await analyseDocumentChunks({
      documentTitle: doc.title,
      evidenceType: doc.evidenceType,
      chunks,
      questions,
      profile,
      tokensUsedToday,
      signal: abortController.signal,
      onProgress: (p) => sendEvent("progress", p),
    });

    const saved = storage.replaceMatchesForDocumentControl(workspaceId, doc.id, wc.id, matches);
    storage.setDocumentControlAnalysisStatus(workspaceId, doc.id, wc.id, "analysed");
    storage.logAiInteraction({
      workspaceId,
      interactionType: "document_analysis",
      controlId: ctrl.id,
      inputSummary: `Analysed "${doc.title}" against ${ctrl.controlNumber}`,
      outputSummary: `${saved.length} question matches${truncatedChunks ? ` (${truncatedChunks} chunks capped)` : ""}`,
      modelUsed: model,
      tokensUsed: totalTokensUsed,
    });

    sendEvent("complete", { matches: saved, totalTokensUsed, model, truncatedChunks });
  } catch (err) {
    storage.setDocumentControlAnalysisStatus(workspaceId, doc.id, wc.id, "error");
    if (!abortController.signal.aborted) {
      const status =
        err instanceof AIConfigurationError ? 503 : err instanceof AIBudgetError ? 429 : 500;
      sendEvent("error", {
        status,
        error: err instanceof Error ? err.message : "Document analysis failed",
      });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// ─── AI Suggestion Review Queue ──────────────────────────────────────────────

evidenceRouter.get("/matches/pending", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.listPendingMatches(workspaceId));
});

const editMatchSchema = z.object({
  responseText: z.string().trim().min(1, "Response text cannot be empty").max(20000),
});

evidenceRouter.post("/matches/:id/accept", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid match ID");
  const result = storage.resolveMatch({ workspaceId, matchId: id, decision: "accept" });
  if (!result) return res.status(404).json({ error: "Match not found" });
  res.json(result);
});

evidenceRouter.post("/matches/:id/accept-edited", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid match ID");
  const parsed = editMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid response text");
  }
  const result = storage.resolveMatch({
    workspaceId,
    matchId: id,
    decision: "accept_edited",
    editedResponse: parsed.data.responseText,
  });
  if (!result) return res.status(404).json({ error: "Match not found" });
  res.json(result);
});

evidenceRouter.post("/matches/:id/dismiss", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid match ID");
  const result = storage.resolveMatch({ workspaceId, matchId: id, decision: "dismiss" });
  if (!result) return res.status(404).json({ error: "Match not found" });
  res.json(result);
});

// ─── External Evidence Links (with strict http/https URL validation) ─────────

evidenceRouter.get("/evidence-links", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.listEvidenceLinks(workspaceId));
});

evidenceRouter.post("/evidence-links", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = createEvidenceLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid evidence link",
      parsed.error.issues,
    );
  }

  let validatedUrl: string | null = null;
  if (parsed.data.url?.trim()) {
    validatedUrl = safeHttpUrl(parsed.data.url);
    if (!validatedUrl) {
      return sendValidationError(res, "URL must start with http:// or https://");
    }
  }

  let wcId: number | null = null;
  if (parsed.data.controlNumber) {
    const ctrl = storage.getControlByNumber(parsed.data.controlNumber);
    if (!ctrl) return res.status(404).json({ error: "Control not found" });
    wcId = storage.ensureWorkspaceControl(workspaceId, ctrl.id).id;
  }

  if (parsed.data.documentId) {
    const doc = storage.getDocument(workspaceId, parsed.data.documentId);
    if (!doc) return res.status(404).json({ error: "Document not found in this workspace" });
  }

  const link = storage.createEvidenceLink({
    workspaceId,
    workspaceControlId: wcId,
    questionId: parsed.data.questionId ?? null,
    testRunId: parsed.data.testRunId ?? null,
    title: parsed.data.title,
    url: validatedUrl,
    evidenceType: parsed.data.evidenceType ?? null,
    description: parsed.data.description ?? null,
    documentId: parsed.data.documentId ?? null,
  });
  res.status(201).json(link);
});

evidenceRouter.patch("/evidence-links/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid evidence link ID");
  const parsed = updateEvidenceLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid evidence link update",
    );
  }
  let validatedUrl: string | null | undefined;
  if (parsed.data.url !== undefined) {
    if (parsed.data.url?.trim()) {
      validatedUrl = safeHttpUrl(parsed.data.url);
      if (!validatedUrl) {
        return sendValidationError(res, "URL must start with http:// or https://");
      }
    } else {
      validatedUrl = null;
    }
  }
  const updated = storage.updateEvidenceLink(workspaceId, id, {
    title: parsed.data.title,
    url: validatedUrl,
    evidenceType: parsed.data.evidenceType,
    description: parsed.data.description,
  });
  if (!updated) return res.status(404).json({ error: "Evidence link not found" });
  res.json(updated);
});

evidenceRouter.delete("/evidence-links/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = parseIntParam(req.params.id);
  if (!id) return sendValidationError(res, "Invalid evidence link ID");
  const ok = storage.deleteEvidenceLink(workspaceId, id);
  if (!ok) return res.status(404).json({ error: "Evidence link not found" });
  res.json({ deleted: true });
});
