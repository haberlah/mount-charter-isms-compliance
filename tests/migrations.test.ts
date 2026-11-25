import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { closeDb, getDb } from "../server/db";
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
