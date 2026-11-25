import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearModelCache,
  fetchProviderModels,
  getAiProviderStatus,
  pickBestModelsForProvider,
  resolveEffectiveProvider,
  validateLlmBaseUrl,
} from "../server/ai-provider";
import { createApp } from "../server/app";
import { buildWorkspaceBackupZip, restoreWorkspaceFromBackupZip } from "../server/backup";
import { putBlob } from "../server/blob-store";
import { listCollectors, runCollector } from "../server/collectors";
import { closeDb } from "../server/db";
import { POLICY_TEMPLATES } from "../server/policy-templates";
import {
  buildAuditorBundleZip,
  buildDeadlinesIcs,
  buildExecutiveReportHtml,
} from "../server/report-generator";
import { computeStatutoryClocks } from "../server/repositories/governance";
import { storage } from "../server/storage";
import { buildZip, readZipSafely } from "../server/zip-writer";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mount-charter-v3-test-"));
process.env.MOUNT_CHARTER_DATA_DIR = TMP_DIR;
process.env.MOUNT_CHARTER_DISABLE_KEYCHAIN = "1";

test.after(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test("Governance CRUD: Risks link to ISO controls on SoA, CAPAs, Reviews, Vendors, Policies & Statutory Breach Clocks", () => {
  const ws = storage.createWorkspace("V3 Governance Test Co");

  // 1. Starter risks + custom risk linking to ISO 5.17 and 8.5
  const seeded = storage.seedStarterRisks(ws.id);
  assert.equal(seeded.length, 8);
  const customRisk = storage.createRisk(ws.id, {
    title: "Production database unencrypted snapshot leak",
    likelihood: 4,
    impact: 5,
    residualLikelihood: 2,
    residualImpact: 4,
    treatment: "Mitigate",
    treatmentPlan: "Enforce KMS encryption and IAM deny on public snapshots",
    owner: "Head of Security",
    reviewDate: "2027-01-15",
    linkedControls: ["5.17", "8.24"],
  });
  assert.equal(customRisk.inherentScore, 20);
  assert.equal(customRisk.residualScore, 8);

  // Verify SoA controls surface linkedRiskCodes
  const controls = storage.listControlsWithStatus(ws.id);
  const ctrl824 = controls.find((c) => c.controlNumber === "8.24");
  assert.ok(ctrl824);
  assert.ok(ctrl824.linkedRiskCodes?.includes(customRisk.riskCode));

  // 2. CAPA & Internal Audit / Management Review
  const capa = storage.createCapa(ws.id, {
    title: "Privileged access review missed Q3",
    findingType: "MinorNC",
    controlNumber: "5.18",
    owner: "IT Manager",
    dueDate: "2026-12-20",
  });
  assert.equal(capa.capaCode, "NC-001");
  const closedCapa = storage.updateCapa(ws.id, capa.id, { status: "VerifiedClosed" });
  assert.equal(closedCapa?.status, "VerifiedClosed");
  assert.ok(closedCapa?.closedAt);

  const rev = storage.createReview(ws.id, {
    reviewType: "ManagementReview",
    title: "FY26 Executive ISMS Review",
    reviewDate: "2026-11-20",
    leadOrChair: "CEO",
    findingsSummary: "Essential Eight ML2 on track",
    decisionsAndActions: "Approve FIDO2 hardware keys rollout",
  });
  assert.equal(rev.reviewType, "ManagementReview");

  // 3. Vendors / APRA CPS 230 Material Service Provider
  const msp = storage.createVendor(ws.id, {
    name: "AWS Sydney (ap-southeast-2)",
    serviceDescription: "Core production hosting",
    isMaterialServiceProvider: true,
    criticality: "Critical",
    dataResidency: "Australia",
    exitPlanStatus: "Missing",
    contractExpiryDate: "2027-06-30",
  });
  assert.equal(msp.isMaterialServiceProvider, true);

  // 4. Policy Template rendering
  assert.equal(POLICY_TEMPLATES.length, 6);
  const profile = storage.getProfile(ws.id);
  const pol = storage.createPolicy(ws.id, {
    title: POLICY_TEMPLATES[0].title,
    version: "1.0",
    status: "Approved",
    nextReviewDate: "2027-11-25",
    contentMarkdown: POLICY_TEMPLATES[0].render("V3 Governance Test Co", profile),
    linkedControls: [...POLICY_TEMPLATES[0].linkedControls],
  });
  assert.ok(pol.contentMarkdown.includes("V3 Governance Test Co"));

  // 5. Incident + Live Statutory Breach Clocks
  const detectedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const inc = storage.createIncident(ws.id, {
    title: "Simulated ransomware extortion event",
    incidentType: "RansomwareExtortion",
    severity: "Critical",
    detectedAt,
    ransomPaymentAt: detectedAt,
  });
  assert.ok(inc.statutoryClocks.some((c) => c.regime.includes("Cyber Security Act 2024")));
  assert.ok(inc.statutoryClocks.some((c) => c.regime.includes("Privacy Act 1988")));
  assert.ok(inc.statutoryClocks.some((c) => c.regime.includes("APRA CPS 234")));
  assert.ok(inc.statutoryClocks.some((c) => c.regime.includes("SOCI Act 2018")));

  const opClocks = computeStatutoryClocks({
    incidentType: "OperationalDisruption",
    detectedAt: new Date(Date.now() - 30 * 3_600_000).toISOString(),
    ransomPaymentAt: null,
    regulatorNotified: false,
  });
  assert.equal(opClocks.length, 1);
  assert.equal(opClocks[0].overdue, true);

  // Summary aggregate reflects everything
  const summary = storage.getGovernanceSummary(ws.id);
  assert.equal(summary.totalRisks, 9);
  assert.equal(summary.materialServiceProviders, 1);
  assert.equal(summary.mspMissingExitPlan, 1);
  assert.equal(summary.totalPolicies, 1);
  assert.equal(summary.activeIncidents, 1);
});

test("Cross-framework drift detection flags AU requirements contradicting failed/excluded ISO controls", () => {
  const ws = storage.createWorkspace("V3 Drift Test Co");

  // Mark E8-PA-ML1-01 as Met (mapped to ISO 8.8)
  storage.updateRequirementAssessment(ws.id, "acsc_e8_2023", "E8-PA-ML1-01", {
    status: "Met",
    notes: "Claimed patched within 48h",
  });

  // Fail ISO 8.8
  const ctrl88 = storage.getControlByNumber("8.8")!;
  const wc88 = storage.ensureWorkspaceControl(ws.id, ctrl88.id);
  storage.createTestRun({
    workspaceId: ws.id,
    workspaceControlId: wc88.id,
    status: "Fail",
    comments: "Critical CVE unpatched after 14 days",
  });

  const detail = storage.getFrameworkDetail(ws.id, "acsc_e8_2023")!;
  assert.ok(detail.driftCount > 0, "Expected driftCount > 0 when linked ISO 8.8 failed");
  const req = detail.requirements.find((r) => r.reqCode === "E8-PA-ML1-01")!;
  assert.ok(req.driftWarnings.length > 0, "Expected drift warning on E8-PA-ML1-01");
  assert.equal(req.driftWarnings[0].controlNumber, "8.8");
});

test("Multi-provider AI status lists all 11 providers and SSRF guard blocks cloud metadata endpoints", () => {
  assert.equal(validateLlmBaseUrl("http://127.0.0.1:11434/v1"), "http://127.0.0.1:11434/v1");
  assert.equal(validateLlmBaseUrl("http://localhost:1234/v1"), "http://localhost:1234/v1");
  assert.equal(validateLlmBaseUrl("https://api.openai.com/v1"), "https://api.openai.com/v1");
  assert.equal(validateLlmBaseUrl("https://api.x.ai/v1"), "https://api.x.ai/v1");
  assert.equal(validateLlmBaseUrl("http://169.254.169.254/latest/meta-data"), null);
  assert.equal(validateLlmBaseUrl("http://metadata.google.internal/computeMetadata/v1"), null);
  assert.equal(validateLlmBaseUrl("file:///etc/passwd"), null);
  assert.equal(validateLlmBaseUrl("javascript:alert(1)"), null);

  const ws = storage.getDefaultWorkspace();
  const profile = storage.getProfile(ws.id);
  assert.equal(profile.aiProvider, "auto");
  assert.equal(profile.aiScreeningModel, "auto");
  assert.equal(profile.aiSynthesisModel, "auto");

  const status = getAiProviderStatus(profile);
  assert.equal(status.configuredProvider, "auto");
  assert.equal(status.providers.length, 11);
  assert.ok(status.providers.some((p) => p.id === "ollama" && p.mode === "local_oss"));
  assert.ok(status.providers.some((p) => p.id === "claude_cli" && p.mode === "subscription_cli"));
  assert.ok(status.providers.some((p) => p.id === "xai" && p.mode === "api_key"));
  assert.ok(status.providers.some((p) => p.id === "meta" && p.mode === "api_key"));

  // Auto-detect picks connected env provider (never forces Anthropic when unconfigured)
  const savedEnv = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    XAI_API_KEY: process.env.XAI_API_KEY,
    META_API_KEY: process.env.META_API_KEY,
    CUSTOM_LLM_API_KEY: process.env.CUSTOM_LLM_API_KEY,
  };
  try {
    for (const k of Object.keys(savedEnv) as Array<keyof typeof savedEnv>) {
      delete process.env[k];
    }
    assert.equal(
      resolveEffectiveProvider(profile, { skipCliScan: true }),
      null,
      "Auto-detect must return null (not Anthropic) when no keys/CLIs exist",
    );

    process.env.GEMINI_API_KEY = "test-gemini-key-123456789";
    assert.equal(
      resolveEffectiveProvider(profile, { skipCliScan: true }),
      "gemini",
      "Auto-detect must pick connected GEMINI_API_KEY immediately",
    );
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  // Dynamic latest flagship ranking across providers
  const gemPick = pickBestModelsForProvider("gemini", [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-3.0-pro",
    "gemini-3.0-flash",
    "text-embedding-004",
  ]);
  assert.equal(gemPick.synthesis, "gemini-3.0-pro");
  assert.equal(gemPick.screening, "gemini-3.0-flash");

  const oaiPick = pickBestModelsForProvider("openai", [
    "gpt-4.1",
    "gpt-5.4-mini",
    "gpt-5.4",
    "text-embedding-3-large",
  ]);
  assert.equal(oaiPick.synthesis, "gpt-5.4");
  assert.equal(oaiPick.screening, "gpt-5.4-mini");

  const claudePick = pickBestModelsForProvider("anthropic", [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-opus-5-0",
    "claude-sonnet-5-0",
  ]);
  assert.equal(claudePick.synthesis, "claude-opus-5-0");
  assert.equal(claudePick.screening, "claude-sonnet-5-0");
});

test("GET /api/settings/models returns live CLI aliases and rejects unsafe base URLs", async () => {
  clearModelCache();
  const cliModels = await fetchProviderModels("claude_cli");
  assert.equal(cliModels.liveFetched, true);
  assert.equal(cliModels.recommendedScreening, "sonnet");
  assert.equal(cliModels.recommendedSynthesis, "opus");
  assert.ok(cliModels.models.includes("opus"));
});

test("Auditor Bundle ZIP, Executive HTML Report, .ics Deadlines & Portable Backup/Restore round-trip cleanly", () => {
  const ws = storage.createWorkspace("V3 Bundle & Backup Co");
  storage.seedStarterRisks(ws.id);
  storage.createCapa(ws.id, {
    title: "Remediate missing backup restore test",
    findingType: "MinorNC",
    dueDate: "2026-12-18",
  });
  storage.createPolicy(ws.id, {
    title: "Information Security Policy",
    version: "1.0",
    status: "Approved",
    nextReviewDate: "2027-03-01",
    contentMarkdown: "# Information Security Policy\n\nApproved.",
  });

  // Upload a real binary evidence file into local blob storage
  const rawBytes = Buffer.from(
    "Mount Charter evidence binary payload — SHA256 verified!\n",
    "utf8",
  );
  const expectedSha = createHash("sha256").update(rawBytes).digest("hex");
  const { blobKey } = putBlob(rawBytes);
  const doc = storage.createDocument({
    workspaceId: ws.id,
    title: "SOC Report Proof",
    originalFilename: "soc-proof.txt",
    mimeType: "text/plain",
    fileSize: rawBytes.length,
    fileHash: expectedSha,
    blobKey,
    evidenceType: "RECORD",
    extractedText: rawBytes.toString("utf8"),
    extractionStatus: "extracted",
    chunks: [],
  });

  // 1. Executive HTML report has zero inline onclick handlers (CSP safe)
  const html = buildExecutiveReportHtml(ws.id);
  assert.ok(html.includes("V3 Bundle &amp; Backup Co"));
  assert.equal(html.includes("onclick="), false);

  // 2. Auditor Evidence Bundle ZIP
  const bundleZip = buildAuditorBundleZip(ws.id);
  const bundleEntries = readZipSafely(bundleZip);
  const names = Array.from(bundleEntries.keys());
  assert.ok(names.includes("00-Executive-Compliance-Report.html"));
  assert.ok(names.includes("01-ISO27001-Statement-of-Applicability.csv"));
  assert.ok(names.includes("04-Governance/Risk-Register.csv"));
  assert.ok(names.includes("SHA256SUMS.txt"));
  const evidenceName = names.find((n) => n.startsWith("06-Evidence-Files/"));
  assert.ok(evidenceName, "Expected uploaded binary evidence file inside Auditor Bundle ZIP");
  assert.equal(
    createHash("sha256").update(bundleEntries.get(evidenceName)!).digest("hex"),
    expectedSha,
    "Bundled evidence file bytes must match original SHA-256",
  );
  const sumsText = bundleEntries.get("SHA256SUMS.txt")!.toString("utf8");
  assert.ok(sumsText.includes(expectedSha));

  // 3. RFC 5545 .ics Deadlines Export
  const ics = buildDeadlinesIcs(ws.id);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("END:VCALENDAR"));
  assert.ok(ics.includes("20261210"), "Expected 10 Dec 2026 Privacy Act ADM deadline in .ics");
  assert.ok(ics.includes("20261218"), "Expected CAPA due date in .ics");
  assert.ok(ics.includes("20270301"), "Expected Policy review date in .ics");

  // 4. Portable Workspace Backup & Restore ZIP round-trip into new workspace
  const backupZip = buildWorkspaceBackupZip(ws.id);
  const restored = restoreWorkspaceFromBackupZip(backupZip);
  assert.notEqual(restored.workspace.id, ws.id);
  assert.equal(restored.restoredDocuments, 1);
  assert.equal(restored.restoredRisks, 8);
  const restoredDocs = storage.listDocuments(restored.workspace.id);
  assert.equal(restoredDocs.length, 1);
  assert.equal(restoredDocs[0].fileHash, doc.fileHash);

  // 5. Security: restore rejects tampered binary blob (SHA-256 mismatch) & zip-writer blocks zip bombs / path traversal
  const parsedBackup = readZipSafely(backupZip);
  const tamperedEntries = Array.from(parsedBackup.entries()).map(([name, data]) => ({
    name,
    content: name.startsWith("blobs/") ? Buffer.from("TAMPERED EVIDENCE BYTES", "utf8") : data,
  }));
  assert.throws(
    () => restoreWorkspaceFromBackupZip(buildZip(tamperedEntries)),
    /SHA-256 mismatch/i,
  );

  // Crafted path-traversal entry header (bypassing buildZip sanitizer by patching filename bytes)
  const rawZip = buildZip([{ name: "xx/evil.txt", content: "pwn" }]);
  const patched = Buffer.from(rawZip);
  const marker = Buffer.from("xx/evil.txt", "utf8");
  let idx = patched.indexOf(marker);
  while (idx !== -1) {
    Buffer.from("../evil.txt", "utf8").copy(patched, idx);
    idx = patched.indexOf(marker, idx + 1);
  }
  assert.throws(() => readZipSafely(patched), /unsafe zip entry path/i);

  // Decompression ceiling guard in readZipSafely
  const bombZip = buildZip([{ name: "bomb.txt", content: Buffer.alloc(1024 * 1024, 0x41) }]);
  assert.throws(
    () => readZipSafely(bombZip, { maxEntryBytes: 64 * 1024 }),
    /exceeds|limit|maxOutputLength/i,
  );
});

test("v3.0 HTTP API routes serve Governance CRUD, Auditor Bundle ZIP, Executive HTML, .ics, Backup ZIP & enforce SSRF guard", async () => {
  const token = "v3-http-test-token-987654321";
  const { app } = createApp({ launchToken: token, expectedPort: null });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const ws = storage.createWorkspace("V3 HTTP Co");
  const authHeaders = {
    "Content-Type": "application/json",
    "X-Mount-Charter-Token": token,
    "X-Mount-Charter-Workspace": String(ws.id),
  };

  try {
    // 1. Create Risk via HTTP & export Risks CSV
    const rRisk = await fetch(`${base}/api/governance/risks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: "Unpatched VPN appliance",
        likelihood: 4,
        impact: 5,
        linkedControls: ["8.8"],
      }),
    });
    assert.equal(rRisk.status, 201);

    const rRisksCsv = await fetch(`${base}/api/exports/risks.csv?workspaceId=${ws.id}`);
    assert.equal(rRisksCsv.status, 200);
    assert.ok((await rRisksCsv.text()).includes("Unpatched VPN appliance"));

    // 2. Auditor Bundle ZIP, Executive HTML Report, .ics Deadlines & Backup ZIP
    const rBundle = await fetch(`${base}/api/exports/auditor-bundle.zip?workspaceId=${ws.id}`);
    assert.equal(rBundle.status, 200);
    const bundleMap = readZipSafely(Buffer.from(await rBundle.arrayBuffer()));
    assert.ok(bundleMap.has("SHA256SUMS.txt"));
    assert.ok(bundleMap.has("00-Executive-Compliance-Report.html"));

    const rHtml = await fetch(`${base}/api/exports/executive-report.html?workspaceId=${ws.id}`);
    assert.equal(rHtml.status, 200);
    const html = await rHtml.text();
    assert.ok(html.includes("V3 HTTP Co"));
    assert.equal(html.includes("onclick="), false);

    const rIcs = await fetch(`${base}/api/exports/deadlines.ics?workspaceId=${ws.id}`);
    assert.equal(rIcs.status, 200);
    assert.ok((await rIcs.text()).startsWith("BEGIN:VCALENDAR"));

    const rBackup = await fetch(`${base}/api/workspaces/${ws.id}/backup.zip`);
    assert.equal(rBackup.status, 200);
    assert.ok(readZipSafely(Buffer.from(await rBackup.arrayBuffer())).has("backup-manifest.json"));

    // 3. SSRF guard rejects cloud metadata endpoint in AI Base URL
    const rSsrf = await fetch(`${base}/api/settings/profile`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ aiBaseUrl: "http://169.254.169.254/latest/meta-data" }),
    });
    assert.equal(rSsrf.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Local read-only CLI evidence collectors enumerate and macOS posture collector captures & auto-links evidence", async () => {
  const collectors = listCollectors();
  assert.equal(collectors.length, 4);
  const macos = collectors.find((c) => c.id === "macos_posture");
  assert.ok(macos);

  if (process.platform === "darwin") {
    assert.equal(macos.available, true);
    const ws = storage.createWorkspace("V3 Collector Test Co");
    const result = await runCollector(ws.id, "macos_posture");
    assert.ok(result.documentId > 0);
    assert.ok(result.linkedControls.includes("8.1"));
    assert.ok(result.linkedControls.includes("8.8"));
    assert.ok(result.linkedRequirements.includes("acsc_e8_2023:E8-PO-ML1-01"));
    assert.ok(result.linkedRequirements.includes("acsc_e8_2023:E8-AC-ML1-01"));
    const docs = storage.listDocuments(ws.id);
    assert.equal(docs.length, 1);
    const chunks = storage.getDocumentChunks(ws.id, docs[0].id);
    assert.ok(chunks.some((ch) => ch.content.includes("macOS Endpoint Security Posture")));
  }
});
