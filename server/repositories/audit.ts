import type {
  AgentProposal,
  AgentProposalStatus,
  AgentProposalTarget,
  AiInteraction,
  DocumentQuestionMatch,
  EvidenceLink,
  InteractionType,
  RequirementAssessmentLogEntry,
  RequirementStatus,
  ResponseChangeLogEntry,
  TestRun,
  TestRunWithControl,
  TestStatus,
} from "@shared/schema";
import { getDb } from "../db";
import { mapEvidenceLink, mapMatch, mapRequirementLog, mapTestRun, safeJsonParse } from "./common";
import { controlsRepository } from "./controls";
import { frameworksRepository } from "./frameworks";
import { governanceRepository } from "./governance";

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
    provider?: string | null;
    tokensUsed: number;
    promptTokens?: number;
    completionTokens?: number;
    costUsd?: number;
  }): void {
    getDb()
      .prepare(`
        INSERT INTO ai_interactions (
          workspace_id, interaction_type, control_id, test_run_id,
          input_summary, output_summary, model_used, provider,
          tokens_used, prompt_tokens, completion_tokens, cost_usd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.workspaceId,
        params.interactionType,
        params.controlId ?? null,
        params.testRunId ?? null,
        params.inputSummary ?? null,
        params.outputSummary ?? null,
        params.modelUsed,
        params.provider ?? null,
        params.tokensUsed,
        params.promptTokens ?? 0,
        params.completionTokens ?? 0,
        Number.isFinite(params.costUsd) ? Number(params.costUsd) : 0,
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

  getCostUsedTodayUsd(workspaceId: number): number {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const row = getDb()
      .prepare(
        "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_interactions WHERE workspace_id = ? AND created_at >= ?",
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
      provider: r.provider != null ? String(r.provider) : null,
      tokensUsed: Number(r.tokens_used || 0),
      promptTokens: Number(r.prompt_tokens || 0),
      completionTokens: Number(r.completion_tokens || 0),
      costUsd: Number(r.cost_usd || 0),
      createdAt: String(r.created_at),
    }));
  },

  // ─── Staged AI Agent Proposals (Human-Gated Approval Inbox) ────────────────

  createAgentProposal(params: {
    workspaceId: number;
    runId: string;
    runLabel: string;
    targetType: AgentProposalTarget;
    targetRef: string;
    title: string;
    summary: string;
    rationale: string;
    quotedPassage?: string | null;
    sourceDocumentId?: number | null;
    sourceDocumentTitle?: string | null;
    confidence: number;
    hasRubricConflict?: boolean;
    payload: Record<string, unknown>;
    modelUsed?: string | null;
    costUsd?: number;
  }): AgentProposal {
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO pending_agent_proposals (
          workspace_id, run_id, run_label, target_type, target_ref,
          title, summary, rationale, quoted_passage, source_document_id,
          source_document_title, confidence, has_rubric_conflict,
          payload_json, model_used, cost_usd, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `)
      .run(
        params.workspaceId,
        params.runId,
        params.runLabel,
        params.targetType,
        params.targetRef,
        params.title,
        params.summary,
        params.rationale,
        params.quotedPassage ?? null,
        params.sourceDocumentId ?? null,
        params.sourceDocumentTitle ?? null,
        Math.max(0, Math.min(1, params.confidence)),
        params.hasRubricConflict ? 1 : 0,
        JSON.stringify(params.payload),
        params.modelUsed ?? null,
        Number.isFinite(params.costUsd) ? Number(params.costUsd) : 0,
      );
    const row = db
      .prepare("SELECT * FROM pending_agent_proposals WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapAgentProposal(row);
  },

  listPendingAgentProposals(workspaceId: number): AgentProposal[] {
    return (
      getDb()
        .prepare(`
          SELECT * FROM pending_agent_proposals
          WHERE workspace_id = ? AND status = 'pending'
          ORDER BY created_at DESC, id DESC
          LIMIT 200
        `)
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapAgentProposal);
  },

  resolveAgentProposal(params: {
    workspaceId: number;
    proposalId: number;
    decision: "approve" | "edit_approve" | "reject";
    editedPayload?: Record<string, unknown>;
  }): AgentProposal | null {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM pending_agent_proposals WHERE id = ? AND workspace_id = ?")
      .get(params.proposalId, params.workspaceId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const proposal = mapAgentProposal(row);
    const now = new Date().toISOString();

    if (params.decision === "reject") {
      db.prepare(
        "UPDATE pending_agent_proposals SET status = 'rejected', reviewed_at = ? WHERE id = ?",
      ).run(now, proposal.id);
      return { ...proposal, status: "rejected", reviewedAt: now };
    }

    const effectivePayload =
      params.decision === "edit_approve" && params.editedPayload
        ? { ...proposal.payload, ...params.editedPayload }
        : proposal.payload;

    const nextStatus: AgentProposalStatus =
      params.decision === "edit_approve" ? "edited_approved" : "approved";

    if (proposal.targetType === "framework_assessment") {
      const frameworkCode = String(effectivePayload.frameworkCode || "");
      const reqCode = String(effectivePayload.reqCode || "");
      const suggestedStatus = String(
        effectivePayload.suggestedStatus || "PartiallyMet",
      ) as RequirementStatus;
      const evidenceSummary =
        typeof effectivePayload.evidenceSummary === "string"
          ? effectivePayload.evidenceSummary
          : proposal.summary;
      const notes =
        typeof effectivePayload.notes === "string"
          ? effectivePayload.notes
          : `${proposal.rationale}${proposal.modelUsed ? ` [Reviewed AI proposal · ${proposal.modelUsed}]` : ""}`;

      if (frameworkCode && reqCode) {
        frameworksRepository.updateRequirementAssessment(
          params.workspaceId,
          frameworkCode,
          reqCode,
          {
            status: suggestedStatus,
            evidenceSummary,
            notes,
          },
        );
        if (proposal.sourceDocumentId) {
          frameworksRepository.addRequirementEvidence({
            workspaceId: params.workspaceId,
            frameworkCode,
            reqCode,
            documentId: proposal.sourceDocumentId,
            title: proposal.sourceDocumentTitle || "Evidence Document",
            url: null,
            evidenceType: "DOCUMENT",
          });
        }
      }
    } else if (proposal.targetType === "capa_item") {
      const findingRaw = String(effectivePayload.findingType || "MinorNC");
      const findingType = (
        ["MajorNC", "MinorNC", "OFI", "AuditFinding"].includes(findingRaw) ? findingRaw : "MinorNC"
      ) as "MajorNC" | "MinorNC" | "OFI" | "AuditFinding";
      governanceRepository.createCapa(params.workspaceId, {
        title: String(effectivePayload.title || proposal.title).slice(0, 240),
        findingType,
        source: String(effectivePayload.source || proposal.runLabel).slice(0, 160),
        controlNumber:
          typeof effectivePayload.controlNumber === "string" &&
          effectivePayload.controlNumber.trim()
            ? effectivePayload.controlNumber.trim()
            : null,
        rootCause:
          typeof effectivePayload.rootCause === "string"
            ? effectivePayload.rootCause.slice(0, 4000)
            : proposal.rationale.slice(0, 4000),
        correctiveAction:
          typeof effectivePayload.correctiveAction === "string"
            ? effectivePayload.correctiveAction.slice(0, 4000)
            : proposal.summary.slice(0, 4000),
        owner: typeof effectivePayload.owner === "string" ? effectivePayload.owner : null,
        dueDate: typeof effectivePayload.dueDate === "string" ? effectivePayload.dueDate : null,
        status: "Open",
      });
    } else if (proposal.targetType === "risk_item") {
      governanceRepository.createRisk(params.workspaceId, {
        title: String(effectivePayload.title || proposal.title).slice(0, 240),
        description: String(effectivePayload.description || proposal.summary).slice(0, 4000),
        threat: typeof effectivePayload.threat === "string" ? effectivePayload.threat : null,
        likelihood: Math.max(1, Math.min(5, Number(effectivePayload.likelihood) || 3)),
        impact: Math.max(1, Math.min(5, Number(effectivePayload.impact) || 4)),
        treatment: "Mitigate",
        treatmentPlan:
          typeof effectivePayload.treatmentPlan === "string"
            ? effectivePayload.treatmentPlan.slice(0, 4000)
            : proposal.rationale.slice(0, 4000),
        status: "Open",
        linkedControls: Array.isArray(effectivePayload.linkedControls)
          ? effectivePayload.linkedControls.map(String)
          : [],
      });
    } else if (proposal.targetType === "soa_justification") {
      const controlNumber = String(effectivePayload.controlNumber || proposal.targetRef).trim();
      const ctrl = controlsRepository.getControlByNumber(controlNumber);
      const justification = String(
        effectivePayload.inclusionJustification ||
          effectivePayload.evidenceSummary ||
          proposal.summary,
      ).trim();
      // Hard audit red line: agent SoA proposals ONLY update inclusionJustification (never auto-exclude controls)
      if (ctrl && justification) {
        controlsRepository.updateWorkspaceControl(params.workspaceId, ctrl.id, {
          inclusionJustification: justification.slice(0, 2000),
        });
      }
    }

    db.prepare(
      "UPDATE pending_agent_proposals SET status = ?, payload_json = ?, reviewed_at = ? WHERE id = ?",
    ).run(nextStatus, JSON.stringify(effectivePayload), now, proposal.id);

    const updated = db
      .prepare("SELECT * FROM pending_agent_proposals WHERE id = ?")
      .get(proposal.id) as Record<string, unknown>;
    return mapAgentProposal(updated);
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

function mapAgentProposal(row: Record<string, unknown>): AgentProposal {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    runId: String(row.run_id),
    runLabel: String(row.run_label),
    targetType: row.target_type as AgentProposalTarget,
    targetRef: String(row.target_ref),
    title: String(row.title),
    summary: String(row.summary),
    rationale: String(row.rationale),
    quotedPassage: row.quoted_passage != null ? String(row.quoted_passage) : null,
    sourceDocumentId: row.source_document_id != null ? Number(row.source_document_id) : null,
    sourceDocumentTitle:
      row.source_document_title != null ? String(row.source_document_title) : null,
    confidence: Number(row.confidence || 0.5),
    hasRubricConflict: Boolean(row.has_rubric_conflict),
    payload: safeJsonParse<Record<string, unknown>>(row.payload_json as string, {}),
    modelUsed: row.model_used != null ? String(row.model_used) : null,
    costUsd: Number(row.cost_usd || 0),
    status: (row.status as AgentProposalStatus) || "pending",
    reviewedAt: row.reviewed_at != null ? String(row.reviewed_at) : null,
    createdAt: String(row.created_at),
  };
}
