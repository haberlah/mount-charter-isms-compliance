import type {
  AiInteraction,
  DocumentQuestionMatch,
  EvidenceLink,
  InteractionType,
  RequirementAssessmentLogEntry,
  ResponseChangeLogEntry,
  TestRun,
  TestRunWithControl,
  TestStatus,
} from "@shared/schema";
import { getDb } from "../db";
import { mapEvidenceLink, mapMatch, mapRequirementLog, mapTestRun, safeJsonParse } from "./common";
import { controlsRepository } from "./controls";

export const auditRepository = {
  createTestRun(params: {
    workspaceId: number;
    workspaceControlId: number;
    status: TestStatus;
    comments?: string | null;
    aiAnalysis?: string | null;
    aiSuggestedStatus?: TestStatus | null;
    aiConfidence?: number | null;
    aiContextScope?: TestRun["aiContextScope"];
  }): TestRun {
    const db = getDb();
    const wc = controlsRepository.getWorkspaceControlById(
      params.workspaceId,
      params.workspaceControlId,
    );
    if (!wc) throw new Error("Workspace control not found");
    const now = new Date().toISOString();
    const res = db
      .prepare(`
        INSERT INTO test_runs (
          workspace_id, workspace_control_id, test_date, status, comments,
          ai_analysis, ai_suggested_status, ai_confidence, ai_context_scope, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.workspaceId,
        params.workspaceControlId,
        now,
        params.status,
        params.comments ?? null,
        params.aiAnalysis ?? null,
        params.aiSuggestedStatus ?? null,
        params.aiConfidence ?? null,
        params.aiContextScope ?? null,
        now,
      );
    const row = db
      .prepare("SELECT * FROM test_runs WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapTestRun(row);
  },

  listTestRuns(
    workspaceId: number,
    limit = 200,
    filters?: { status?: string; controlNumber?: string; offset?: number },
  ): TestRunWithControl[] {
    const db = getDb();
    const where = ["tr.workspace_id = ?"];
    const params: Array<string | number> = [workspaceId];
    if (filters?.status && filters.status !== "all") {
      where.push("tr.status = ?");
      params.push(filters.status);
    }
    if (filters?.controlNumber?.trim()) {
      where.push("c.control_number = ?");
      params.push(filters.controlNumber.trim());
    }
    params.push(limit);
    const offset = Math.max(0, filters?.offset ?? 0);
    params.push(offset);

    const rows = db
      .prepare(`
        SELECT tr.*, c.control_number, c.name AS control_name, cat.name AS category_name
        FROM test_runs tr
        JOIN workspace_controls wc ON wc.id = tr.workspace_control_id
        JOIN controls c ON c.id = wc.control_id
        JOIN control_categories cat ON cat.id = c.category_id
        WHERE ${where.join(" AND ")}
        ORDER BY tr.test_date DESC, tr.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params) as Array<Record<string, unknown>>;

    const linksByRun = new Map<number, EvidenceLink[]>();
    if (rows.length > 0) {
      const linkRows = db
        .prepare(
          "SELECT * FROM evidence_links WHERE workspace_id = ? AND test_run_id IS NOT NULL ORDER BY created_at DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>;
      for (const lr of linkRows) {
        const mapped = mapEvidenceLink(lr);
        if (mapped.testRunId != null) {
          const arr = linksByRun.get(mapped.testRunId) || [];
          arr.push(mapped);
          linksByRun.set(mapped.testRunId, arr);
        }
      }
    }

    return rows.map((r) => {
      const run = mapTestRun(r);
      return {
        ...run,
        controlNumber: String(r.control_number),
        controlName: String(r.control_name),
        categoryName: String(r.category_name),
        evidenceLinks: linksByRun.get(run.id) || [],
      };
    });
  },

  logAiInteraction(params: {
    workspaceId: number;
    interactionType: InteractionType;
    controlId?: number | null;
    testRunId?: number | null;
    inputSummary?: string | null;
    outputSummary?: string | null;
    modelUsed: string;
    tokensUsed: number;
  }): void {
    getDb()
      .prepare(`
        INSERT INTO ai_interactions (
          workspace_id, interaction_type, control_id, test_run_id,
          input_summary, output_summary, model_used, tokens_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.workspaceId,
        params.interactionType,
        params.controlId ?? null,
        params.testRunId ?? null,
        params.inputSummary ?? null,
        params.outputSummary ?? null,
        params.modelUsed,
        params.tokensUsed,
      );
  },

  getTokensUsedToday(workspaceId: number): number {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const row = getDb()
      .prepare(
        "SELECT COALESCE(SUM(tokens_used), 0) AS total FROM ai_interactions WHERE workspace_id = ? AND created_at >= ?",
      )
      .get(workspaceId, `${todayPrefix}T00:00:00.000Z`) as { total: number };
    return Number(row?.total || 0);
  },

  listAiInteractions(workspaceId: number, limit = 100): AiInteraction[] {
    return (
      getDb()
        .prepare(`
          SELECT ai.*, c.control_number
          FROM ai_interactions ai
          LEFT JOIN controls c ON c.id = ai.control_id
          WHERE ai.workspace_id = ?
          ORDER BY ai.created_at DESC, ai.id DESC
          LIMIT ?
        `)
        .all(workspaceId, limit) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      workspaceId: Number(r.workspace_id),
      interactionType: r.interaction_type as InteractionType,
      controlId: r.control_id != null ? Number(r.control_id) : null,
      controlNumber: r.control_number != null ? String(r.control_number) : null,
      testRunId: r.test_run_id != null ? Number(r.test_run_id) : null,
      inputSummary: r.input_summary != null ? String(r.input_summary) : null,
      outputSummary: r.output_summary != null ? String(r.output_summary) : null,
      modelUsed: String(r.model_used),
      tokensUsed: Number(r.tokens_used || 0),
      createdAt: String(r.created_at),
    }));
  },

  listAllQuestionResponses(workspaceId: number): Array<{
    controlNumber: string;
    controlName: string;
    questionId: number;
    responseText: string;
    evidenceReferences: string[];
    updatedAt: string;
  }> {
    return (
      getDb()
        .prepare(`
          SELECT c.control_number, c.name AS control_name, qr.question_id,
                 qr.response_text, qr.evidence_references_json, qr.updated_at
          FROM question_responses qr
          JOIN workspace_controls wc ON wc.id = qr.workspace_control_id
          JOIN controls c ON c.id = wc.control_id
          WHERE qr.workspace_id = ? AND TRIM(qr.response_text) != ''
          ORDER BY c.id ASC, qr.question_id ASC
        `)
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map((r) => ({
      controlNumber: String(r.control_number),
      controlName: String(r.control_name),
      questionId: Number(r.question_id),
      responseText: String(r.response_text),
      evidenceReferences: safeJsonParse<string[]>(r.evidence_references_json as string, []),
      updatedAt: String(r.updated_at),
    }));
  },

  listAllResponseChangeLogs(
    workspaceId: number,
  ): Array<ResponseChangeLogEntry & { controlNumber: string }> {
    return (
      getDb()
        .prepare(`
          SELECT rcl.*, c.control_number
          FROM response_change_log rcl
          JOIN workspace_controls wc ON wc.id = rcl.workspace_control_id
          JOIN controls c ON c.id = wc.control_id
          WHERE rcl.workspace_id = ?
          ORDER BY rcl.created_at DESC, rcl.id DESC
        `)
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      workspaceId: Number(r.workspace_id),
      workspaceControlId: Number(r.workspace_control_id),
      controlNumber: String(r.control_number),
      questionId: Number(r.question_id),
      previousResponse: r.previous_response != null ? String(r.previous_response) : null,
      newResponse: String(r.new_response),
      changeSource: String(r.change_source),
      sourceDocumentId: r.source_document_id != null ? Number(r.source_document_id) : null,
      sourceMatchId: r.source_match_id != null ? Number(r.source_match_id) : null,
      createdAt: String(r.created_at),
    }));
  },

  listAllAcceptedMatches(workspaceId: number): DocumentQuestionMatch[] {
    return (
      getDb()
        .prepare(`
          SELECT m.*, d.title AS document_title, d.original_filename,
                 c.control_number, c.name AS control_name
          FROM document_question_matches m
          JOIN documents d ON d.id = m.document_id
          JOIN workspace_controls wc ON wc.id = m.workspace_control_id
          JOIN controls c ON c.id = wc.control_id
          WHERE m.workspace_id = ? AND m.user_accepted = 1
          ORDER BY m.accepted_at DESC, m.id DESC
        `)
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapMatch);
  },

  listAllRequirementAssessmentLogs(workspaceId: number): RequirementAssessmentLogEntry[] {
    return (
      getDb()
        .prepare(`
          SELECT * FROM requirement_assessment_log
          WHERE workspace_id = ?
          ORDER BY created_at DESC, id DESC
        `)
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapRequirementLog);
  },
};
