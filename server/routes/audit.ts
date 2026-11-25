import { createTestRunSchema } from "@shared/schema";
import { Router } from "express";
import { escapeCsvField } from "../csv";
import { safeHttpUrl } from "../security";
import { storage } from "../storage";
import { resolveWorkspaceId, sendValidationError } from "./helpers";

export const auditRouter = Router();

auditRouter.get("/test-runs", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const controlNumber =
    typeof req.query.controlNumber === "string" ? req.query.controlNumber : undefined;
  res.json(storage.listTestRuns(workspaceId, limit, { status, controlNumber, offset }));
});

auditRouter.post("/test-runs", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const parsed = createTestRunSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(
      res,
      parsed.error.issues[0]?.message || "Invalid test run payload",
      parsed.error.issues,
    );
  }

  const ctrl = storage.getControlByNumber(parsed.data.controlNumber);
  if (!ctrl) return res.status(404).json({ error: "Control not found" });

  // Validate any attached URLs before creating the immutable test run
  const preparedLinks: Array<{
    title: string;
    url: string | null;
    evidenceType: typeof parsed.data.evidenceLinks extends Array<infer U> | undefined
      ? U extends { evidenceType?: infer E }
        ? E
        : never
      : never;
    description: string | null;
    documentId: number | null;
  }> = [];

  for (const link of parsed.data.evidenceLinks || []) {
    let url: string | null = null;
    if (link.url?.trim()) {
      url = safeHttpUrl(link.url);
      if (!url) {
        return sendValidationError(res, `Invalid evidence URL for "${link.title}"`);
      }
    }
    if (link.documentId && !storage.getDocument(workspaceId, link.documentId)) {
      return res.status(404).json({ error: `Document ${link.documentId} not found in workspace` });
    }
    preparedLinks.push({
      title: link.title,
      url,
      evidenceType: link.evidenceType ?? null,
      description: link.description ?? null,
      documentId: link.documentId ?? null,
    });
  }

  const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
  const run = storage.createTestRun({
    workspaceId,
    workspaceControlId: wc.id,
    status: parsed.data.status,
    comments: parsed.data.comments ?? null,
    aiAnalysis: parsed.data.aiAnalysis ?? null,
    aiSuggestedStatus: parsed.data.aiSuggestedStatus ?? null,
    aiConfidence: parsed.data.aiConfidence ?? null,
    aiContextScope: parsed.data.aiContextScope ?? null,
  });

  for (const link of preparedLinks) {
    storage.createEvidenceLink({
      workspaceId,
      workspaceControlId: wc.id,
      testRunId: run.id,
      title: link.title,
      url: link.url,
      evidenceType: link.evidenceType ?? null,
      description: link.description,
      documentId: link.documentId,
    });
  }

  res.status(201).json(run);
});

auditRouter.get("/ai-interactions", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
  res.json({
    interactions: storage.listAiInteractions(workspaceId, limit),
    tokensUsedToday: storage.getTokensUsedToday(workspaceId),
    dailyBudget: storage.getProfile(workspaceId).aiDailyTokenBudget,
  });
});

// ─── Audit Exports ───────────────────────────────────────────────────────────

auditRouter.get("/exports/soa.csv", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const profile = storage.getProfile(workspaceId);
  const controls = storage.listControlsWithStatus(workspaceId);
  const headers = [
    "Control Number",
    "Control Name",
    "Category",
    "Applicable",
    "Inclusion Justification",
    "Exclusion Justification",
    "Implementation Status",
    "Priority",
    "Frequency",
    "Start Quarter",
    "Next Due Date",
    "Latest Test Status",
    "Last Tested",
    "Questions Answered",
    "Total Questions",
    "Linked Documents",
    "Evidence Links",
    "Linked Risks",
    "APRA CPS 234",
    "APRA CPS 230",
    "SoA Version",
    "SoA Approved By",
    "SoA Approved Date",
  ];

  const rows = controls.map((c) =>
    [
      c.controlNumber,
      c.name,
      c.category.name,
      c.workspaceControl.isApplicable ? "Yes" : "No",
      c.workspaceControl.inclusionJustification || "",
      c.workspaceControl.exclusionJustification || "",
      c.workspaceControl.implementationStatus,
      c.workspaceControl.selectedUrgency,
      c.workspaceControl.frequency || "",
      c.workspaceControl.startQuarter || "",
      c.workspaceControl.nextDueDate || "",
      c.latestTestRun?.status || "NotAttempted",
      c.latestTestRun?.testDate || "",
      c.questionnaireProgress.answered,
      c.questionnaireProgress.total,
      c.linkedDocumentCount,
      c.evidenceLinkCount,
      (c.linkedRiskCodes || []).join("; "),
      c.cps234Reference ? `CPS 234 §${c.cps234Reference}` : "",
      c.cps230Reference ? `CPS 230 §${c.cps230Reference}` : "",
      profile.soaVersion,
      profile.soaApprovedBy || "",
      profile.soaApprovedAt || "",
    ]
      .map(escapeCsvField)
      .join(","),
  );

  const csv = [headers.map(escapeCsvField).join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="mount-charter-statement-of-applicability.csv"',
  );
  res.send(csv);
});

auditRouter.get("/exports/test-history.csv", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const runs = storage.listTestRuns(workspaceId, 100000);
  const headers = [
    "Test Run ID",
    "Test Date",
    "Control Number",
    "Control Name",
    "Category",
    "Status",
    "AI Suggested Status",
    "AI Confidence",
    "Comments",
  ];
  const rows = runs.map((r) =>
    [
      r.id,
      r.testDate,
      r.controlNumber,
      r.controlName,
      r.categoryName,
      r.status,
      r.aiSuggestedStatus || "",
      r.aiConfidence != null ? `${Math.round(r.aiConfidence * 100)}%` : "",
      r.comments || "",
    ]
      .map(escapeCsvField)
      .join(","),
  );

  const csv = [headers.map(escapeCsvField).join(","), ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="mount-charter-test-history.csv"');
  res.send(csv);
});

auditRouter.get("/exports/audit-pack.json", (req, res) => {
  const workspaceId = resolveWorkspaceId(req);
  const workspace = storage.getWorkspace(workspaceId);
  const profile = storage.getProfile(workspaceId);
  const controls = storage.listControlsWithStatus(workspaceId);
  const testRuns = storage.listTestRuns(workspaceId, 100000);
  const documents = storage.listDocuments(workspaceId);
  const evidenceLinks = storage.listEvidenceLinks(workspaceId);
  const questionResponses = storage.listAllQuestionResponses(workspaceId);
  const responseChangeLog = storage.listAllResponseChangeLogs(workspaceId);
  const requirementAssessmentLog = storage.listAllRequirementAssessmentLogs(workspaceId);
  const actionItems = storage.listActionItems(workspaceId);
  const acceptedMatches = storage.listAllAcceptedMatches(workspaceId);
  const risks = storage.listRisks(workspaceId);
  const capas = storage.listCapas(workspaceId);
  const governanceReviews = storage.listReviews(workspaceId);
  const vendors = storage.listVendors(workspaceId);
  const policies = storage.listPolicies(workspaceId);
  const incidents = storage.listIncidents(workspaceId);
  const frameworks = storage.listFrameworks(workspaceId);
  const activeFirstClassFrameworks = frameworks
    .filter((f) => f.enabled && f.supportTier === "full")
    .map((f) => storage.getFrameworkDetail(workspaceId, f.code));
  const crossMappedReferences = frameworks
    .filter((f) => f.enabled && f.supportTier === "cross_mapped")
    .map((f) => f.name);
  const aiContextOnlyTags = frameworks
    .filter((f) => f.enabled && f.supportTier === "ai_context_only")
    .map((f) => f.name);

  const pack = {
    exportedAt: new Date().toISOString(),
    generator: "Mount Charter ISMS Compliance Workbench",
    standard: "ISO/IEC 27001:2022 + Amd 1:2024",
    auditedFrameworks: activeFirstClassFrameworks.map((f) => f?.name).filter(Boolean),
    crossMappedReferences,
    aiContextTags: aiContextOnlyTags,
    soaApproval: {
      version: profile.soaVersion,
      approvedBy: profile.soaApprovedBy,
      approvedAt: profile.soaApprovedAt,
    },
    climateChangeDetermination: {
      relevant: profile.climateChangeRelevant,
      rationale: profile.climateChangeRationale,
    },
    workspace,
    profile,
    summary: storage.getDashboardStats(workspaceId),
    statementOfApplicability: controls.map((c) => ({
      controlNumber: c.controlNumber,
      name: c.name,
      category: c.category.name,
      isApplicable: c.workspaceControl.isApplicable,
      inclusionJustification: c.workspaceControl.inclusionJustification,
      exclusionJustification: c.workspaceControl.exclusionJustification,
      implementationStatus: c.workspaceControl.implementationStatus,
      priority: c.workspaceControl.selectedUrgency,
      frequency: c.workspaceControl.frequency,
      startQuarter: c.workspaceControl.startQuarter,
      nextDueDate: c.workspaceControl.nextDueDate,
      latestStatus: c.latestTestRun?.status || "NotAttempted",
      latestTestDate: c.latestTestRun?.testDate || null,
      questionnaireProgress: c.questionnaireProgress,
      linkedRiskCodes: c.linkedRiskCodes || [],
      cps234Reference: c.cps234Reference,
      cps230Reference: c.cps230Reference,
    })),
    governance: {
      risks,
      capas,
      governanceReviews,
      vendors,
      policies,
      incidents,
    },
    questionResponses,
    responseChangeLog,
    requirementAssessmentLog,
    acceptedMatches,
    actionItems,
    testRuns,
    frameworks: activeFirstClassFrameworks,
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      originalFilename: d.originalFilename,
      evidenceType: d.evidenceType,
      documentDate: d.documentDate,
      extractionStatus: d.extractionStatus,
      fileHash: d.fileHash,
      fileSize: d.fileSize,
      linkedControls: d.linkedControls,
    })),
    evidenceLinks,
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="mount-charter-audit-pack.json"');
  res.send(JSON.stringify(pack, null, 2));
});
