import { createHash } from "node:crypto";
import type { Workspace } from "@shared/schema";
import { getBlob, putBlob } from "./blob-store";
import { getDb } from "./db";
import { loadOntologyMigrationMap, remapBackupResponsesForOntology } from "./ontology-migration";
import { storage } from "./storage";
import { buildZip, readZipSafely, type ZipInputEntry } from "./zip-writer";

interface WorkspaceBackupManifest {
  formatVersion: "mount-charter-backup-v1";
  ontologyVersion?: string;
  exportedAt: string;
  workspaceName: string;
  profile: Record<string, unknown>;
  controls: Array<Record<string, unknown>>;
  responses: Array<Record<string, unknown>>;
  testRuns: Array<Record<string, unknown>>;
  frameworks: Array<Record<string, unknown>>;
  requirementAssessments: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  capas: Array<Record<string, unknown>>;
  reviews: Array<Record<string, unknown>>;
  vendors: Array<Record<string, unknown>>;
  policies: Array<Record<string, unknown>>;
  incidents: Array<Record<string, unknown>>;
  actionItems: Array<Record<string, unknown>>;
  documents: Array<{
    title: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    fileHash: string;
    documentDate: string | null;
    evidenceType: string | null;
    description: string | null;
    extractedText: string | null;
    extractionStatus: string;
    pageCount: number | null;
    blobEntry: string | null;
    linkedControlNumbers: string[];
    chunks: Array<{
      chunkIndex: number;
      content: string;
      tokenCount: number;
      charStart: number;
      charEnd: number;
      sectionHeading: string | null;
    }>;
  }>;
  evidenceLinks: Array<Record<string, unknown>>;
}

export function buildWorkspaceBackupZip(workspaceId: number): Buffer {
  const db = getDb();
  const ws = storage.getWorkspace(workspaceId);
  if (!ws) throw new Error("Workspace not found");

  const profile = storage.getProfile(workspaceId);
  const controls = storage.listControlsWithStatus(workspaceId);
  const responses = storage.listAllQuestionResponses(workspaceId);
  const testRuns = storage.listTestRuns(workspaceId, 100_000);
  const frameworks = storage.listFrameworks(workspaceId);
  const docs = storage.listDocuments(workspaceId);
  const evidenceLinks = storage.listEvidenceLinks(workspaceId);

  const reqAssessRows = db
    .prepare(`
      SELECT f.code AS framework_code, fr.req_code, wra.status, wra.notes,
             wra.evidence_summary, wra.owner, wra.target_date
      FROM workspace_requirement_assessments wra
      JOIN framework_requirements fr ON fr.id = wra.requirement_id
      JOIN frameworks f ON f.id = fr.framework_id
      WHERE wra.workspace_id = ?
    `)
    .all(workspaceId) as Array<Record<string, unknown>>;

  const entries: ZipInputEntry[] = [];
  const docManifest: WorkspaceBackupManifest["documents"] = [];
  const addedBlobs = new Set<string>();

  for (const d of docs) {
    const rawDocRow = db.prepare("SELECT extracted_text FROM documents WHERE id = ?").get(d.id) as
      | { extracted_text: string | null }
      | undefined;
    const blobBuf = getBlob(d.blobKey);
    let blobEntry: string | null = null;
    if (blobBuf) {
      blobEntry = `blobs/${d.fileHash}`;
      if (!addedBlobs.has(blobEntry)) {
        entries.push({ name: blobEntry, content: blobBuf });
        addedBlobs.add(blobEntry);
      }
    }
    docManifest.push({
      title: d.title,
      originalFilename: d.originalFilename,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      fileHash: d.fileHash,
      documentDate: d.documentDate,
      evidenceType: d.evidenceType,
      description: d.description,
      extractedText: rawDocRow?.extracted_text ?? null,
      extractionStatus: d.extractionStatus,
      pageCount: d.pageCount,
      blobEntry,
      linkedControlNumbers: (d.linkedControls || []).map((l) => l.controlNumber),
      chunks: storage.getDocumentChunks(workspaceId, d.id).map((ch) => ({
        chunkIndex: ch.chunkIndex,
        content: ch.content,
        tokenCount: ch.tokenCount,
        charStart: ch.charStart,
        charEnd: ch.charEnd,
        sectionHeading: ch.sectionHeading,
      })),
    });
  }

  const ontVerRow = db.prepare("SELECT value FROM app_meta WHERE key = 'ontology_version'").get() as
    | { value: string }
    | undefined;

  const manifest: WorkspaceBackupManifest = {
    formatVersion: "mount-charter-backup-v1",
    ontologyVersion: ontVerRow?.value || "3.0",
    exportedAt: new Date().toISOString(),
    workspaceName: ws.name,
    profile: profile as unknown as Record<string, unknown>,
    controls: controls.map((c) => ({
      controlNumber: c.controlNumber,
      isApplicable: c.workspaceControl.isApplicable,
      inclusionJustification: c.workspaceControl.inclusionJustification,
      exclusionJustification: c.workspaceControl.exclusionJustification,
      implementationStatus: c.workspaceControl.implementationStatus,
      frequency: c.workspaceControl.frequency,
      startQuarter: c.workspaceControl.startQuarter,
      selectedPersona: c.workspaceControl.selectedPersona,
      selectedUrgency: c.workspaceControl.selectedUrgency,
    })),
    responses: responses as unknown as Array<Record<string, unknown>>,
    testRuns: testRuns.map((t) => ({
      controlNumber: t.controlNumber,
      status: t.status,
      comments: t.comments,
      aiAnalysis: t.aiAnalysis,
      aiSuggestedStatus: t.aiSuggestedStatus,
      aiConfidence: t.aiConfidence,
      aiContextScope: t.aiContextScope,
    })),
    frameworks: frameworks.map((f) => ({
      code: f.code,
      enabled: f.enabled,
      targetLevel: f.targetLevel,
      notes: f.notes,
    })),
    requirementAssessments: reqAssessRows,
    risks: storage.listRisks(workspaceId) as unknown as Array<Record<string, unknown>>,
    capas: storage.listCapas(workspaceId) as unknown as Array<Record<string, unknown>>,
    reviews: storage.listReviews(workspaceId) as unknown as Array<Record<string, unknown>>,
    vendors: storage.listVendors(workspaceId) as unknown as Array<Record<string, unknown>>,
    policies: storage.listPolicies(workspaceId) as unknown as Array<Record<string, unknown>>,
    incidents: storage.listIncidents(workspaceId) as unknown as Array<Record<string, unknown>>,
    actionItems: storage.listActionItems(workspaceId) as unknown as Array<Record<string, unknown>>,
    documents: docManifest,
    evidenceLinks: evidenceLinks as unknown as Array<Record<string, unknown>>,
  };

  entries.unshift({
    name: "backup-manifest.json",
    content: JSON.stringify(manifest, null, 2),
  });

  return buildZip(entries);
}

/**
 * Restore a Mount Charter backup ZIP into a NEW isolated workspace so existing
 * immutable audit trails are never overwritten or destroyed.
 */
export function restoreWorkspaceFromBackupZip(zipBuffer: Buffer): {
  workspace: Workspace;
  restoredDocuments: number;
  restoredResponses: number;
  restoredTestRuns: number;
  restoredRisks: number;
} {
  const entries = readZipSafely(zipBuffer);
  const manifestBuf = entries.get("backup-manifest.json");
  if (!manifestBuf) {
    throw new Error("Invalid backup archive: missing backup-manifest.json");
  }
  const manifest = JSON.parse(manifestBuf.toString("utf8")) as WorkspaceBackupManifest;
  if (manifest.formatVersion !== "mount-charter-backup-v1") {
    throw new Error(`Unsupported backup format: ${String(manifest.formatVersion)}`);
  }

  const ws = storage.createWorkspace(`${manifest.workspaceName || "Restored Org"} (Restored)`);

  // Profile
  const p = manifest.profile || {};
  storage.updateProfile(ws.id, {
    companyName: ws.name,
    industry: (p.industry as string | null) ?? null,
    companySize: (p.companySize as string | null) ?? null,
    techStack: (p.techStack as string | null) ?? null,
    deploymentModel: (p.deploymentModel as string | null) ?? null,
    additionalContext: (p.additionalContext as string | null) ?? null,
    soaVersion: typeof p.soaVersion === "string" ? p.soaVersion : "1.0",
    soaApprovedBy: (p.soaApprovedBy as string | null) ?? null,
    soaApprovedAt: (p.soaApprovedAt as string | null) ?? null,
    climateChangeRelevant: (p.climateChangeRelevant as never) || "Undetermined",
    climateChangeRationale: (p.climateChangeRationale as string | null) ?? null,
  });

  // Controls scoping
  for (const c of manifest.controls || []) {
    const ctrl = storage.getControlByNumber(String(c.controlNumber || ""));
    if (!ctrl) continue;
    const isRq = ctrl.controlNumber.toUpperCase().startsWith("RQ");
    const isApplicable = isRq ? true : Boolean(c.isApplicable);
    storage.updateWorkspaceControl(ws.id, ctrl.id, {
      isApplicable,
      inclusionJustification: (c.inclusionJustification as string | null) ?? null,
      exclusionJustification: isApplicable
        ? null
        : ((c.exclusionJustification as string | null) ?? "Restored exclusion"),
      implementationStatus: (c.implementationStatus as never) || "NotImplemented",
      frequency: (c.frequency as never) ?? null,
      startQuarter: (c.startQuarter as never) ?? null,
      selectedPersona: (c.selectedPersona as never) || "Auditor",
      selectedUrgency: (c.selectedUrgency as never) || "later",
    });
  }

  // Responses (deterministically remap pre-v3.0 backups when running on v3.0 ontology)
  const dbOntVerRow = getDb()
    .prepare("SELECT value FROM app_meta WHERE key = 'ontology_version'")
    .get() as { value: string } | undefined;
  const isRunningV3 = Boolean(dbOntVerRow?.value?.startsWith("3."));
  const responsesToRestore = isRunningV3
    ? remapBackupResponsesForOntology(
        manifest.responses || [],
        manifest.ontologyVersion,
        loadOntologyMigrationMap(),
      )
    : manifest.responses || [];

  let restoredResponses = 0;
  for (const r of responsesToRestore) {
    const ctrl = storage.getControlByNumber(String(r.controlNumber || ""));
    if (!ctrl) continue;
    const wc = storage.ensureWorkspaceControl(ws.id, ctrl.id);
    storage.saveQuestionResponse({
      workspaceId: ws.id,
      workspaceControlId: wc.id,
      questionId: Number(r.questionId),
      responseText: String(r.responseText || ""),
      evidenceReferences: Array.isArray(r.evidenceReferences)
        ? (r.evidenceReferences as string[])
        : [],
      changeSource: "manual",
    });
    restoredResponses++;
  }

  // Test Runs (oldest first so latest stays on top)
  let restoredTestRuns = 0;
  for (const t of [...(manifest.testRuns || [])].reverse()) {
    const ctrl = storage.getControlByNumber(String(t.controlNumber || ""));
    if (!ctrl) continue;
    const wc = storage.ensureWorkspaceControl(ws.id, ctrl.id);
    storage.createTestRun({
      workspaceId: ws.id,
      workspaceControlId: wc.id,
      status: (t.status as never) || "NotAttempted",
      comments: (t.comments as string | null) ?? null,
      aiAnalysis: (t.aiAnalysis as string | null) ?? null,
      aiSuggestedStatus: (t.aiSuggestedStatus as never) ?? null,
      aiConfidence: typeof t.aiConfidence === "number" ? t.aiConfidence : null,
      aiContextScope: (t.aiContextScope as never) ?? null,
    });
    restoredTestRuns++;
  }

  // Frameworks & Requirement Assessments
  for (const fw of manifest.frameworks || []) {
    storage.updateWorkspaceFrameworkConfig(ws.id, String(fw.code || ""), {
      enabled: Boolean(fw.enabled),
      targetLevel: (fw.targetLevel as string | null) ?? null,
      notes: (fw.notes as string | null) ?? null,
    });
  }
  for (const ra of manifest.requirementAssessments || []) {
    storage.updateRequirementAssessment(
      ws.id,
      String(ra.framework_code || ""),
      String(ra.req_code || ""),
      {
        status: (ra.status as never) || "NotMet",
        notes: (ra.notes as string | null) ?? null,
        evidenceSummary: (ra.evidence_summary as string | null) ?? null,
        owner: (ra.owner as string | null) ?? null,
        targetDate: (ra.target_date as string | null) ?? null,
      },
    );
  }

  // Governance Registers
  let restoredRisks = 0;
  for (const rk of manifest.risks || []) {
    storage.createRisk(ws.id, {
      title: String(rk.title || "Restored Risk"),
      description: (rk.description as string | null) ?? null,
      assetOrProcess: (rk.assetOrProcess as string | null) ?? null,
      threat: (rk.threat as string | null) ?? null,
      likelihood: Number(rk.likelihood || 3),
      impact: Number(rk.impact || 3),
      treatment: (rk.treatment as never) || "Mitigate",
      treatmentPlan: (rk.treatmentPlan as string | null) ?? null,
      residualLikelihood: Number(rk.residualLikelihood || 2),
      residualImpact: Number(rk.residualImpact || 2),
      owner: (rk.owner as string | null) ?? null,
      reviewDate: (rk.reviewDate as string | null) ?? null,
      status: (rk.status as never) || "Open",
      linkedControls: Array.isArray(rk.linkedControls) ? (rk.linkedControls as string[]) : [],
    });
    restoredRisks++;
  }

  for (const cp of manifest.capas || []) {
    storage.createCapa(ws.id, {
      title: String(cp.title || "Restored CAPA"),
      findingType: (cp.findingType as never) || "MinorNC",
      source: (cp.source as string | null) ?? null,
      controlNumber: (cp.controlNumber as string | null) ?? null,
      frameworkCode: (cp.frameworkCode as string | null) ?? null,
      reqCode: (cp.reqCode as string | null) ?? null,
      rootCause: (cp.rootCause as string | null) ?? null,
      correctiveAction: (cp.correctiveAction as string | null) ?? null,
      owner: (cp.owner as string | null) ?? null,
      dueDate: (cp.dueDate as string | null) ?? null,
      status: (cp.status as never) || "Open",
      verificationNotes: (cp.verificationNotes as string | null) ?? null,
    });
  }

  for (const rv of manifest.reviews || []) {
    storage.createReview(ws.id, {
      reviewType: (rv.reviewType as never) || "ManagementReview",
      title: String(rv.title || "Restored Review"),
      reviewDate: String(rv.reviewDate || new Date().toISOString().slice(0, 10)),
      scope: (rv.scope as string | null) ?? null,
      leadOrChair: (rv.leadOrChair as string | null) ?? null,
      attendees: (rv.attendees as string | null) ?? null,
      findingsSummary: (rv.findingsSummary as string | null) ?? null,
      decisionsAndActions: (rv.decisionsAndActions as string | null) ?? null,
      nextReviewDate: (rv.nextReviewDate as string | null) ?? null,
      status: rv.status === "Planned" ? "Planned" : "Completed",
    });
  }

  for (const v of manifest.vendors || []) {
    storage.createVendor(ws.id, {
      name: String(v.name || "Restored Vendor"),
      serviceDescription: (v.serviceDescription as string | null) ?? null,
      isMaterialServiceProvider: Boolean(v.isMaterialServiceProvider),
      criticality: (v.criticality as never) || "Medium",
      dataResidency: (v.dataResidency as string | null) ?? null,
      dataTypesShared: (v.dataTypesShared as string | null) ?? null,
      owner: (v.owner as string | null) ?? null,
      contractExpiryDate: (v.contractExpiryDate as string | null) ?? null,
      lastReviewedDate: (v.lastReviewedDate as string | null) ?? null,
      exitPlanStatus: (v.exitPlanStatus as never) || "Missing",
      riskRating: (v.riskRating as never) || "Medium",
      notes: (v.notes as string | null) ?? null,
      linkedControls: Array.isArray(v.linkedControls) ? (v.linkedControls as string[]) : [],
    });
  }

  for (const pol of manifest.policies || []) {
    storage.createPolicy(ws.id, {
      title: String(pol.title || "Restored Policy"),
      version: String(pol.version || "1.0"),
      owner: (pol.owner as string | null) ?? null,
      approver: (pol.approver as string | null) ?? null,
      status: (pol.status as never) || "Draft",
      approvedAt: (pol.approvedAt as string | null) ?? null,
      nextReviewDate: (pol.nextReviewDate as string | null) ?? null,
      contentMarkdown: String(pol.contentMarkdown || ""),
      linkedControls: Array.isArray(pol.linkedControls) ? (pol.linkedControls as string[]) : [],
    });
  }

  for (const inc of manifest.incidents || []) {
    storage.createIncident(ws.id, {
      title: String(inc.title || "Restored Incident"),
      incidentType: (inc.incidentType as never) || "CyberIncident",
      severity: (inc.severity as never) || "High",
      detectedAt: String(inc.detectedAt || new Date().toISOString()),
      ransomPaymentAt: (inc.ransomPaymentAt as string | null) ?? null,
      status: (inc.status as never) || "Investigating",
      summary: (inc.summary as string | null) ?? null,
      affectedSystems: (inc.affectedSystems as string | null) ?? null,
      regulatorNotified: Boolean(inc.regulatorNotified),
      regulatorName: (inc.regulatorName as string | null) ?? null,
      regulatorRef: (inc.regulatorRef as string | null) ?? null,
      regulatorNotifiedAt: (inc.regulatorNotifiedAt as string | null) ?? null,
      linkedControls: Array.isArray(inc.linkedControls) ? (inc.linkedControls as string[]) : [],
    });
  }

  for (const act of manifest.actionItems || []) {
    const item = storage.createActionItem(ws.id, String(act.title || "Action item"));
    if (act.doneAt) storage.updateActionItem(ws.id, item.id, { done: true });
  }

  // Documents & Blobs (verifying SHA-256 integrity)
  let restoredDocuments = 0;
  for (const d of manifest.documents || []) {
    const blobBuf = d.blobEntry ? entries.get(d.blobEntry) : undefined;
    let blobKey = `${d.fileHash.slice(0, 2)}/${d.fileHash}`;
    let fileHash = d.fileHash;
    let fileSize = d.fileSize;
    if (blobBuf) {
      const actualHash = createHash("sha256").update(blobBuf).digest("hex");
      if (d.fileHash && actualHash !== d.fileHash) {
        throw new Error(`Backup integrity error: SHA-256 mismatch for "${d.originalFilename}".`);
      }
      const written = putBlob(blobBuf);
      blobKey = written.blobKey;
      fileHash = written.fileHash;
      fileSize = blobBuf.length;
    }
    const createdDoc = storage.createDocument({
      workspaceId: ws.id,
      title: d.title,
      originalFilename: d.originalFilename,
      blobKey,
      mimeType: d.mimeType,
      fileSize,
      fileHash,
      documentDate: d.documentDate,
      evidenceType: (d.evidenceType as never) ?? null,
      description: d.description,
      extractedText: d.extractedText,
      extractionStatus: (d.extractionStatus as never) || "extracted",
      pageCount: d.pageCount,
      chunks: d.chunks || [],
    });
    if (d.linkedControlNumbers?.length) {
      storage.syncDocumentControlLinks(ws.id, createdDoc.id, d.linkedControlNumbers);
    }
    restoredDocuments++;
  }

  // External evidence links
  for (const el of manifest.evidenceLinks || []) {
    let wcId: number | null = null;
    if (el.controlNumber) {
      const ctrl = storage.getControlByNumber(String(el.controlNumber));
      if (ctrl) wcId = storage.ensureWorkspaceControl(ws.id, ctrl.id).id;
    }
    storage.createEvidenceLink({
      workspaceId: ws.id,
      workspaceControlId: wcId,
      title: String(el.title || "Restored Evidence Link"),
      url: (el.url as string | null) ?? null,
      evidenceType: (el.evidenceType as never) ?? null,
      description: (el.description as string | null) ?? null,
    });
  }

  return {
    workspace: ws,
    restoredDocuments,
    restoredResponses,
    restoredTestRuns,
    restoredRisks,
  };
}
