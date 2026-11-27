import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import frameworksData from "../seed-data/frameworks.json";
import ontologyData from "../seed-data/iso_27001_ontology.json";
import migrationMapData from "../seed-data/ontology_v2_1_to_v3_0_map.json";

test("seed-data JSON schemas exist and parse cleanly", () => {
  const fwSchemaPath = path.resolve(process.cwd(), "seed-data/frameworks.schema.json");
  const isoSchemaPath = path.resolve(process.cwd(), "seed-data/iso_27001_ontology.schema.json");
  assert.ok(fs.existsSync(fwSchemaPath), "frameworks.schema.json must exist");
  assert.ok(fs.existsSync(isoSchemaPath), "iso_27001_ontology.schema.json must exist");
  assert.ok(JSON.parse(fs.readFileSync(fwSchemaPath, "utf8")).$schema);
  assert.ok(JSON.parse(fs.readFileSync(isoSchemaPath, "utf8")).$schema);
});

test("iso_27001_ontology.json meets v3.0 structural, explainer, ISO 27002 attribute, migration map, and zero-leakage invariants", () => {
  const controls = ontologyData.controls;
  assert.equal(controls.length, 100);
  assert.equal(ontologyData.metadata.version, "3.0");
  const nums = new Set<string>();
  const seenQuestions = new Set<string>();
  const validControlTypes = new Set(["Preventive", "Detective", "Corrective"]);
  const validProps = new Set(["Confidentiality", "Integrity", "Availability"]);
  const validConcepts = new Set(["Identify", "Protect", "Detect", "Respond", "Recover"]);
  const validDomains = new Set(["Governance_and_Ecosystem", "Protection", "Defence", "Resilience"]);
  const forbiddenCps230 = new Set(["19", "37", "39", "52"]);

  let totalQuestions = 0;
  let totalMappedLegacy = 0;
  const mapControls = migrationMapData.controls as Record<
    string,
    Record<string, { target_question_id: number; mode: string }>
  >;

  for (const c of controls) {
    assert.ok(!nums.has(c.control_number), `Duplicate control_number ${c.control_number}`);
    nums.add(c.control_number);
    assert.ok(
      c.short_summary && c.short_summary.length >= 10 && c.short_summary.length <= 95,
      `${c.control_number} must have concise short_summary`,
    );
    assert.ok(
      c.plain_english_summary && c.plain_english_summary.length >= 50,
      `${c.control_number} must have plain_english_summary`,
    );
    assert.ok(
      c.why_it_matters && c.why_it_matters.length >= 25,
      `${c.control_number} must have why_it_matters`,
    );
    assert.ok(
      Array.isArray(c.key_deliverables) && c.key_deliverables.length >= 2,
      `${c.control_number} must list key_deliverables`,
    );
    assert.ok(
      c.audit_focus_summary && c.audit_focus_summary.length >= 25,
      `${c.control_number} must have audit_focus_summary`,
    );

    const isRq = c.control_number.startsWith("RQ");
    if (isRq) {
      assert.equal(c.iso27002_attributes, null, `${c.control_number} must have null attributes`);
    } else {
      assert.ok(c.iso27002_attributes, `${c.control_number} must have iso27002_attributes`);
      assert.ok(c.iso27002_attributes.control_types.every((x) => validControlTypes.has(x)));
      assert.ok(c.iso27002_attributes.info_sec_properties.every((x) => validProps.has(x)));
      assert.ok(c.iso27002_attributes.cybersecurity_concepts.every((x) => validConcepts.has(x)));
      assert.ok(c.iso27002_attributes.operational_capabilities.length > 0);
      assert.ok(c.iso27002_attributes.security_domains.every((x) => validDomains.has(x)));
    }

    assert.ok(c.questions.length > 0, `Control ${c.control_number} must have questions`);
    const qIds = new Set<number>();
    c.questions.forEach((q, idx) => {
      assert.equal(
        q.question_id,
        idx + 1,
        `Non-contiguous question_id ${q.question_id} on ${c.control_number}`,
      );
      qIds.add(q.question_id);
      const norm = q.question.trim().toLowerCase();
      assert.ok(!seenQuestions.has(norm), `Duplicate question stem on ${c.control_number}`);
      seenQuestions.add(norm);
      assert.notEqual(q.answer_type, "text", `Invalid answer_type "text" on ${c.control_number}`);
      if (q.cps230_ref) {
        for (const p of q.cps230_ref
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)) {
          assert.ok(
            !forbiddenCps230.has(p),
            `Regulator power §${p} must not appear in ${c.control_number} cps230_ref`,
          );
        }
      }
      totalQuestions++;
    });

    const cMap = mapControls[c.control_number];
    assert.ok(cMap, `Missing migration map for ${c.control_number}`);
    for (const [oldId, entry] of Object.entries(cMap)) {
      assert.ok(
        qIds.has(entry.target_question_id),
        `${c.control_number}: legacy Q${oldId} maps to invalid v3.0 Q${entry.target_question_id}`,
      );
      totalMappedLegacy++;
    }
  }

  assert.equal(totalQuestions, ontologyData.metadata.total_questions);
  assert.ok(
    totalQuestions >= 240 && totalQuestions <= 280,
    `Expected ~260 Qs, got ${totalQuestions}`,
  );
  assert.equal(totalMappedLegacy, 506, "Migration map must cover all 506 v2.1 questions");

  const raw = JSON.stringify(ontologyData);
  assert.equal(
    /\/Users\/|sk-ant-|sk-proj-|CERT-Australia|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw),
    false,
    "Seed ontology must not contain private emails, local paths, stale CERT-Australia, or secrets",
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

  // Verify corrected Australian legislative instrument citations (no F2023L01016 / C2024A00099 regressions)
  assert.equal(byCode.get("apra_cps230")?.instrumentId?.includes("F2023L01016"), false);
  assert.ok(byCode.get("apra_cps230")?.sourceUrl?.includes("apra.gov.au"));
  assert.ok(byCode.get("au_soci_act")?.instrumentId?.includes("C2024A00100"));
  assert.equal(byCode.get("au_soci_act")?.instrumentId?.includes("C2024A00099"), false);

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
