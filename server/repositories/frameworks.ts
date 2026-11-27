import type {
  ControlSummary,
  E8AchievedLevel,
  EssentialEightStrategySummary,
  EvidenceType,
  FrameworkControlLink,
  FrameworkDetailResponse,
  FrameworkRequirementItem,
  FrameworkScoringMode,
  FrameworkSummary,
  FrameworkSupportTier,
  MappingCoverage,
  RequirementAssessmentLogEntry,
  RequirementDriftWarning,
  RequirementEvidenceLink,
  RequirementStatus,
} from "@shared/schema";
import { getDb } from "../db";
import { mapRequirementEvidence, mapRequirementLog, safeJsonParse } from "./common";
import { controlsRepository } from "./controls";
import { evidenceRepository } from "./evidence";
import { workspaceRepository } from "./workspaces";

const FRAMEWORK_LABEL_BY_CODE: Record<string, string> = {
  iso27001_2022: "ISO/IEC 27001:2022",
  acsc_e8_2023: "ACSC Essential Eight",
  au_privacy_act: "Australian Privacy Act (APPs)",
  au_cyber_security_act_2024: "Cyber Security Act 2024 (Cth)",
  apra_cps234: "APRA CPS 234",
  apra_cps230: "APRA CPS 230",
  au_soci_act: "SOCI Act 2018",
  au_ai6_2025: "NAIC AI6 Guidance",
  soc2_type2: "SOC 2 Type II",
  gdpr: "GDPR",
};

function summariseLevelStatuses(statuses: RequirementStatus[]): {
  status: RequirementStatus;
  satisfiedCount: number;
  allSatisfied: boolean;
} {
  if (statuses.length === 0) {
    return { status: "NotApplicable", satisfiedCount: 0, allSatisfied: true };
  }
  const satisfiedCount = statuses.filter((s) => s === "Met" || s === "NotApplicable").length;
  const allNa = statuses.every((s) => s === "NotApplicable");
  const allSatisfied = satisfiedCount === statuses.length;
  const anyProgress = statuses.some(
    (s) => s === "Met" || s === "PartiallyMet" || s === "NotApplicable",
  );

  if (allNa) return { status: "NotApplicable", satisfiedCount, allSatisfied: true };
  if (allSatisfied) return { status: "Met", satisfiedCount, allSatisfied: true };
  if (anyProgress) return { status: "PartiallyMet", satisfiedCount, allSatisfied: false };
  return { status: "NotMet", satisfiedCount: 0, allSatisfied: false };
}

function computeDriftWarnings(params: {
  status: RequirementStatus;
  assessedAt: string | null;
  evidenceSummary: string | null;
  evidenceCount: number;
  linkedControls: Array<{
    controlNumber: string;
    controlName: string;
    coverage: MappingCoverage;
    latestStatus: string | null;
    latestTestDate: string | null;
    isApplicable: boolean;
  }>;
}): RequirementDriftWarning[] {
  if (params.status !== "Met" && params.status !== "PartiallyMet") return [];
  const warnings: RequirementDriftWarning[] = [];
  for (const c of params.linkedControls) {
    if (c.latestStatus === "Fail") {
      warnings.push({
        controlNumber: c.controlNumber,
        controlName: c.controlName,
        severity: "err",
        reason: `Linked ISO control ${c.controlNumber} failed its latest test run — re-verify this requirement.`,
      });
    } else if (c.latestStatus === "Blocked") {
      warnings.push({
        controlNumber: c.controlNumber,
        controlName: c.controlName,
        severity: "warn",
        reason: `Linked ISO control ${c.controlNumber} is Blocked — confirm no impact on this requirement.`,
      });
    }
    if (!c.isApplicable && (c.coverage === "full" || c.coverage === "partial")) {
      warnings.push({
        controlNumber: c.controlNumber,
        controlName: c.controlName,
        severity: "warn",
        reason: `Linked ISO control ${c.controlNumber} is Excluded in your SoA — verify standalone compensating controls.`,
      });
    }
    if (
      c.coverage === "rubric_conflict" &&
      params.evidenceCount === 0 &&
      !params.evidenceSummary?.trim()
    ) {
      warnings.push({
        controlNumber: c.controlNumber,
        controlName: c.controlName,
        severity: "warn",
        reason: `Prescriptive SLA overrides ISO ${c.controlNumber} — attach direct SLA evidence (e.g. 48h patch report).`,
      });
    }
  }
  return warnings;
}

export const frameworksRepository = {
  listFrameworks(workspaceId: number): FrameworkSummary[] {
    const db = getDb();
    const fwRows = db
      .prepare(`
        SELECT f.*, wf.enabled, wf.target_level, wf.notes
        FROM frameworks f
        LEFT JOIN workspace_frameworks wf ON wf.framework_id = f.id AND wf.workspace_id = ?
        ORDER BY f.sort_order ASC
      `)
      .all(workspaceId) as Array<Record<string, unknown>>;

    const reqRows = db
      .prepare(`
        SELECT fr.id, fr.framework_id, fr.req_code, fr.domain, fr.title,
               fr.level_or_category, fr.deadline_date, fr.is_draft, fr.sort_order,
               wra.status AS assessed_status,
               wra.assessed_at AS assessed_at,
               wra.evidence_summary AS evidence_summary,
               (SELECT COUNT(*) FROM requirement_evidence_links rel
                WHERE rel.workspace_id = ? AND rel.requirement_id = fr.id) AS ev_count,
               EXISTS(
                 SELECT 1 FROM control_framework_mappings cfm
                 WHERE cfm.requirement_id = fr.id AND cfm.coverage = 'rubric_conflict'
               ) AS has_conflict
        FROM framework_requirements fr
        LEFT JOIN workspace_requirement_assessments wra
          ON wra.requirement_id = fr.id AND wra.workspace_id = ?
        ORDER BY fr.sort_order ASC
      `)
      .all(workspaceId, workspaceId) as Array<Record<string, unknown>>;

    // Lightweight control status map for cross-framework drift counting
    const mapCtrlRows = db
      .prepare(`
        WITH latest_runs AS (
          SELECT workspace_control_id, status, test_date,
            ROW_NUMBER() OVER (PARTITION BY workspace_control_id ORDER BY test_date DESC, id DESC) AS rn
          FROM test_runs
          WHERE workspace_id = ?
        )
        SELECT cfm.requirement_id, cfm.coverage,
               c.control_number, c.name AS control_name,
               COALESCE(wc.is_applicable, 1) AS is_applicable,
               lr.status AS latest_status, lr.test_date AS latest_test_date
        FROM control_framework_mappings cfm
        JOIN controls c ON c.id = cfm.control_id
        LEFT JOIN workspace_controls wc ON wc.control_id = c.id AND wc.workspace_id = ?
        LEFT JOIN latest_runs lr ON lr.workspace_control_id = wc.id AND lr.rn = 1
      `)
      .all(workspaceId, workspaceId) as Array<Record<string, unknown>>;

    const mappedByReqId = new Map<
      number,
      Array<{
        controlNumber: string;
        controlName: string;
        coverage: MappingCoverage;
        latestStatus: string | null;
        latestTestDate: string | null;
        isApplicable: boolean;
      }>
    >();
    for (const m of mapCtrlRows) {
      const reqId = Number(m.requirement_id);
      const arr = mappedByReqId.get(reqId) || [];
      arr.push({
        controlNumber: String(m.control_number),
        controlName: String(m.control_name),
        coverage: m.coverage as MappingCoverage,
        latestStatus: m.latest_status != null ? String(m.latest_status) : null,
        latestTestDate: m.latest_test_date != null ? String(m.latest_test_date) : null,
        isApplicable: Boolean(m.is_applicable),
      });
      mappedByReqId.set(reqId, arr);
    }

    const reqsByFw = new Map<number, Array<Record<string, unknown>>>();
    for (const r of reqRows) {
      const fid = Number(r.framework_id);
      const arr = reqsByFw.get(fid) || [];
      arr.push(r);
      reqsByFw.set(fid, arr);
    }

    const isoQuestionRow = db
      .prepare(
        "SELECT COALESCE(SUM(json_array_length(questionnaire_json, '$.questions')), 0) AS total_q FROM controls",
      )
      .get() as { total_q: number } | undefined;
    const totalIsoQuestions = Number(isoQuestionRow?.total_q || 0);

    const nowMs = Date.now();
    const levelOrder: Record<E8AchievedLevel, number> = { ML0: 0, ML1: 1, ML2: 2, ML3: 3 };
    const levelByRank: E8AchievedLevel[] = ["ML0", "ML1", "ML2", "ML3"];

    return fwRows.map((fw) => {
      const id = Number(fw.id);
      const code = String(fw.code);
      const allReqs = reqsByFw.get(id) || [];
      const inForceReqs = allReqs.filter((r) => !r.is_draft);
      const draftCount = allReqs.length - inForceReqs.length;

      let metCount = 0;
      let partiallyMetCount = 0;
      let notMetCount = 0;
      let notApplicableCount = 0;
      let driftCount = 0;

      const upcomingDeadlines: NonNullable<FrameworkSummary["upcomingDeadlines"]> = [];

      for (const r of inForceReqs) {
        const status = (r.assessed_status as RequirementStatus | null) || "NotMet";
        if (status === "Met") metCount++;
        else if (status === "PartiallyMet") partiallyMetCount++;
        else if (status === "NotApplicable") notApplicableCount++;
        else notMetCount++;

        const reqDrift = computeDriftWarnings({
          status,
          assessedAt: r.assessed_at != null ? String(r.assessed_at) : null,
          evidenceSummary: r.evidence_summary != null ? String(r.evidence_summary) : null,
          evidenceCount: Number(r.ev_count || 0),
          linkedControls: mappedByReqId.get(Number(r.id)) || [],
        });
        if (reqDrift.length > 0) driftCount++;

        if (r.deadline_date) {
          const dStr = String(r.deadline_date);
          const dMs = new Date(`${dStr}T00:00:00Z`).getTime();
          const daysRemaining = Math.ceil((dMs - nowMs) / (1000 * 60 * 60 * 24));
          upcomingDeadlines.push({
            reqCode: String(r.req_code),
            title: String(r.title),
            deadlineDate: dStr,
            daysRemaining,
            status,
          });
        }
      }

      const denom = Math.max(0, inForceReqs.length - notApplicableCount);
      const readinessPercentage =
        denom > 0 ? Math.round(((metCount + partiallyMetCount * 0.5) / denom) * 100) : 0;

      let weakestLinkMaturity: E8AchievedLevel | undefined;
      let e8Strategies: EssentialEightStrategySummary[] | undefined;

      if (code === "acsc_e8_2023" && inForceReqs.length > 0) {
        const byStrategy = new Map<
          string,
          {
            ml1: RequirementStatus[];
            ml2: RequirementStatus[];
            ml3: RequirementStatus[];
            conflict: boolean;
          }
        >();
        for (const r of inForceReqs) {
          const strategy = String(r.domain);
          const entry = byStrategy.get(strategy) || {
            ml1: [],
            ml2: [],
            ml3: [],
            conflict: false,
          };
          const st = (r.assessed_status as RequirementStatus | null) || "NotMet";
          const lvl = String(r.level_or_category || "");
          if (lvl === "ML1") entry.ml1.push(st);
          else if (lvl === "ML2") entry.ml2.push(st);
          else if (lvl === "ML3") entry.ml3.push(st);
          if (r.has_conflict) entry.conflict = true;
          byStrategy.set(strategy, entry);
        }

        e8Strategies = [];
        let minRank = 3;
        for (const [strategy, st] of Array.from(byStrategy.entries())) {
          const s1 = summariseLevelStatuses(st.ml1);
          const s2 = summariseLevelStatuses(st.ml2);
          const s3 = summariseLevelStatuses(st.ml3);

          let achieved: E8AchievedLevel = "ML0";
          if (s1.allSatisfied) {
            achieved = "ML1";
            if (s2.allSatisfied) {
              achieved = "ML2";
              if (s3.allSatisfied) {
                achieved = "ML3";
              }
            }
          }
          minRank = Math.min(minRank, levelOrder[achieved]);
          e8Strategies.push({
            strategy,
            achievedLevel: achieved,
            ml1Status: s1.status,
            ml2Status: s2.status,
            ml3Status: s3.status,
            ml1Met: s1.satisfiedCount,
            ml1Total: st.ml1.length,
            ml2Met: s2.satisfiedCount,
            ml2Total: st.ml2.length,
            ml3Met: s3.satisfiedCount,
            ml3Total: st.ml3.length,
            hasRubricConflict: st.conflict,
          });
        }
        weakestLinkMaturity = levelByRank[minRank] ?? "ML0";
      }

      return {
        id,
        code,
        name: String(fw.name),
        shortName: String(fw.short_name),
        version: String(fw.version),
        jurisdiction: fw.jurisdiction != null ? String(fw.jurisdiction) : "International",
        instrumentId: fw.instrument_id != null ? String(fw.instrument_id) : null,
        sourceUrl: fw.source_url != null ? String(fw.source_url) : null,
        effectiveDate: fw.effective_date != null ? String(fw.effective_date) : null,
        transitionNote: fw.transition_note != null ? String(fw.transition_note) : null,
        scoringMode: fw.scoring_mode as FrameworkScoringMode,
        supportTier: fw.support_tier as FrameworkSupportTier,
        description: String(fw.description),
        sortOrder: Number(fw.sort_order),
        enabled: fw.enabled != null ? Boolean(fw.enabled) : code === "iso27001_2022",
        targetLevel: fw.target_level != null ? String(fw.target_level) : null,
        notes: fw.notes != null ? String(fw.notes) : null,
        totalRequirements: inForceReqs.length,
        totalQuestions: code === "iso27001_2022" ? totalIsoQuestions : undefined,
        draftCount,
        driftCount,
        metCount,
        partiallyMetCount,
        notMetCount,
        notApplicableCount,
        readinessPercentage,
        weakestLinkMaturity,
        e8Strategies,
        upcomingDeadlines: upcomingDeadlines.length > 0 ? upcomingDeadlines : undefined,
      };
    });
  },

  getFrameworkDetail(workspaceId: number, code: string): FrameworkDetailResponse | null {
    const summary = frameworksRepository.listFrameworks(workspaceId).find((f) => f.code === code);
    if (!summary) return null;

    const db = getDb();
    const controls = controlsRepository.listControlsWithStatus(workspaceId);
    const controlById = new Map<number, ControlSummary>();
    for (const c of controls) controlById.set(c.id, c);

    const reqRows = db
      .prepare(`
        SELECT fr.*,
               wra.status AS a_status,
               wra.notes AS a_notes,
               wra.evidence_summary AS a_evidence_summary,
               wra.owner AS a_owner,
               wra.target_date AS a_target_date,
               wra.assessed_at AS a_assessed_at
        FROM framework_requirements fr
        LEFT JOIN workspace_requirement_assessments wra
          ON wra.requirement_id = fr.id AND wra.workspace_id = ?
        WHERE fr.framework_id = ?
        ORDER BY fr.sort_order ASC
      `)
      .all(workspaceId, summary.id) as Array<Record<string, unknown>>;

    const mapRows = db
      .prepare(`
        SELECT cfm.*
        FROM control_framework_mappings cfm
        JOIN framework_requirements fr ON fr.id = cfm.requirement_id
        WHERE fr.framework_id = ?
      `)
      .all(summary.id) as Array<Record<string, unknown>>;

    const mapsByReq = new Map<number, FrameworkControlLink[]>();
    for (const m of mapRows) {
      const reqId = Number(m.requirement_id);
      const ctrl = controlById.get(Number(m.control_id));
      if (!ctrl) continue;
      const arr = mapsByReq.get(reqId) || [];
      arr.push({
        controlId: ctrl.id,
        controlNumber: ctrl.controlNumber,
        controlName: ctrl.name,
        coverage: m.coverage as MappingCoverage,
        mappingNotes: m.mapping_notes != null ? String(m.mapping_notes) : null,
        latestStatus: ctrl.latestTestRun?.status ?? null,
        implementationStatus: ctrl.workspaceControl.implementationStatus,
        questionnairePercentage: ctrl.questionnaireProgress.percentage,
      });
      mapsByReq.set(reqId, arr);
    }

    const evRows = db
      .prepare(`
        SELECT rel.*, d.title AS document_title, d.original_filename
        FROM requirement_evidence_links rel
        JOIN framework_requirements fr ON fr.id = rel.requirement_id
        LEFT JOIN documents d ON d.id = rel.document_id AND d.archived_at IS NULL
        WHERE rel.workspace_id = ? AND fr.framework_id = ?
        ORDER BY rel.created_at DESC, rel.id DESC
      `)
      .all(workspaceId, summary.id) as Array<Record<string, unknown>>;

    const evidenceByReq = new Map<number, RequirementEvidenceLink[]>();
    for (const ev of evRows) {
      const mapped = mapRequirementEvidence(ev);
      const arr = evidenceByReq.get(mapped.requirementId) || [];
      arr.push(mapped);
      evidenceByReq.set(mapped.requirementId, arr);
    }

    const histRows = db
      .prepare(`
        SELECT req_code, COUNT(*) AS cnt
        FROM requirement_assessment_log
        WHERE workspace_id = ? AND framework_code = ?
        GROUP BY req_code
      `)
      .all(workspaceId, code) as Array<{ req_code: string; cnt: number }>;
    const historyCountByCode = new Map<string, number>();
    for (const h of histRows) historyCountByCode.set(h.req_code, Number(h.cnt));

    const requirements: FrameworkRequirementItem[] = reqRows.map((r) => {
      const id = Number(r.id);
      const reqCode = String(r.req_code);
      const status = (r.a_status as RequirementStatus | null) || "NotMet";
      const assessedAt = r.a_assessed_at != null ? String(r.a_assessed_at) : null;
      const evidenceSummary = r.a_evidence_summary != null ? String(r.a_evidence_summary) : null;
      const linkedControls = mapsByReq.get(id) || [];
      const evidenceLinks = evidenceByReq.get(id) || [];
      const driftWarnings = computeDriftWarnings({
        status,
        assessedAt,
        evidenceSummary,
        evidenceCount: evidenceLinks.length,
        linkedControls: linkedControls.map((lc) => {
          const ctrl = controlById.get(lc.controlId);
          return {
            controlNumber: lc.controlNumber,
            controlName: lc.controlName,
            coverage: lc.coverage,
            latestStatus: lc.latestStatus,
            latestTestDate: ctrl?.latestTestRun?.testDate ?? null,
            isApplicable: ctrl ? ctrl.workspaceControl.isApplicable : true,
          };
        }),
      });
      return {
        id,
        frameworkId: Number(r.framework_id),
        reqCode,
        clauseRef: r.clause_ref != null ? String(r.clause_ref) : null,
        domain: String(r.domain),
        title: String(r.title),
        description: String(r.description),
        guidance: r.guidance != null ? String(r.guidance) : null,
        levelOrCategory: r.level_or_category != null ? String(r.level_or_category) : null,
        prescriptiveSla: safeJsonParse<Record<string, unknown> | null>(
          r.prescriptive_sla_json as string | null,
          null,
        ),
        deadlineDate: r.deadline_date != null ? String(r.deadline_date) : null,
        isDraft: Boolean(r.is_draft),
        evidenceExpected: r.evidence_expected != null ? String(r.evidence_expected) : null,
        sortOrder: Number(r.sort_order),
        assessment: {
          status,
          notes: r.a_notes != null ? String(r.a_notes) : null,
          evidenceSummary,
          owner: r.a_owner != null ? String(r.a_owner) : null,
          targetDate: r.a_target_date != null ? String(r.a_target_date) : null,
          assessedAt,
        },
        linkedControls,
        evidenceLinks,
        historyCount: historyCountByCode.get(reqCode) || 0,
        driftWarnings,
      };
    });

    return { ...summary, requirements };
  },

  updateWorkspaceFrameworkConfig(
    workspaceId: number,
    code: string,
    patch: { enabled?: boolean; targetLevel?: string | null; notes?: string | null },
  ): FrameworkSummary | null {
    const db = getDb();
    const fw = db.prepare("SELECT id, name, short_name FROM frameworks WHERE code = ?").get(code) as
      | { id: number; name: string; short_name: string }
      | undefined;
    if (!fw) return null;

    const existing = db
      .prepare("SELECT * FROM workspace_frameworks WHERE workspace_id = ? AND framework_id = ?")
      .get(workspaceId, fw.id) as Record<string, unknown> | undefined;

    const nextEnabled =
      code === "iso27001_2022"
        ? 1
        : patch.enabled !== undefined
          ? patch.enabled
            ? 1
            : 0
          : existing
            ? Number(existing.enabled)
            : 1;
    const nextTarget =
      patch.targetLevel !== undefined
        ? patch.targetLevel
        : existing?.target_level != null
          ? String(existing.target_level)
          : code === "acsc_e8_2023"
            ? "ML1"
            : null;
    const nextNotes =
      patch.notes !== undefined
        ? patch.notes
        : existing?.notes != null
          ? String(existing.notes)
          : null;

    db.prepare(`
      INSERT INTO workspace_frameworks (workspace_id, framework_id, enabled, target_level, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, framework_id) DO UPDATE SET
        enabled = excluded.enabled,
        target_level = excluded.target_level,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(workspaceId, fw.id, nextEnabled, nextTarget, nextNotes, new Date().toISOString());

    const label = FRAMEWORK_LABEL_BY_CODE[code];
    if (label) {
      const profile = workspaceRepository.getProfile(workspaceId);
      const set = new Set(profile.regulatoryRequirements);
      if (nextEnabled) set.add(label);
      else set.delete(label);
      workspaceRepository.updateProfile(workspaceId, { regulatoryRequirements: Array.from(set) });
    }

    return frameworksRepository.listFrameworks(workspaceId).find((f) => f.code === code) || null;
  },

  updateRequirementAssessment(
    workspaceId: number,
    frameworkCode: string,
    reqCode: string,
    patch: {
      status: RequirementStatus;
      notes?: string | null;
      evidenceSummary?: string | null;
      owner?: string | null;
      targetDate?: string | null;
    },
  ): FrameworkRequirementItem | null {
    const db = getDb();
    const row = db
      .prepare(`
        SELECT fr.id
        FROM framework_requirements fr
        JOIN frameworks f ON f.id = fr.framework_id
        WHERE f.code = ? AND fr.req_code = ?
      `)
      .get(frameworkCode, reqCode) as { id: number } | undefined;
    if (!row) return null;

    const now = new Date().toISOString();
    const existing = db
      .prepare(
        "SELECT * FROM workspace_requirement_assessments WHERE workspace_id = ? AND requirement_id = ?",
      )
      .get(workspaceId, row.id) as Record<string, unknown> | undefined;

    const prevStatus = existing ? (String(existing.status) as RequirementStatus) : null;
    const nextNotes =
      patch.notes !== undefined
        ? patch.notes
        : existing?.notes != null
          ? String(existing.notes)
          : null;
    const nextEvidence =
      patch.evidenceSummary !== undefined
        ? patch.evidenceSummary
        : existing?.evidence_summary != null
          ? String(existing.evidence_summary)
          : null;
    const nextOwner =
      patch.owner !== undefined
        ? patch.owner
        : existing?.owner != null
          ? String(existing.owner)
          : null;
    const nextTargetDate =
      patch.targetDate !== undefined
        ? patch.targetDate
        : existing?.target_date != null
          ? String(existing.target_date)
          : null;

    db.exec("BEGIN");
    try {
      db.prepare(`
        INSERT INTO workspace_requirement_assessments (
          workspace_id, requirement_id, status, notes, evidence_summary, owner, target_date, assessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, requirement_id) DO UPDATE SET
          status = excluded.status,
          notes = excluded.notes,
          evidence_summary = excluded.evidence_summary,
          owner = excluded.owner,
          target_date = excluded.target_date,
          assessed_at = excluded.assessed_at
      `).run(
        workspaceId,
        row.id,
        patch.status,
        nextNotes,
        nextEvidence,
        nextOwner,
        nextTargetDate,
        now,
      );

      db.prepare(`
        INSERT INTO requirement_assessment_log (
          workspace_id, framework_code, req_code, previous_status, new_status,
          notes, evidence_summary, owner, target_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        workspaceId,
        frameworkCode,
        reqCode,
        prevStatus,
        patch.status,
        nextNotes,
        nextEvidence,
        nextOwner,
        nextTargetDate,
        now,
      );

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    const detail = frameworksRepository.getFrameworkDetail(workspaceId, frameworkCode);
    return detail?.requirements.find((r) => r.reqCode === reqCode) || null;
  },

  listRequirementHistory(
    workspaceId: number,
    frameworkCode: string,
    reqCode: string,
    limit = 50,
  ): RequirementAssessmentLogEntry[] {
    return (
      getDb()
        .prepare(`
          SELECT * FROM requirement_assessment_log
          WHERE workspace_id = ? AND framework_code = ? AND req_code = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `)
        .all(workspaceId, frameworkCode, reqCode, limit) as Array<Record<string, unknown>>
    ).map(mapRequirementLog);
  },

  addRequirementEvidence(params: {
    workspaceId: number;
    frameworkCode: string;
    reqCode: string;
    documentId?: number | null;
    title: string;
    url?: string | null;
    evidenceType?: EvidenceType | null;
  }): RequirementEvidenceLink | null {
    const db = getDb();
    const reqRow = db
      .prepare(`
        SELECT fr.id
        FROM framework_requirements fr
        JOIN frameworks f ON f.id = fr.framework_id
        WHERE f.code = ? AND fr.req_code = ?
      `)
      .get(params.frameworkCode, params.reqCode) as { id: number } | undefined;
    if (!reqRow) return null;

    if (params.documentId != null) {
      const doc = evidenceRepository.getDocument(params.workspaceId, params.documentId);
      if (!doc) return null;
    }

    const res = db
      .prepare(`
        INSERT INTO requirement_evidence_links (
          workspace_id, requirement_id, document_id, title, url, evidence_type
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.workspaceId,
        reqRow.id,
        params.documentId ?? null,
        params.title,
        params.url ?? null,
        params.evidenceType ?? null,
      );

    const inserted = db
      .prepare(`
        SELECT rel.*, d.title AS document_title, d.original_filename
        FROM requirement_evidence_links rel
        LEFT JOIN documents d ON d.id = rel.document_id
        WHERE rel.id = ?
      `)
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapRequirementEvidence(inserted);
  },

  deleteRequirementEvidence(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM requirement_evidence_links WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },
};
