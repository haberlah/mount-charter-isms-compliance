import { Router } from "express";
import { z } from "zod";
import {
  analyseVendorAssurancePack,
  draftSoaJustifications,
  redlinePolicyAgainstReality,
  runDeterministicAuditScan,
  runMockLeadAuditor,
} from "../agent-runtime";
import { AIBudgetError, AIConfigurationError } from "../ai-provider";
import { parseIntParam, resolveWorkspaceId, sendValidationError } from "./helpers";

export const agentRouter = Router();

// Zero-token deterministic pre-scan (instant)
agentRouter.get("/agent/audit-prescan", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json({ checks: runDeterministicAuditScan(workspaceId) });
});

// Option B: Hostile Mock Stage 1 / Stage 2 Lead Auditor (SSE)
agentRouter.post("/agent/mock-auditor", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const stageProposals = req.body?.stageProposals !== false;

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
    const dossier = await runMockLeadAuditor({
      workspaceId,
      stageProposals,
      signal: abortController.signal,
      onProgress: (p) => sendEvent("progress", p),
    });
    sendEvent("complete", dossier);
  } catch (err) {
    if (!abortController.signal.aborted) {
      const status =
        err instanceof AIConfigurationError ? 503 : err instanceof AIBudgetError ? 429 : 500;
      sendEvent("error", {
        status,
        error: err instanceof Error ? err.message : "Mock Lead Auditor run failed",
      });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

// Option C1: Grounded SoA Clause 6.1.3(d) Inclusion Justification Drafter
const soaDraftSchema = z.object({
  controlNumbers: z.array(z.string().trim().min(1).max(20)).max(25).optional(),
});

agentRouter.post("/agent/soa-justifications", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = soaDraftSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error.issues[0]?.message || "Invalid request");
  }
  try {
    const out = await draftSoaJustifications({
      workspaceId,
      controlNumbers: parsed.data.controlNumbers,
    });
    res.json(out);
  } catch (err) {
    if (err instanceof AIConfigurationError) return res.status(503).json({ error: err.message });
    if (err instanceof AIBudgetError) return res.status(429).json({ error: err.message });
    res.status(502).json({
      error: err instanceof Error ? err.message : "SoA justification drafting failed",
    });
  }
});

// Option C2: Living Policy Redliner against workspace operational reality
agentRouter.post("/agent/policies/:policyId/redline", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const policyId = parseIntParam(req.params.policyId);
  if (!policyId) return sendValidationError(res, "Invalid policy ID");
  try {
    const out = await redlinePolicyAgainstReality({ workspaceId, policyId });
    res.json(out);
  } catch (err) {
    if (err instanceof AIConfigurationError) return res.status(503).json({ error: err.message });
    if (err instanceof AIBudgetError) return res.status(429).json({ error: err.message });
    res.status(502).json({
      error: err instanceof Error ? err.message : "Policy redline failed",
    });
  }
});

// Option D: Vendor / MSP SOC 2 & CPS 230 Assurance Pack Analyser
const vendorAnalyseSchema = z.object({
  documentId: z.number().int().positive(),
});

agentRouter.post("/agent/vendors/:vendorId/analyse-document", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const vendorId = parseIntParam(req.params.vendorId);
  if (!vendorId) return sendValidationError(res, "Invalid vendor ID");
  const parsed = vendorAnalyseSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, "Select a valid uploaded document to analyse.");
  }
  try {
    const out = await analyseVendorAssurancePack({
      workspaceId,
      vendorId,
      documentId: parsed.data.documentId,
    });
    res.json(out);
  } catch (err) {
    if (err instanceof AIConfigurationError) return res.status(503).json({ error: err.message });
    if (err instanceof AIBudgetError) return res.status(429).json({ error: err.message });
    res.status(502).json({
      error: err instanceof Error ? err.message : "Vendor assurance analysis failed",
    });
  }
});
