import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import frameworksData from "../seed-data/frameworks.json";
import ontologyData from "../seed-data/iso_27001_ontology.json";

test("seed-data JSON schemas exist and parse cleanly", () => {
  const fwSchemaPath = path.resolve(process.cwd(), "seed-data/frameworks.schema.json");
  const isoSchemaPath = path.resolve(process.cwd(), "seed-data/iso_27001_ontology.schema.json");
  assert.ok(fs.existsSync(fwSchemaPath), "frameworks.schema.json must exist");
  assert.ok(fs.existsSync(isoSchemaPath), "iso_27001_ontology.schema.json must exist");
  assert.ok(JSON.parse(fs.readFileSync(fwSchemaPath, "utf8")).$schema);
  assert.ok(JSON.parse(fs.readFileSync(isoSchemaPath, "utf8")).$schema);
});

test("iso_27001_ontology.json meets structural, coverage, and zero-leakage invariants", () => {
  const controls = ontologyData.controls;
  assert.equal(controls.length, 100);
  const nums = new Set<string>();
  let totalQuestions = 0;
  for (const c of controls) {
    assert.ok(!nums.has(c.control_number), `Duplicate control_number ${c.control_number}`);
    nums.add(c.control_number);
    assert.ok(c.questions.length > 0, `Control ${c.control_number} must have questions`);
    const qIds = new Set<number>();
    for (const q of c.questions) {
      assert.ok(
        !qIds.has(q.question_id),
        `Duplicate question_id ${q.question_id} on ${c.control_number}`,
      );
      qIds.add(q.question_id);
      totalQuestions++;
    }
  }
  assert.equal(totalQuestions, ontologyData.metadata.total_questions);

  const raw = JSON.stringify(ontologyData);
  assert.equal(
    /\/Users\/|sk-ant-|sk-proj-|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw),
    false,
    "Seed ontology must not contain private emails, local paths, or secrets",
  );
});

test("frameworks.json meets provenance, mapping referential integrity, and AU legislative invariants", () => {
  const validIsoNums = new Set(ontologyData.controls.map((c) => c.control_number));
  const validCoverages = new Set(["full", "partial", "delta_required", "rubric_conflict"]);
  const validTiers = new Set(["full", "cross_mapped", "ai_context_only"]);
  const fwCodes = new Set<string>();

  assert.equal(frameworksData.frameworks.length, 10);

  for (const fw of frameworksData.frameworks) {
    assert.ok(!fwCodes.has(fw.code), `Duplicate framework code ${fw.code}`);
    fwCodes.add(fw.code);
    assert.ok(validTiers.has(fw.supportTier), `Invalid supportTier ${fw.supportTier}`);
    assert.ok(fw.jurisdiction, `Missing jurisdiction on ${fw.code}`);
    assert.ok(
      fw.sourceUrl?.startsWith("https://"),
      `Framework ${fw.code} must link to an official https:// sourceUrl`,
    );

    const reqCodes = new Set<string>();
    for (const r of fw.requirements) {
      assert.ok(!reqCodes.has(r.reqCode), `Duplicate reqCode ${r.reqCode} in ${fw.code}`);
      reqCodes.add(r.reqCode);
      assert.equal(typeof r.isDraft, "boolean", `isDraft must be boolean on ${r.reqCode}`);
      for (const m of r.isoMappings) {
        assert.ok(
          validIsoNums.has(m.controlNumber),
          `Broken ISO mapping ${m.controlNumber} on ${fw.code}:${r.reqCode}`,
        );
        assert.ok(
          validCoverages.has(m.coverage),
          `Invalid coverage ${m.coverage} on ${fw.code}:${r.reqCode}`,
        );
      }
    }
  }

  // Verify exact counts for first-class Australian modules
  const byCode = new Map(frameworksData.frameworks.map((f) => [f.code, f]));
  assert.equal(byCode.get("acsc_e8_2023")?.requirements.length, 72);
  assert.equal(byCode.get("au_privacy_act")?.requirements.length, 21);
  assert.equal(byCode.get("au_cyber_security_act_2024")?.requirements.length, 7);
  assert.equal(byCode.get("apra_cps234")?.requirements.length, 8);
  assert.equal(byCode.get("apra_cps230")?.requirements.length, 8);
  assert.equal(byCode.get("au_soci_act")?.requirements.length, 6);
  assert.equal(byCode.get("au_ai6_2025")?.requirements.length, 7);
  assert.equal(byCode.get("soc2_type2")?.supportTier, "ai_context_only");
  assert.equal(byCode.get("gdpr")?.supportTier, "ai_context_only");

  // Ensure draft items are explicitly flagged
  const privacyDrafts = byCode.get("au_privacy_act")!.requirements.filter((r) => r.isDraft);
  assert.equal(privacyDrafts.length, 2, "Privacy Tranche 2 items must be marked isDraft: true");

  const ai6Drafts = byCode.get("au_ai6_2025")!.requirements.filter((r) => r.isDraft);
  assert.equal(ai6Drafts.length, 1, "Nov 2026 Frontier AI watch item must be marked isDraft: true");

  const raw = JSON.stringify(frameworksData);
  assert.equal(
    /\/Users\/|sk-ant-|sk-proj-|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw),
    false,
    "Seed frameworks must not contain private emails, local paths, or secrets",
  );
});
