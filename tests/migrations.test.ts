import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { closeDb, getDb } from "../server/db";
import {
  migrateOntologyResponsesV21ToV30,
  type OntologyMigrationMap,
  remapBackupResponsesForOntology,
} from "../server/ontology-migration";
import { storage } from "../server/storage";

test("v2.1 to v3.0 migration preserves user data, adds provenance, AI provider & governance tables, and prunes stale E8 rows", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mount-charter-mig-"));
  const prevDir = process.env.MOUNT_CHARTER_DATA_DIR;
  process.env.MOUNT_CHARTER_DATA_DIR = tmpDir;
  process.env.MOUNT_CHARTER_DISABLE_KEYCHAIN = "1";

  try {
    closeDb();

    // Seed a pre-v2.2 SQLite database missing v2.2 provenance columns & containing an obsolete v2.1 E8 code
    const dbPath = path.join(tmpDir, "mount-charter.sqlite");
    const pre = new DatabaseSync(dbPath);
    pre.exec(`
      CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE workspaces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
      CREATE TABLE workspace_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id INTEGER NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
        company_name TEXT,
        industry TEXT,
        company_size TEXT,
        tech_stack TEXT,
        deployment_model TEXT,
        regulatory_requirements_json TEXT NOT NULL DEFAULT '[]',
        data_classification_levels_json TEXT NOT NULL DEFAULT '[]',
        risk_appetite TEXT NOT NULL DEFAULT 'Moderate',
        default_control_frequency TEXT DEFAULT 'Annual',
        default_start_quarter TEXT DEFAULT 'Q1',
        additional_context TEXT,
        hide_non_applicable_controls INTEGER NOT NULL DEFAULT 0,
        ai_screening_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
        ai_synthesis_model TEXT NOT NULL DEFAULT 'claude-opus-4-6',
        ai_daily_token_budget INTEGER NOT NULL DEFAULT 250000,
        ai_max_chunks_per_run INTEGER NOT NULL DEFAULT 25,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;
      CREATE TABLE frameworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        version TEXT NOT NULL,
        scoring_mode TEXT NOT NULL,
        support_tier TEXT NOT NULL,
        description TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE TABLE framework_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        framework_id INTEGER NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
        req_code TEXT NOT NULL,
        domain TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        guidance TEXT,
        level_or_category TEXT,
        prescriptive_sla_json TEXT,
        deadline_date TEXT,
        evidence_expected TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(framework_id, req_code)
      ) STRICT;

      INSERT INTO workspaces (id, name, slug) VALUES (1, 'Legacy Org', 'legacy-org');
      INSERT INTO workspace_profiles (workspace_id, company_name) VALUES (1, 'Legacy Org');
      INSERT INTO frameworks (id, code, name, short_name, version, scoring_mode, support_tier, description, sort_order)
        VALUES (1, 'acsc_e8_2023', 'ACSC E8', 'E8', 'v2.1', 'maturity_0_3', 'full', 'Old', 2);
      INSERT INTO framework_requirements (framework_id, req_code, domain, title, description, level_or_category, sort_order)
        VALUES (1, 'E8-PA-ML1', 'Patch Applications', 'Legacy combined ML1 row', 'Should be pruned', 'ML1', 1);
    `);
    pre.close();

    // Open through v2.2 getDb() -> runs additive migrations + idempotent seeding + pruning
    const db = getDb();

    // Legacy workspace preserved
    const ws = storage.getWorkspace(1);
    assert.equal(ws?.name, "Legacy Org");

    // Provenance columns added & populated
    const e8 = storage.getFrameworkDetail(1, "acsc_e8_2023")!;
    assert.equal(e8.jurisdiction, "Australia");
    assert.ok(e8.sourceUrl?.startsWith("https://"));
    assert.ok(e8.transitionNote?.includes("ASD Essentials"));

    // Obsolete E8-PA-ML1 row pruned -> exact 72 discrete criteria remain
    assert.equal(e8.requirements.length, 72);
    assert.equal(
      e8.requirements.some((r) => r.reqCode === "E8-PA-ML1"),
      false,
    );

    // New v2.2 frameworks seeded and default-enabled
    const cyber = storage.getFrameworkDetail(1, "au_cyber_security_act_2024")!;
    assert.equal(cyber.enabled, true);
    assert.equal(cyber.instrumentId, "C2024A00098");

    // Append-only requirement_assessment_log table exists with triggers
    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_req_assessment_log_%'",
      )
      .all() as Array<{ name: string }>;
    assert.equal(triggers.length, 2);

    // v3.1 migration: untouched legacy default upgrades to provider-agnostic "auto" + all 7 Governance STRICT tables exist
    const migratedProfile = storage.getProfile(1);
    assert.equal(migratedProfile.aiProvider, "auto");
    assert.equal(migratedProfile.aiScreeningModel, "auto");
    assert.equal(migratedProfile.aiSynthesisModel, "auto");
    assert.equal(migratedProfile.aiBaseUrl, null);
    const govTables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
          'risks', 'risk_control_links', 'capa_items', 'governance_reviews',
          'vendors', 'policies', 'incidents'
        )`,
      )
      .all() as Array<{ name: string }>;
    assert.equal(govTables.length, 7, "All 7 v3.0 governance tables must be created on upgrade");
  } finally {
    closeDb();
    if (prevDir !== undefined) process.env.MOUNT_CHARTER_DATA_DIR = prevDir;
    else delete process.env.MOUNT_CHARTER_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("v2.1 -> v3.0 ontology migration preserves 1:1 and N:1 merged answers, respects FK & append-only triggers, skips AI-generated controls, and is idempotent", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mount-charter-ont-mig-"));
  const prevDir = process.env.MOUNT_CHARTER_DATA_DIR;
  process.env.MOUNT_CHARTER_DATA_DIR = tmpDir;
  process.env.MOUNT_CHARTER_DISABLE_KEYCHAIN = "1";

  try {
    closeDb();
    const db = getDb();
    const ws = storage.createWorkspace("Ontology Migration Org");

    // Seed RQ4 responses (1:1 Q3 -> Q2, N:1 Q1 + Q7 -> Q1)
    const rq4 = storage.getControlByNumber("RQ4")!;
    const wcRq4 = storage.ensureWorkspaceControl(ws.id, rq4.id);

    // Create a document + accepted match referenced by response_change_log.source_match_id (tests FK + trigger safety!)
    const doc = storage.createDocument({
      workspaceId: ws.id,
      title: "ISMS Scope Statement",
      originalFilename: "scope.pdf",
      blobKey: "aa/bb",
      mimeType: "application/pdf",
      fileSize: 100,
      fileHash: "deadbeef",
      documentDate: "2026-10-01",
      evidenceType: "POLICY",
      description: null,
      extractedText: "ISMS Scope",
      extractionStatus: "extracted",
      pageCount: 1,
      chunks: [],
    });

    const matchAcceptedRes = db
      .prepare(`
        INSERT INTO document_question_matches (
          workspace_id, document_id, workspace_control_id, question_id,
          content_relevance, evidence_type_match, specificity, composite_score,
          matched_passage, ai_summary, suggested_response, user_accepted, is_active
        ) VALUES (?, ?, ?, 7, 0.9, 1, 0.9, 0.9, 'Climate assessed', 'Summary', 'Climate relevant', 1, 1)
      `)
      .run(ws.id, doc.id, wcRq4.id);
    const acceptedMatchId = Number(matchAcceptedRes.lastInsertRowid);

    const matchPendingRes = db
      .prepare(`
        INSERT INTO document_question_matches (
          workspace_id, document_id, workspace_control_id, question_id,
          content_relevance, evidence_type_match, specificity, composite_score,
          matched_passage, ai_summary, suggested_response, user_accepted, is_active
        ) VALUES (?, ?, ?, 5, 0.85, 1, 0.85, 0.85, 'Scope boundary', 'Summary', 'Scope is HQ', NULL, 1)
      `)
      .run(ws.id, doc.id, wcRq4.id);
    const pendingMatchId = Number(matchPendingRes.lastInsertRowid);

    storage.saveQuestionResponse({
      workspaceId: ws.id,
      workspaceControlId: wcRq4.id,
      questionId: 1,
      responseText: "Internal and external issues tracked in Confluence.",
      evidenceReferences: ["Context Register"],
      changeSource: "manual",
    });
    storage.saveQuestionResponse({
      workspaceId: ws.id,
      workspaceControlId: wcRq4.id,
      questionId: 7,
      responseText: "Climate change assessed as relevant for Sydney DC power.",
      evidenceReferences: ["Climate Memo"],
      changeSource: "ai_accepted",
      sourceDocumentId: doc.id,
      sourceMatchId: acceptedMatchId,
    });
    storage.saveQuestionResponse({
      workspaceId: ws.id,
      workspaceControlId: wcRq4.id,
      questionId: 3,
      responseText: "Interested parties register updated annually.",
      evidenceReferences: ["Stakeholders.xlsx"],
      changeSource: "manual",
    });

    // Mark 5.1 as AI-generated custom questionnaire -> MUST NOT be touched by migration
    const ctrl51 = storage.getControlByNumber("5.1")!;
    storage.saveControlQuestionnaire(ctrl51.id, ctrl51.aiQuestionnaire!);
    const wc51 = storage.ensureWorkspaceControl(ws.id, ctrl51.id);
    storage.saveQuestionResponse({
      workspaceId: ws.id,
      workspaceControlId: wc51.id,
      questionId: 1,
      responseText: "Custom AI question answer preserved.",
      changeSource: "manual",
    });

    // Reset migration meta key so we can explicitly invoke migration with test map
    db.prepare("DELETE FROM app_meta WHERE key = 'ontology_migration_v2_1_to_v3_0'").run();

    const testMap: OntologyMigrationMap = {
      from_version: "2.1",
      to_version: "3.0",
      controls: {
        RQ4: {
          "1": {
            target_question_id: 1,
            mode: "merged",
            legacy_label: "Internal & external issues",
          },
          "2": { target_question_id: 1, mode: "merged", legacy_label: "Issues review" },
          "3": { target_question_id: 2, mode: "1:1", legacy_label: "Interested parties" },
          "4": { target_question_id: 2, mode: "merged", legacy_label: "Legal requirements" },
          "5": { target_question_id: 3, mode: "1:1", legacy_label: "Scope boundary" },
          "6": { target_question_id: 3, mode: "merged", legacy_label: "Exclusions" },
          "7": { target_question_id: 1, mode: "merged", legacy_label: "Climate change (4.1)" },
          "8": {
            target_question_id: 2,
            mode: "merged",
            legacy_label: "Climate stakeholders (4.2)",
          },
        },
        "5.1": {
          "1": { target_question_id: 2, mode: "1:1" },
        },
      },
    };

    const res1 = migrateOntologyResponsesV21ToV30(db, testMap);
    assert.equal(res1.alreadyMigrated, false);
    assert.equal(res1.archivedResponses, 3);
    assert.equal(res1.mergedGroups, 1);
    assert.ok(res1.skippedAiControls >= 1);
    assert.equal(res1.remappedPendingMatches, 1);
    assert.equal(res1.deactivatedStaleMatches, 1);

    // Check RQ4 remapped responses
    const detailRq4 = storage.getControlDetail(ws.id, "RQ4")!;
    assert.equal(detailRq4.legacyResponsesCount, 3);
    const q1 = detailRq4.responses.find((r) => r.question_id === 1)!;
    assert.ok(q1.response_text.includes("Internal and external issues tracked in Confluence."));
    assert.ok(
      q1.response_text.includes("Climate change assessed as relevant for Sydney DC power."),
    );
    assert.deepEqual(q1.evidence_references.sort(), ["Climate Memo", "Context Register"]);

    const q2 = detailRq4.responses.find((r) => r.question_id === 2)!;
    assert.equal(q2.response_text, "Interested parties register updated annually.");

    // Check accepted match still exists (FK intact!) & deactivated; pending match remapped 5 -> 3
    const accRow = db
      .prepare("SELECT question_id, is_active FROM document_question_matches WHERE id = ?")
      .get(acceptedMatchId) as { question_id: number; is_active: number };
    assert.equal(accRow.question_id, 7);
    assert.equal(accRow.is_active, 0);

    const pendRow = db
      .prepare("SELECT question_id, is_active FROM document_question_matches WHERE id = ?")
      .get(pendingMatchId) as { question_id: number; is_active: number };
    assert.equal(pendRow.question_id, 3);
    assert.equal(pendRow.is_active, 1);

    // Check AI-generated control 5.1 was untouched
    const detail51 = storage.getControlDetail(ws.id, "5.1")!;
    assert.equal(detail51.questionnaireSource, "ai_generated");
    assert.equal(
      detail51.responses.find((r) => r.question_id === 1)?.response_text,
      "Custom AI question answer preserved.",
    );

    // Check append-only migration log entry created with ontology_version = '3.0'
    assert.ok(
      detailRq4.changeLog.some(
        (l) => l.changeSource === "ontology_migration_v3" && l.ontologyVersion === "3.0",
      ),
    );

    // Idempotency: second call is a clean no-op
    const res2 = migrateOntologyResponsesV21ToV30(db, testMap);
    assert.equal(res2.alreadyMigrated, true);
    assert.equal(res2.archivedResponses, 0);

    // Backup remapper test for pre-v3.0 backup manifests
    const remapped = remapBackupResponsesForOntology(
      [
        {
          controlNumber: "RQ4",
          questionId: 1,
          responseText: "Issues A",
          evidenceReferences: ["Ref1"],
        },
        {
          controlNumber: "RQ4",
          questionId: 7,
          responseText: "Climate B",
          evidenceReferences: ["Ref2"],
        },
        { controlNumber: "RQ4", questionId: 3, responseText: "Parties C", evidenceReferences: [] },
      ],
      undefined,
      testMap,
    );
    assert.equal(remapped.length, 2);
    const rq4Q1 = remapped.find((r) => r.questionId === 1)!;
    assert.ok(String(rq4Q1.responseText).includes("Issues A"));
    assert.ok(String(rq4Q1.responseText).includes("Climate B"));

    // resp_counts CTE ignores orphaned question IDs
    db.prepare(`
      INSERT INTO question_responses (workspace_id, workspace_control_id, question_id, response_text)
      VALUES (?, ?, 999, 'Orphaned question response')
    `).run(ws.id, wcRq4.id);
    const summaryAfterOrphan = storage
      .listControlsWithStatus(ws.id)
      .find((c) => c.controlNumber === "RQ4")!;
    assert.equal(summaryAfterOrphan.questionnaireProgress.answered, 2);
  } finally {
    closeDb();
    if (prevDir !== undefined) process.env.MOUNT_CHARTER_DATA_DIR = prevDir;
    else delete process.env.MOUNT_CHARTER_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
