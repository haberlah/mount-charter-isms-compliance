import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server/app";
import { validateMagicBytes } from "../server/blob-store";
import { closeDb, getDb } from "../server/db";
import { storage } from "../server/storage";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "mount-charter-test-"));
process.env.MOUNT_CHARTER_DATA_DIR = TMP_DIR;
process.env.MOUNT_CHARTER_DISABLE_KEYCHAIN = "1";

test.after(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

test("seeds 100 generic ISO 27001:2022 controls with APRA CPS 234/230 mapping and zero client leakage", () => {
  const ws = storage.getDefaultWorkspace();
  const controls = storage.listControlsWithStatus(ws.id);
  assert.equal(controls.length, 100);
  const withApra = controls.filter((c) => c.cps234Reference || c.cps230Reference);
  assert.ok(withApra.length > 50, "Expected APRA CPS 234/230 cross-references to be preserved");
  const serialized = JSON.stringify(controls);
  assert.equal(/\/Users\/|sk-ant-|sk-proj-|@[a-z0-9.-]+\.[a-z]{2,}/i.test(serialized), false);
});

test("SQLite triggers enforce append-only immutability on test_runs and response_change_log", () => {
  const ws = storage.getDefaultWorkspace();
  const ctrl = storage.getControlByNumber("5.1")!;
  const wc = storage.ensureWorkspaceControl(ws.id, ctrl.id);

  const run = storage.createTestRun({
    workspaceId: ws.id,
    workspaceControlId: wc.id,
    status: "Pass",
    comments: "Verified signed policy",
  });

  const db = getDb();
  assert.throws(
    () => db.prepare("UPDATE test_runs SET status = 'Fail' WHERE id = ?").run(run.id),
    /append-only/,
  );
  assert.throws(() => db.prepare("DELETE FROM test_runs WHERE id = ?").run(run.id), /append-only/);

  storage.saveQuestionResponse({
    workspaceId: ws.id,
    workspaceControlId: wc.id,
    questionId: 1,
    responseText: "Policy approved annually by board.",
    changeSource: "manual",
  });

  const logEntry = db
    .prepare("SELECT id FROM response_change_log WHERE workspace_control_id = ? LIMIT 1")
    .get(wc.id) as { id: number };
  assert.ok(logEntry?.id);

  assert.throws(
    () =>
      db
        .prepare("UPDATE response_change_log SET new_response = 'tampered' WHERE id = ?")
        .run(logEntry.id),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM response_change_log WHERE id = ?").run(logEntry.id),
    /append-only/,
  );
});

test("accepting AI match in 2nd workspace writes to exact workspace_control (no PK/FK corruption) and isolates tenants", () => {
  const ws1 = storage.getDefaultWorkspace();
  const ws2 = storage.createWorkspace("Second Organisation");
  const ctrl = storage.getControlByNumber("5.1")!;
  const wc2 = storage.ensureWorkspaceControl(ws2.id, ctrl.id);

  // Confirm workspace_controls.id differs from controls.id in 2nd workspace
  assert.notEqual(wc2.id, ctrl.id);

  const doc2 = storage.createDocument({
    workspaceId: ws2.id,
    title: "Org 2 Policy",
    originalFilename: "org2-policy.txt",
    blobKey: `00/${"a".repeat(64)}`,
    mimeType: "text/plain",
    fileSize: 64,
    fileHash: "a".repeat(64),
    extractionStatus: "extracted",
    extractedText: "Policy reviewed annually.",
    chunks: [],
  });

  // Cross-tenant IDOR check: ws1 cannot access or link ws2's document
  assert.equal(storage.getDocument(ws1.id, doc2.id), null);
  const wc1 = storage.ensureWorkspaceControl(ws1.id, ctrl.id);
  assert.equal(storage.linkDocumentToControl(ws1.id, doc2.id, wc1.id), false);

  const [match] = storage.replaceMatchesForDocumentControl(ws2.id, doc2.id, wc2.id, [
    {
      questionId: 1,
      contentRelevance: 0.95,
      evidenceTypeMatch: true,
      specificity: 0.9,
      compositeScore: 0.945,
      matchedPassage: "Policy reviewed annually.",
      aiSummary: "Addresses policy review.",
      suggestedResponse: "Org 2 reviews its IS policy annually.",
    },
  ]);

  const resolved = storage.resolveMatch({
    workspaceId: ws2.id,
    matchId: match.id,
    decision: "accept",
  });
  assert.ok(resolved?.response);
  assert.equal(resolved.response?.response_text, "Org 2 reviews its IS policy annually.");

  const detail2 = storage.getControlDetail(ws2.id, "5.1")!;
  assert.equal(
    detail2.responses.find((r) => r.question_id === 1)?.response_text,
    "Org 2 reviews its IS policy annually.",
  );
  // Ensure ws1's 5.1 response was NOT overwritten
  const detail1 = storage.getControlDetail(ws1.id, "5.1")!;
  assert.notEqual(
    detail1.responses.find((r) => r.question_id === 1)?.response_text,
    "Org 2 reviews its IS policy annually.",
  );
});

test("blob store magic-byte validator blocks spoofed PDFs and binary payloads disguised as text", () => {
  assert.equal(validateMagicBytes(Buffer.from("%PDF-1.7 test"), "application/pdf"), true);
  assert.equal(
    validateMagicBytes(Buffer.from("<script>alert(1)</script>"), "application/pdf"),
    false,
  );
  assert.equal(validateMagicBytes(Buffer.from("plain text policy"), "text/plain"), true);
  assert.equal(validateMagicBytes(Buffer.from([0x00, 0x01, 0x02]), "text/plain"), false);
});

test("HTTP API enforces CSRF token, Origin, Host, Clause 6.1.3(d) exclusion justification, and safe URLs", async () => {
  const token = "test-launch-token-1234567890";
  const { app } = createApp({ launchToken: token, expectedPort: null });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    // 1. Health endpoint works without token
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const hJson = (await health.json()) as { ok: boolean };
    assert.equal(hJson.ok, true);

    // 2. Mutation without CSRF token is rejected (401)
    const noTok = await fetch(`${base}/api/action-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Should fail" }),
    });
    assert.equal(noTok.status, 401);

    // 3. Mutation with non-loopback Origin is rejected (403)
    const badOrigin = await fetch(`${base}/api/action-items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mount-Charter-Token": token,
        Origin: "https://evil.example.com",
      },
      body: JSON.stringify({ title: "Should fail" }),
    });
    assert.equal(badOrigin.status, 403);

    // 4. javascript: URL on evidence link is rejected (400)
    const xssRes = await fetch(`${base}/api/evidence-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mount-Charter-Token": token,
      },
      body: JSON.stringify({
        title: "Bad link",
        url: "javascript:alert(1)",
      }),
    });
    assert.equal(xssRes.status, 400);

    // 5. Excluding a control without justification is rejected (400)
    const noJust = await fetch(`${base}/api/controls/5.1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Mount-Charter-Token": token,
      },
      body: JSON.stringify({ isApplicable: false, exclusionJustification: "" }),
    });
    assert.equal(noJust.status, 400);

    // 6. Valid authenticated mutation succeeds (201)
    const okRes = await fetch(`${base}/api/action-items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mount-Charter-Token": token,
      },
      body: JSON.stringify({ title: "Review ISO 27001 scope" }),
    });
    assert.equal(okRes.status, 201);

    // 7. Mandatory ISO Clauses 4–10 (RQ4–RQ10) cannot be excluded (400)
    const rqExcl = await fetch(`${base}/api/controls/RQ4`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Mount-Charter-Token": token,
      },
      body: JSON.stringify({
        isApplicable: false,
        exclusionJustification: "Attempting invalid clause exclusion",
      }),
    });
    assert.equal(rqExcl.status, 400);

    // 8. Audit pack JSON includes full questionResponses, responseChangeLog, frameworks & Amd 1:2024
    const packRes = await fetch(`${base}/api/exports/audit-pack.json`);
    assert.equal(packRes.status, 200);
    const pack = (await packRes.json()) as Record<string, unknown>;
    assert.equal(pack.standard, "ISO/IEC 27001:2022 + Amd 1:2024");
    assert.ok(Array.isArray(pack.questionResponses));
    assert.ok(Array.isArray(pack.responseChangeLog));
    assert.ok(Array.isArray(pack.frameworks));
    assert.ok(Array.isArray(pack.auditedFrameworks));
    assert.ok(Array.isArray(pack.aiContextTags));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ISO 27001 ontology fixes A.8.21-8.23, includes Amd 1:2024 & Clause 6.3, and uses valid APRA CPS 234/230 refs", () => {
  const ws = storage.getDefaultWorkspace();
  const controls = storage.listControlsWithStatus(ws.id);
  const byNum = new Map(controls.map((c) => [c.controlNumber, c]));

  assert.equal(byNum.get("8.21")?.name, "Security of network services");
  assert.equal(byNum.get("8.22")?.name, "Segregation of networks");
  assert.equal(byNum.get("8.23")?.name, "Web filtering");

  const rq4Qs = byNum.get("RQ4")?.aiQuestionnaire?.questions || [];
  assert.ok(
    rq4Qs.some((q) => q.question.toLowerCase().includes("climate change")),
    "RQ4 must include Amd 1:2024 climate change question",
  );
  const rq6Qs = byNum.get("RQ6")?.aiQuestionnaire?.questions || [];
  assert.ok(
    rq6Qs.some((q) => q.question.toLowerCase().includes("6.3")),
    "RQ6 must include Clause 6.3 Planning of changes question",
  );

  const valid234 = new Set([
    ...Array.from({ length: 24 }, (_, i) => String(i + 13)),
    "21a",
    "21b",
    "21c",
    "21d",
    "27a",
    "27b",
    "27c",
    "27d",
    "27e",
    "34a",
    "34b",
  ]);
  const valid230 = new Set(Array.from({ length: 49 }, (_, i) => String(i + 12)));

  let saw36 = false;
  for (const c of controls) {
    for (const q of c.aiQuestionnaire?.questions || []) {
      for (const tok of (q.cps234_ref || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)) {
        assert.ok(
          valid234.has(tok),
          `Invalid CPS 234 token "${tok}" on ${c.controlNumber}:Q${q.question_id}`,
        );
        if (tok === "36") saw36 = true;
      }
      for (const tok of (q.cps230_ref || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)) {
        assert.ok(
          valid230.has(tok),
          `Invalid CPS 230 token "${tok}" on ${c.controlNumber}:Q${q.question_id}`,
        );
      }
    }
  }
  assert.ok(
    saw36,
    "CPS 234 para 36 (10-business-day material weakness notification) must be mapped",
  );
});

test("ACSC Essential Eight (72 criteria) computes Weakest-Link ML0-ML3, Privacy Act separates draft bills, and requirement_assessment_log is immutable", () => {
  const ws = storage.createWorkspace("Multi-Framework Audit Org");
  const e8Before = storage.getFrameworkDetail(ws.id, "acsc_e8_2023")!;
  assert.equal(e8Before.requirements.length, 72);
  assert.equal(e8Before.weakestLinkMaturity, "ML0");

  // Mark ALL ML1 criteria Met EXCEPT 1 single criterion -> Weakest-Link MUST stay ML0!
  const ml1Reqs = e8Before.requirements.filter((x) => x.levelOrCategory === "ML1");
  for (const r of ml1Reqs.slice(0, ml1Reqs.length - 1)) {
    storage.updateRequirementAssessment(ws.id, "acsc_e8_2023", r.reqCode, { status: "Met" });
  }
  const e8AlmostMl1 = storage.getFrameworkDetail(ws.id, "acsc_e8_2023")!;
  assert.equal(e8AlmostMl1.weakestLinkMaturity, "ML0");

  // Complete the final ML1 criterion -> Weakest-Link becomes ML1
  storage.updateRequirementAssessment(ws.id, "acsc_e8_2023", ml1Reqs[ml1Reqs.length - 1].reqCode, {
    status: "Met",
  });

  // Mark ML2 & ML3 Met on 7 of 8 strategies (leaving 1 strategy at ML1) -> Weakest-Link MUST stay ML1!
  const strategies = Array.from(new Set(e8Before.requirements.map((r) => r.domain)));
  assert.equal(strategies.length, 8);
  for (const strat of strategies.slice(0, 7)) {
    for (const r of e8Before.requirements.filter(
      (x) => x.domain === strat && (x.levelOrCategory === "ML2" || x.levelOrCategory === "ML3"),
    )) {
      storage.updateRequirementAssessment(ws.id, "acsc_e8_2023", r.reqCode, { status: "Met" });
    }
  }
  const e8Mid = storage.getFrameworkDetail(ws.id, "acsc_e8_2023")!;
  assert.equal(e8Mid.weakestLinkMaturity, "ML1");

  // Direct evidence linking + immutable requirement_assessment_log trigger check
  const ev = storage.addRequirementEvidence({
    workspaceId: ws.id,
    frameworkCode: "acsc_e8_2023",
    reqCode: ml1Reqs[0].reqCode,
    title: "Intune Patch SLA Report",
    url: "https://endpoint.microsoft.com/reports",
    evidenceType: "RECORD",
  });
  assert.ok(ev?.id);
  const hist = storage.listRequirementHistory(ws.id, "acsc_e8_2023", ml1Reqs[0].reqCode);
  assert.ok(hist.length >= 1);
  const db = getDb();
  assert.throws(
    () =>
      db
        .prepare("UPDATE requirement_assessment_log SET new_status = 'NotMet' WHERE id = ?")
        .run(hist[0].id),
    /append-only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM requirement_assessment_log WHERE id = ?").run(hist[0].id),
    /append-only/,
  );

  // Privacy Act: 21 total (19 in-force + 2 draft excluded from readiness %)
  const privacy = storage.getFrameworkDetail(ws.id, "au_privacy_act")!;
  assert.equal(privacy.requirements.length, 21);
  assert.equal(privacy.totalRequirements, 19);
  assert.equal(privacy.draftCount, 2);
  const adm = privacy.requirements.find((r) => r.reqCode === "APP-1.7-ADM");
  assert.equal(adm?.deadlineDate, "2026-12-10");
  assert.equal(adm?.isDraft, false);

  // Cyber Security Act 2024 (Cth) enabled by default with 7 statutory obligations
  const cyber = storage.getFrameworkDetail(ws.id, "au_cyber_security_act_2024")!;
  assert.equal(cyber.enabled, true);
  assert.equal(cyber.requirements.length, 7);
});
