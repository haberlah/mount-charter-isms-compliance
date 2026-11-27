import { createHash } from "node:crypto";
import type {
  Control,
  ControlCategory,
  ControlDetailResponse,
  ControlFrameworkContext,
  ControlFrequency,
  ControlOrgGuide,
  ControlQuestionnaire,
  ControlStartQuarter,
  ControlSummary,
  ControlUrgency,
  DocumentStatus,
  ImplementationStatus,
  MappingCoverage,
  Persona,
  QuestionResponse,
  TestRun,
  TestStatus,
  WorkspaceControl,
  WorkspaceProfile,
} from "@shared/schema";
import {
  calculateNextDueDate,
  getControlScheduleDefaults,
  getEffectiveControlFrequency,
  getEffectiveStartQuarter,
} from "../control-schedule";
import { getDb } from "../db";
import {
  mapControl,
  mapDocument,
  mapEvidenceLink,
  mapMatch,
  mapTestRun,
  mapWorkspaceControl,
  safeJsonParse,
} from "./common";
import { governanceRepository } from "./governance";
import { workspaceRepository } from "./workspaces";

export function computeProfileHash(
  profile: WorkspaceProfile | null,
  enabledFrameworkCodes: string[],
): string {
  const payload = JSON.stringify({
    companyName: profile?.companyName ?? "",
    industry: profile?.industry ?? "",
    companySize: profile?.companySize ?? "",
    techStack: profile?.techStack ?? "",
    deploymentModel: profile?.deploymentModel ?? "",
    riskAppetite: profile?.riskAppetite ?? "Moderate",
    additionalContext: profile?.additionalContext ?? "",
    frameworks: [...enabledFrameworkCodes].sort(),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export const controlsRepository = {
  listCategories(): ControlCategory[] {
    return (
      getDb()
        .prepare("SELECT id, name, sort_order FROM control_categories ORDER BY sort_order ASC")
        .all() as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      sortOrder: Number(r.sort_order),
    }));
  },

  getControlByNumber(controlNumber: string): (Control & { category: ControlCategory }) | null {
    const row = getDb()
      .prepare(`
        SELECT c.*, cat.name as cat_name, cat.sort_order as cat_sort
        FROM controls c
        JOIN control_categories cat ON cat.id = c.category_id
        WHERE c.control_number = ?
      `)
      .get(controlNumber) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      ...mapControl(row),
      category: {
        id: Number(row.category_id),
        name: String(row.cat_name),
        sortOrder: Number(row.cat_sort),
      },
    };
  },

  ensureWorkspaceControl(workspaceId: number, controlId: number): WorkspaceControl {
    const db = getDb();
    let row = db
      .prepare("SELECT * FROM workspace_controls WHERE workspace_id = ? AND control_id = ?")
      .get(workspaceId, controlId) as Record<string, unknown> | undefined;
    if (!row) {
      const profile = workspaceRepository.getProfile(workspaceId);
      const defaults = getControlScheduleDefaults(profile);
      const ctrl = db
        .prepare("SELECT default_frequency, start_quarter FROM controls WHERE id = ?")
        .get(controlId) as
        | { default_frequency: ControlFrequency | null; start_quarter: ControlStartQuarter | null }
        | undefined;
      const freq = defaults.frequency ?? ctrl?.default_frequency ?? "Annual";
      const quarter = defaults.startQuarter ?? ctrl?.start_quarter ?? "Q1";
      const due = calculateNextDueDate(freq, quarter);
      db.prepare(`
        INSERT OR IGNORE INTO workspace_controls (
          workspace_id, control_id, frequency, start_quarter, is_applicable, next_due_date, selected_persona, selected_urgency
        ) VALUES (?, ?, ?, ?, 1, ?, 'Auditor', 'later')
      `).run(workspaceId, controlId, freq, quarter, due);
      row = db
        .prepare("SELECT * FROM workspace_controls WHERE workspace_id = ? AND control_id = ?")
        .get(workspaceId, controlId) as Record<string, unknown>;
    }
    return mapWorkspaceControl(row);
  },

  getWorkspaceControlById(
    workspaceId: number,
    workspaceControlId: number,
  ): WorkspaceControl | null {
    const row = getDb()
      .prepare("SELECT * FROM workspace_controls WHERE id = ? AND workspace_id = ?")
      .get(workspaceControlId, workspaceId) as Record<string, unknown> | undefined;
    return row ? mapWorkspaceControl(row) : null;
  },

  updateWorkspaceControl(
    workspaceId: number,
    controlId: number,
    patch: Partial<{
      frequency: ControlFrequency | null;
      startQuarter: ControlStartQuarter | null;
      isApplicable: boolean;
      inclusionJustification: string | null;
      exclusionJustification: string | null;
      implementationStatus: ImplementationStatus;
      selectedPersona: Persona;
      selectedUrgency: ControlUrgency;
    }>,
  ): WorkspaceControl {
    const db = getDb();
    const current = controlsRepository.ensureWorkspaceControl(workspaceId, controlId);
    const nextFreq = patch.frequency !== undefined ? patch.frequency : current.frequency;
    const nextQuarter =
      patch.startQuarter !== undefined ? patch.startQuarter : current.startQuarter;
    const nextApplicable =
      patch.isApplicable !== undefined ? patch.isApplicable : current.isApplicable;
    const nextInclusion =
      patch.inclusionJustification !== undefined
        ? patch.inclusionJustification
        : current.inclusionJustification;
    const nextJustification = nextApplicable
      ? null
      : patch.exclusionJustification !== undefined
        ? patch.exclusionJustification
        : current.exclusionJustification;
    const nextImplStatus = patch.implementationStatus ?? current.implementationStatus;
    const nextDue = nextApplicable ? calculateNextDueDate(nextFreq, nextQuarter) : null;

    db.prepare(`
      UPDATE workspace_controls SET
        frequency = ?,
        start_quarter = ?,
        is_applicable = ?,
        inclusion_justification = ?,
        exclusion_justification = ?,
        implementation_status = ?,
        next_due_date = ?,
        selected_persona = ?,
        selected_urgency = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      nextFreq,
      nextQuarter,
      nextApplicable ? 1 : 0,
      nextInclusion,
      nextJustification,
      nextImplStatus,
      nextDue,
      patch.selectedPersona ?? current.selectedPersona,
      patch.selectedUrgency ?? current.selectedUrgency,
      current.id,
      workspaceId,
    );

    return controlsRepository.getWorkspaceControlById(workspaceId, current.id)!;
  },

  saveControlQuestionnaire(controlId: number, questionnaire: ControlQuestionnaire): void {
    getDb()
      .prepare(
        "UPDATE controls SET questionnaire_json = ?, questionnaire_generated_at = ?, questionnaire_source = 'ai_generated' WHERE id = ?",
      )
      .run(JSON.stringify(questionnaire), new Date().toISOString(), controlId);
  },

  getControlOrgGuide(
    workspaceId: number,
    controlId: number,
    profileHash: string,
  ): ControlOrgGuide | null {
    const row = getDb()
      .prepare(
        `SELECT * FROM control_org_guides
         WHERE workspace_id = ? AND control_id = ? AND profile_hash = ?`,
      )
      .get(workspaceId, controlId, profileHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      workspaceId: Number(row.workspace_id),
      controlId: Number(row.control_id),
      profileHash: String(row.profile_hash),
      contentMarkdown: String(row.content_markdown),
      modelUsed: String(row.model_used),
      provider: row.provider != null ? String(row.provider) : null,
      generatedAt: String(row.generated_at),
    };
  },

  saveControlOrgGuide(params: {
    workspaceId: number;
    controlId: number;
    profileHash: string;
    contentMarkdown: string;
    modelUsed: string;
    provider?: string | null;
  }): ControlOrgGuide {
    const now = new Date().toISOString();
    getDb()
      .prepare(`
        INSERT INTO control_org_guides (
          workspace_id, control_id, profile_hash, content_markdown, model_used, provider, generated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, control_id, profile_hash) DO UPDATE SET
          content_markdown = excluded.content_markdown,
          model_used = excluded.model_used,
          provider = excluded.provider,
          generated_at = excluded.generated_at
      `)
      .run(
        params.workspaceId,
        params.controlId,
        params.profileHash,
        params.contentMarkdown,
        params.modelUsed,
        params.provider ?? null,
        now,
      );
    return controlsRepository.getControlOrgGuide(
      params.workspaceId,
      params.controlId,
      params.profileHash,
    )!;
  },

  listControlsWithStatus(workspaceId: number): ControlSummary[] {
    const db = getDb();
    const profile = workspaceRepository.getProfile(workspaceId);
    const defaults = getControlScheduleDefaults(profile);

    db.prepare(`
      INSERT OR IGNORE INTO workspace_controls (
        workspace_id, control_id, frequency, start_quarter, is_applicable, selected_persona, selected_urgency
      )
      SELECT ?, id, COALESCE(?, default_frequency), COALESCE(?, start_quarter), 1, 'Auditor', 'later'
      FROM controls
    `).run(workspaceId, defaults.frequency, defaults.startQuarter);

    const rows = db
      .prepare(`
        WITH latest_runs AS (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY workspace_control_id ORDER BY test_date DESC, id DESC) AS rn
          FROM test_runs
          WHERE workspace_id = ?
        ),
        resp_counts AS (
          SELECT qr.workspace_control_id,
                 COUNT(DISTINCT qr.question_id) AS answered_count
          FROM question_responses qr
          JOIN workspace_controls wc2 ON wc2.id = qr.workspace_control_id
          JOIN controls c2 ON c2.id = wc2.control_id
          WHERE qr.workspace_id = ?
            AND TRIM(qr.response_text) != ''
            AND EXISTS (
              SELECT 1 FROM json_each(c2.questionnaire_json, '$.questions') jq
              WHERE CAST(json_extract(jq.value, '$.question_id') AS INTEGER) = qr.question_id
            )
          GROUP BY qr.workspace_control_id
        ),
        doc_counts AS (
          SELECT dcl.workspace_control_id, COUNT(*) AS doc_count
          FROM document_control_links dcl
          JOIN documents d ON d.id = dcl.document_id AND d.archived_at IS NULL
          WHERE dcl.workspace_id = ?
          GROUP BY dcl.workspace_control_id
        ),
        ev_counts AS (
          SELECT workspace_control_id, COUNT(*) AS ev_count
          FROM evidence_links
          WHERE workspace_id = ? AND workspace_control_id IS NOT NULL
          GROUP BY workspace_control_id
        ),
        pending_matches AS (
          SELECT m.workspace_control_id, COUNT(*) AS pending_count
          FROM document_question_matches m
          JOIN documents d ON d.id = m.document_id AND d.archived_at IS NULL
          WHERE m.workspace_id = ? AND m.is_active = 1 AND m.user_accepted IS NULL AND m.composite_score >= 0.5
          GROUP BY m.workspace_control_id
        )
        SELECT
          c.*,
          cat.name AS cat_name,
          cat.sort_order AS cat_sort,
          wc.id AS wc_id,
          wc.workspace_id AS wc_workspace_id,
          wc.frequency AS wc_frequency,
          wc.start_quarter AS wc_start_quarter,
          wc.is_applicable AS wc_is_applicable,
          wc.inclusion_justification AS wc_inclusion_justification,
          wc.exclusion_justification AS wc_exclusion_justification,
          wc.implementation_status AS wc_implementation_status,
          wc.next_due_date AS wc_next_due_date,
          wc.selected_persona AS wc_selected_persona,
          wc.selected_urgency AS wc_selected_urgency,
          wc.implementation_updated_at AS wc_implementation_updated_at,
          lr.id AS lr_id,
          lr.test_date AS lr_test_date,
          lr.status AS lr_status,
          lr.comments AS lr_comments,
          lr.ai_analysis AS lr_ai_analysis,
          lr.ai_suggested_status AS lr_ai_suggested_status,
          lr.ai_confidence AS lr_ai_confidence,
          lr.ai_context_scope AS lr_ai_context_scope,
          lr.created_at AS lr_created_at,
          COALESCE(rc.answered_count, 0) AS answered_count,
          COALESCE(dc.doc_count, 0) AS doc_count,
          COALESCE(ec.ev_count, 0) AS ev_count,
          COALESCE(pm.pending_count, 0) AS pending_count
        FROM controls c
        JOIN control_categories cat ON cat.id = c.category_id
        JOIN workspace_controls wc ON wc.control_id = c.id AND wc.workspace_id = ?
        LEFT JOIN latest_runs lr ON lr.workspace_control_id = wc.id AND lr.rn = 1
        LEFT JOIN resp_counts rc ON rc.workspace_control_id = wc.id
        LEFT JOIN doc_counts dc ON dc.workspace_control_id = wc.id
        LEFT JOIN ev_counts ec ON ec.workspace_control_id = wc.id
        LEFT JOIN pending_matches pm ON pm.workspace_control_id = wc.id
        ORDER BY cat.sort_order ASC, c.id ASC
      `)
      .all(workspaceId, workspaceId, workspaceId, workspaceId, workspaceId, workspaceId) as Array<
      Record<string, unknown>
    >;

    const riskCodesByControl = governanceRepository.listRiskCodesByControl(workspaceId);

    return rows.map((r) => {
      const ctrl = mapControl(r);
      const totalQ = ctrl.aiQuestionnaire?.questions.length ?? 0;
      const answered = Math.min(totalQ, Number(r.answered_count || 0));
      const wc: WorkspaceControl = {
        id: Number(r.wc_id),
        workspaceId: Number(r.wc_workspace_id),
        controlId: ctrl.id,
        frequency: (r.wc_frequency as ControlFrequency | null) ?? null,
        startQuarter: (r.wc_start_quarter as ControlStartQuarter | null) ?? null,
        isApplicable: Boolean(r.wc_is_applicable),
        inclusionJustification:
          r.wc_inclusion_justification != null ? String(r.wc_inclusion_justification) : null,
        exclusionJustification:
          r.wc_exclusion_justification != null ? String(r.wc_exclusion_justification) : null,
        implementationStatus:
          (r.wc_implementation_status as ImplementationStatus) || "NotImplemented",
        nextDueDate: r.wc_next_due_date != null ? String(r.wc_next_due_date) : null,
        selectedPersona: (r.wc_selected_persona as Persona) || "Auditor",
        selectedUrgency: (r.wc_selected_urgency as ControlUrgency) || "later",
        implementationUpdatedAt: r.wc_implementation_updated_at
          ? String(r.wc_implementation_updated_at)
          : null,
      };
      const effFreq = getEffectiveControlFrequency(ctrl, wc, defaults);
      const effQuarter = getEffectiveStartQuarter(ctrl, wc, defaults);
      if (wc.isApplicable && !wc.nextDueDate && effFreq) {
        wc.nextDueDate = calculateNextDueDate(effFreq, effQuarter);
      }
      const latestTestRun: TestRun | null = r.lr_id
        ? {
            id: Number(r.lr_id),
            workspaceId,
            workspaceControlId: wc.id,
            testDate: String(r.lr_test_date),
            status: r.lr_status as TestStatus,
            comments: r.lr_comments != null ? String(r.lr_comments) : null,
            aiAnalysis: r.lr_ai_analysis != null ? String(r.lr_ai_analysis) : null,
            aiSuggestedStatus: (r.lr_ai_suggested_status as TestStatus | null) ?? null,
            aiConfidence: r.lr_ai_confidence != null ? Number(r.lr_ai_confidence) : null,
            aiContextScope: (r.lr_ai_context_scope as TestRun["aiContextScope"]) ?? null,
            createdAt: String(r.lr_created_at),
          }
        : null;

      return {
        ...ctrl,
        category: {
          id: ctrl.categoryId,
          name: String(r.cat_name),
          sortOrder: Number(r.cat_sort),
        },
        workspaceControl: wc,
        latestTestRun,
        questionnaireProgress: {
          total: totalQ,
          answered,
          percentage: totalQ > 0 ? Math.round((answered / totalQ) * 100) : 0,
        },
        linkedDocumentCount: Number(r.doc_count || 0),
        evidenceLinkCount: Number(r.ev_count || 0),
        pendingMatchCount: Number(r.pending_count || 0),
        linkedRiskCodes: riskCodesByControl.get(ctrl.controlNumber) || [],
      };
    });
  },

  getControlDetail(workspaceId: number, controlNumber: string): ControlDetailResponse | null {
    const summary = controlsRepository
      .listControlsWithStatus(workspaceId)
      .find((c) => c.controlNumber === controlNumber);
    if (!summary) return null;

    const db = getDb();
    const wcId = summary.workspaceControl.id;

    const responses = (
      db
        .prepare(
          "SELECT * FROM question_responses WHERE workspace_id = ? AND workspace_control_id = ? ORDER BY question_id ASC",
        )
        .all(workspaceId, wcId) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      question_id: Number(r.question_id),
      response_text: String(r.response_text),
      evidence_references: safeJsonParse<string[]>(r.evidence_references_json as string, []),
      last_updated: String(r.updated_at),
    }));

    const testRuns = (
      db
        .prepare(
          "SELECT * FROM test_runs WHERE workspace_id = ? AND workspace_control_id = ? ORDER BY test_date DESC, id DESC",
        )
        .all(workspaceId, wcId) as Array<Record<string, unknown>>
    ).map(mapTestRun);

    const evidenceLinks = (
      db
        .prepare(
          "SELECT * FROM evidence_links WHERE workspace_id = ? AND workspace_control_id = ? ORDER BY created_at DESC",
        )
        .all(workspaceId, wcId) as Array<Record<string, unknown>>
    ).map(mapEvidenceLink);

    const linkedDocuments = (
      db
        .prepare(`
          SELECT d.*, dcl.id AS link_id, dcl.analysis_status, dcl.analysis_completed_at
          FROM document_control_links dcl
          JOIN documents d ON d.id = dcl.document_id
          WHERE dcl.workspace_id = ? AND dcl.workspace_control_id = ? AND d.archived_at IS NULL
          ORDER BY dcl.created_at DESC
        `)
        .all(workspaceId, wcId) as Array<Record<string, unknown>>
    ).map((r) => ({
      ...mapDocument(r),
      linkId: Number(r.link_id),
      analysisStatus: (r.analysis_status as DocumentStatus) || "pending",
      analysisCompletedAt: r.analysis_completed_at ? String(r.analysis_completed_at) : null,
    }));

    const matches = (
      db
        .prepare(`
          SELECT m.*, d.title AS document_title, d.original_filename
          FROM document_question_matches m
          JOIN documents d ON d.id = m.document_id
          WHERE m.workspace_id = ? AND m.workspace_control_id = ? AND m.is_active = 1
            AND d.archived_at IS NULL AND m.composite_score >= 0.5
          ORDER BY m.composite_score DESC, m.id DESC
        `)
        .all(workspaceId, wcId) as Array<Record<string, unknown>>
    ).map(mapMatch);

    const changeLog = (
      db
        .prepare(`
          SELECT * FROM response_change_log
          WHERE workspace_id = ? AND workspace_control_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 50
        `)
        .all(workspaceId, wcId) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      workspaceId: Number(r.workspace_id),
      workspaceControlId: Number(r.workspace_control_id),
      questionId: Number(r.question_id),
      previousResponse: r.previous_response != null ? String(r.previous_response) : null,
      newResponse: String(r.new_response),
      changeSource: String(r.change_source),
      ontologyVersion: r.ontology_version != null ? String(r.ontology_version) : null,
      sourceDocumentId: r.source_document_id != null ? Number(r.source_document_id) : null,
      sourceMatchId: r.source_match_id != null ? Number(r.source_match_id) : null,
      createdAt: String(r.created_at),
    }));

    const enabledFwRows = db
      .prepare(`
        SELECT f.code
        FROM workspace_frameworks wf
        JOIN frameworks f ON f.id = wf.framework_id
        WHERE wf.workspace_id = ? AND wf.enabled = 1
        ORDER BY f.sort_order ASC
      `)
      .all(workspaceId) as Array<{ code: string }>;
    const enabledFrameworkCodes = enabledFwRows.map((r) => String(r.code));

    const activeFrameworkContext: ControlFrameworkContext[] = (
      db
        .prepare(`
          SELECT f.code AS framework_code,
                 f.short_name AS framework_short_name,
                 fr.req_code,
                 fr.clause_ref,
                 fr.title,
                 cfm.coverage,
                 cfm.mapping_notes,
                 fr.prescriptive_sla_json
          FROM control_framework_mappings cfm
          JOIN framework_requirements fr ON fr.id = cfm.requirement_id
          JOIN frameworks f ON f.id = fr.framework_id
          JOIN workspace_frameworks wf ON wf.framework_id = f.id
            AND wf.workspace_id = ? AND wf.enabled = 1
          WHERE cfm.control_id = ?
            AND fr.is_draft = 0
            AND f.code != 'iso27001_2022'
          ORDER BY
            CASE cfm.coverage
              WHEN 'rubric_conflict' THEN 1
              WHEN 'delta_required' THEN 2
              WHEN 'full' THEN 3
              ELSE 4
            END,
            f.sort_order ASC,
            fr.sort_order ASC
        `)
        .all(workspaceId, summary.id) as Array<Record<string, unknown>>
    ).map((r) => ({
      frameworkCode: String(r.framework_code),
      frameworkShortName: String(r.framework_short_name),
      reqCode: String(r.req_code),
      clauseRef: r.clause_ref != null ? String(r.clause_ref) : null,
      title: String(r.title),
      coverage: r.coverage as MappingCoverage,
      mappingNotes: r.mapping_notes != null ? String(r.mapping_notes) : null,
      prescriptiveSla: safeJsonParse<Record<string, unknown> | null>(
        r.prescriptive_sla_json as string | null,
        null,
      ),
    }));

    const profile = workspaceRepository.getProfile(workspaceId);
    const profileHash = computeProfileHash(profile, enabledFrameworkCodes);
    const orgGuide = controlsRepository.getControlOrgGuide(workspaceId, summary.id, profileHash);

    const legacyRow = db
      .prepare(
        "SELECT COUNT(*) AS cnt FROM legacy_question_responses WHERE workspace_id = ? AND workspace_control_id = ?",
      )
      .get(workspaceId, wcId) as { cnt: number } | undefined;

    return {
      ...summary,
      responses,
      testRuns,
      evidenceLinks,
      linkedDocuments,
      matches,
      changeLog,
      activeFrameworkContext,
      enabledFrameworkCodes,
      orgGuide,
      legacyResponsesCount: Number(legacyRow?.cnt || 0),
    };
  },

  saveQuestionResponse(params: {
    workspaceId: number;
    workspaceControlId: number;
    questionId: number;
    responseText: string;
    evidenceReferences?: string[];
    changeSource: "manual" | "ai_accepted" | "ai_edited";
    sourceDocumentId?: number | null;
    sourceMatchId?: number | null;
  }): QuestionResponse {
    const db = getDb();
    const wc = controlsRepository.getWorkspaceControlById(
      params.workspaceId,
      params.workspaceControlId,
    );
    if (!wc) throw new Error("Workspace control not found");

    const now = new Date().toISOString();
    const existing = db
      .prepare(
        "SELECT * FROM question_responses WHERE workspace_id = ? AND workspace_control_id = ? AND question_id = ?",
      )
      .get(params.workspaceId, params.workspaceControlId, params.questionId) as
      | Record<string, unknown>
      | undefined;

    const prevText = existing ? String(existing.response_text) : null;
    const refs =
      params.evidenceReferences ??
      (existing ? safeJsonParse<string[]>(existing.evidence_references_json as string, []) : []);

    db.exec("BEGIN");
    try {
      db.prepare(`
        INSERT INTO question_responses (
          workspace_id, workspace_control_id, question_id, response_text, evidence_references_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_control_id, question_id) DO UPDATE SET
          response_text = excluded.response_text,
          evidence_references_json = excluded.evidence_references_json,
          updated_at = excluded.updated_at
      `).run(
        params.workspaceId,
        params.workspaceControlId,
        params.questionId,
        params.responseText,
        JSON.stringify(refs),
        now,
      );

      db.prepare(
        "UPDATE workspace_controls SET implementation_updated_at = ? WHERE id = ? AND workspace_id = ?",
      ).run(now, params.workspaceControlId, params.workspaceId);

      if (prevText !== params.responseText) {
        db.prepare(`
          INSERT INTO response_change_log (
            workspace_id, workspace_control_id, question_id, previous_response, new_response,
            change_source, source_document_id, source_match_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          params.workspaceId,
          params.workspaceControlId,
          params.questionId,
          prevText,
          params.responseText,
          params.changeSource,
          params.sourceDocumentId ?? null,
          params.sourceMatchId ?? null,
          now,
        );
      }

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return {
      question_id: params.questionId,
      response_text: params.responseText,
      evidence_references: refs,
      last_updated: now,
    };
  },
};
