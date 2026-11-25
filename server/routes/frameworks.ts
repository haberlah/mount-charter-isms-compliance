import {
  createRequirementEvidenceSchema,
  updateFrameworkConfigSchema,
  updateRequirementAssessmentSchema,
} from "@shared/schema";
import { Router } from "express";
import { AIBudgetError, AIConfigurationError, assessFrameworkRequirement } from "../ai";
import { escapeCsvField } from "../csv";
import { safeHttpUrl } from "../security";
import { storage } from "../storage";
import { getParam, resolveWorkspaceId, sendValidationError } from "./helpers";

export const frameworksRouter = Router();

frameworksRouter.get("/frameworks", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  res.json(storage.listFrameworks(workspaceId));
});

frameworksRouter.get("/frameworks/:code", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const detail = storage.getFrameworkDetail(workspaceId, getParam(req.params.code));
  if (!detail) return res.status(404).json({ error: "Framework not found" });
  res.json(detail);
});

frameworksRouter.put("/frameworks/:code/config", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = updateFrameworkConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid framework configuration",
      parsed.error.issues,
    );
  }
  const updated = storage.updateWorkspaceFrameworkConfig(
    workspaceId,
    getParam(req.params.code),
    parsed.data,
  );
  if (!updated) return res.status(404).json({ error: "Framework not found" });
  res.json(updated);
});

frameworksRouter.patch("/frameworks/:code/requirements/:reqCode", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = updateRequirementAssessmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid requirement assessment",
      parsed.error.issues,
    );
  }
  const updated = storage.updateRequirementAssessment(
    workspaceId,
    getParam(req.params.code),
    getParam(req.params.reqCode),
    parsed.data,
  );
  if (!updated) return res.status(404).json({ error: "Framework requirement not found" });
  res.json(updated);
});

frameworksRouter.get("/frameworks/:code/requirements/:reqCode/history", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json(
    storage.listRequirementHistory(
      workspaceId,
      getParam(req.params.code),
      getParam(req.params.reqCode),
      limit,
    ),
  );
});

frameworksRouter.post("/frameworks/:code/requirements/:reqCode/evidence", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = createRequirementEvidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid requirement evidence payload",
      parsed.error.issues,
    );
  }

  let validatedUrl: string | null = null;
  if (parsed.data.url?.trim()) {
    validatedUrl = safeHttpUrl(parsed.data.url);
    if (!validatedUrl) {
      return sendValidationError(res, "Evidence URL must use http:// or https://");
    }
  }

  const created = storage.addRequirementEvidence({
    workspaceId,
    frameworkCode: getParam(req.params.code),
    reqCode: getParam(req.params.reqCode),
    documentId: parsed.data.documentId ?? null,
    title: parsed.data.title,
    url: validatedUrl,
    evidenceType: parsed.data.evidenceType ?? null,
  });
  if (!created) {
    return res
      .status(404)
      .json({ error: "Framework requirement or evidence library document not found" });
  }
  res.status(201).json(created);
});

frameworksRouter.delete("/frameworks/:code/requirements/:reqCode/evidence/:id", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const id = Number(getParam(req.params.id));
  if (!Number.isInteger(id) || id <= 0) {
    return sendValidationError(res, "Invalid evidence link id");
  }
  const deleted = storage.deleteRequirementEvidence(workspaceId, id);
  if (!deleted) return res.status(404).json({ error: "Requirement evidence link not found" });
  res.json({ ok: true });
});

frameworksRouter.post("/frameworks/:code/requirements/:reqCode/ai-assess", async (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const code = getParam(req.params.code);
  const reqCode = getParam(req.params.reqCode);
  const detail = storage.getFrameworkDetail(workspaceId, code);
  if (!detail) return res.status(404).json({ error: "Framework not found" });
  const requirement = detail.requirements.find((r) => r.reqCode === reqCode);
  if (!requirement) return res.status(404).json({ error: "Framework requirement not found" });

  // Gather extracted text excerpts from directly linked local evidence documents
  const evidenceExcerpts: Array<{ title: string; evidenceType: string | null; excerpt: string }> =
    [];
  for (const ev of requirement.evidenceLinks) {
    if (!ev.documentId) continue;
    const chunks = storage.getDocumentChunks(workspaceId, ev.documentId);
    if (chunks.length > 0) {
      evidenceExcerpts.push({
        title: ev.documentTitle || ev.title,
        evidenceType: ev.evidenceType,
        excerpt: chunks
          .slice(0, 3)
          .map((c) => c.content)
          .join("\n\n"),
      });
    }
  }

  try {
    const profile = storage.getProfile(workspaceId);
    const tokensUsedToday = storage.getTokensUsedToday(workspaceId);
    const { assessment, tokensUsed } = await assessFrameworkRequirement({
      framework: detail,
      requirement,
      evidenceExcerpts,
      profile,
      tokensUsedToday,
    });
    storage.logAiInteraction({
      workspaceId,
      interactionType: "framework_assessment",
      inputSummary: `${detail.shortName} ${requirement.reqCode}: ${requirement.title}`,
      outputSummary: `${assessment.suggestedStatus} (${Math.round(assessment.confidence * 100)}%)`,
      modelUsed: assessment.modelUsed,
      tokensUsed,
    });
    res.json(assessment);
  } catch (err) {
    if (err instanceof AIConfigurationError) {
      return res.status(503).json({ error: err.message });
    }
    if (err instanceof AIBudgetError) {
      return res.status(429).json({ error: err.message });
    }
    res.status(502).json({
      error: err instanceof Error ? err.message : "AI framework assessment failed",
    });
  }
});

function buildFrameworkCsv(
  workspaceId: number,
  code: string,
): { csv: string; filename: string } | null {
  const detail = storage.getFrameworkDetail(workspaceId, code);
  if (!detail) return null;

  if (code === "acsc_e8_2023") {
    const strategyLevel = new Map<string, string>();
    for (const s of detail.e8Strategies || []) {
      strategyLevel.set(s.strategy, s.achievedLevel);
    }
    const headers = [
      "Requirement Code",
      "Clause Ref",
      "Mitigation Strategy",
      "Maturity Level",
      "Title",
      "Status",
      "Strategy Achieved ML",
      "Overall Weakest-Link ML",
      "Target ML",
      "Linked ISO 27001 Controls",
      "Attached Evidence",
      "Owner",
      "Target Date",
      "Evidence Summary",
      "Notes",
      "Assessed At",
    ];
    const rows = detail.requirements.map((r) =>
      [
        r.reqCode,
        r.clauseRef || "",
        r.domain,
        r.levelOrCategory || "",
        r.title,
        r.assessment.status,
        strategyLevel.get(r.domain) || "ML0",
        detail.weakestLinkMaturity || "ML0",
        detail.targetLevel || "ML1",
        r.linkedControls.map((c) => `${c.controlNumber} (${c.coverage})`).join("; "),
        r.evidenceLinks.map((e) => e.title).join("; "),
        r.assessment.owner || "",
        r.assessment.targetDate || "",
        r.assessment.evidenceSummary || "",
        r.assessment.notes || "",
        r.assessment.assessedAt || "",
      ]
        .map(escapeCsvField)
        .join(","),
    );
    return {
      csv: [headers.map(escapeCsvField).join(","), ...rows].join("\n"),
      filename: "mount-charter-essential-eight-maturity.csv",
    };
  }

  const headers = [
    "Framework",
    "Instrument ID",
    "Requirement Code",
    "Clause / Section Ref",
    "Domain",
    "Title",
    "Category",
    "Lifecycle",
    "Statutory Deadline",
    "Status",
    "Linked ISO 27001 Controls",
    "Attached Evidence",
    "Owner",
    "Target Date",
    "Evidence Summary",
    "Notes",
    "Assessed At",
  ];

  const rows = detail.requirements.map((r) =>
    [
      detail.shortName,
      detail.instrumentId || "",
      r.reqCode,
      r.clauseRef || "",
      r.domain,
      r.title,
      r.levelOrCategory || "",
      r.isDraft ? "Draft (Not Yet Law)" : "In Force",
      r.deadlineDate || "",
      r.assessment.status,
      r.linkedControls.map((c) => `${c.controlNumber} (${c.coverage})`).join("; "),
      r.evidenceLinks.map((e) => e.title).join("; "),
      r.assessment.owner || "",
      r.assessment.targetDate || "",
      r.assessment.evidenceSummary || "",
      r.assessment.notes || "",
      r.assessment.assessedAt || "",
    ]
      .map(escapeCsvField)
      .join(","),
  );

  const safeSlug = code.replace(/[^a-z0-9_-]/gi, "-");
  const filename =
    code === "au_privacy_act"
      ? "mount-charter-privacy-act-readiness.csv"
      : `mount-charter-${safeSlug}-readiness.csv`;

  return {
    csv: [headers.map(escapeCsvField).join(","), ...rows].join("\n"),
    filename,
  };
}

frameworksRouter.get("/exports/framework/:code.csv", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const built = buildFrameworkCsv(workspaceId, getParam(req.params.code));
  if (!built) return res.status(404).json({ error: "Framework not found" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${built.filename}"`);
  res.send(built.csv);
});

frameworksRouter.get("/exports/essential-eight.csv", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const built = buildFrameworkCsv(workspaceId, "acsc_e8_2023");
  if (!built) return res.status(404).json({ error: "Essential Eight framework not available" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${built.filename}"`);
  res.send(built.csv);
});

frameworksRouter.get("/exports/privacy-act.csv", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const built = buildFrameworkCsv(workspaceId, "au_privacy_act");
  if (!built) return res.status(404).json({ error: "Privacy Act framework not available" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${built.filename}"`);
  res.send(built.csv);
});
