import type {
  AiProvider,
  ClimateChangeRelevance,
  Control,
  ControlFrequency,
  ControlQuestionnaire,
  ControlStartQuarter,
  ControlUrgency,
  DocumentQuestionMatch,
  DocumentRecord,
  DocumentStatus,
  EvidenceLink,
  EvidenceType,
  ImplementationStatus,
  Persona,
  RequirementAssessmentLogEntry,
  RequirementEvidenceLink,
  RequirementStatus,
  RiskAppetite,
  TestRun,
  TestStatus,
  Workspace,
  WorkspaceControl,
  WorkspaceProfile,
} from "@shared/schema";

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "workspace";
}

export function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: Number(row.id),
    name: String(row.name),
    slug: String(row.slug),
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
  };
}

export function mapProfile(row: Record<string, unknown>): WorkspaceProfile {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    companyName: row.company_name != null ? String(row.company_name) : null,
    industry: row.industry != null ? String(row.industry) : null,
    companySize: row.company_size != null ? String(row.company_size) : null,
    techStack: row.tech_stack != null ? String(row.tech_stack) : null,
    deploymentModel: row.deployment_model != null ? String(row.deployment_model) : null,
    regulatoryRequirements: safeJsonParse<string[]>(row.regulatory_requirements_json as string, []),
    dataClassificationLevels: safeJsonParse<string[]>(
      row.data_classification_levels_json as string,
      [],
    ),
    riskAppetite: (row.risk_appetite as RiskAppetite) || "Moderate",
    defaultControlFrequency: (row.default_control_frequency as ControlFrequency | null) ?? null,
    defaultStartQuarter: (row.default_start_quarter as ControlStartQuarter | null) ?? null,
    additionalContext: row.additional_context != null ? String(row.additional_context) : null,
    hideNonApplicableControls: Boolean(row.hide_non_applicable_controls),
    aiProvider: (row.ai_provider as AiProvider) || "auto",
    aiBaseUrl: row.ai_base_url != null ? String(row.ai_base_url) : null,
    aiRoutingPreset: (row.ai_routing_preset as WorkspaceProfile["aiRoutingPreset"]) || "balanced",
    aiZdrOnly: row.ai_zdr_only != null ? Boolean(row.ai_zdr_only) : true,
    aiScreeningModel: String(row.ai_screening_model || "auto"),
    aiSynthesisModel: String(row.ai_synthesis_model || "auto"),
    aiDailyTokenBudget: Number(row.ai_daily_token_budget),
    aiDailyCostBudgetUsd:
      row.ai_daily_cost_budget_usd != null ? Number(row.ai_daily_cost_budget_usd) : 5.0,
    aiMaxChunksPerRun: Number(row.ai_max_chunks_per_run),
    soaVersion: row.soa_version != null ? String(row.soa_version) : "1.0",
    soaApprovedBy: row.soa_approved_by != null ? String(row.soa_approved_by) : null,
    soaApprovedAt: row.soa_approved_at != null ? String(row.soa_approved_at) : null,
    climateChangeRelevant:
      (row.climate_change_relevant as ClimateChangeRelevance) || "Undetermined",
    climateChangeRationale:
      row.climate_change_rationale != null ? String(row.climate_change_rationale) : null,
    onboardingDismissed: Boolean(row.onboarding_dismissed),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapControl(row: Record<string, unknown>): Control {
  return {
    id: Number(row.id),
    controlNumber: String(row.control_number),
    name: String(row.name),
    description: row.description != null ? String(row.description) : null,
    categoryId: Number(row.category_id),
    ownerRole: row.owner_role != null ? String(row.owner_role) : null,
    defaultFrequency: (row.default_frequency as ControlFrequency | null) ?? null,
    startQuarter: (row.start_quarter as ControlStartQuarter | null) ?? null,
    cps234Reference: row.cps234_reference != null ? String(row.cps234_reference) : null,
    cps230Reference: row.cps230_reference != null ? String(row.cps230_reference) : null,
    annexAReference: row.annex_a_reference != null ? String(row.annex_a_reference) : null,
    aiQuestionnaire: safeJsonParse<ControlQuestionnaire | null>(
      row.questionnaire_json as string | null,
      null,
    ),
    questionnaireGeneratedAt: row.questionnaire_generated_at
      ? String(row.questionnaire_generated_at)
      : null,
  };
}

export function mapWorkspaceControl(row: Record<string, unknown>): WorkspaceControl {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    controlId: Number(row.control_id),
    frequency: (row.frequency as ControlFrequency | null) ?? null,
    startQuarter: (row.start_quarter as ControlStartQuarter | null) ?? null,
    isApplicable: Boolean(row.is_applicable),
    inclusionJustification:
      row.inclusion_justification != null ? String(row.inclusion_justification) : null,
    exclusionJustification:
      row.exclusion_justification != null ? String(row.exclusion_justification) : null,
    implementationStatus: (row.implementation_status as ImplementationStatus) || "NotImplemented",
    nextDueDate: row.next_due_date != null ? String(row.next_due_date) : null,
    selectedPersona: (row.selected_persona as Persona) || "Auditor",
    selectedUrgency: (row.selected_urgency as ControlUrgency) || "later",
    implementationUpdatedAt: row.implementation_updated_at
      ? String(row.implementation_updated_at)
      : null,
  };
}

export function mapTestRun(row: Record<string, unknown>): TestRun {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    workspaceControlId: Number(row.workspace_control_id),
    testDate: String(row.test_date),
    status: row.status as TestStatus,
    comments: row.comments != null ? String(row.comments) : null,
    aiAnalysis: row.ai_analysis != null ? String(row.ai_analysis) : null,
    aiSuggestedStatus: (row.ai_suggested_status as TestStatus | null) ?? null,
    aiConfidence: row.ai_confidence != null ? Number(row.ai_confidence) : null,
    aiContextScope: (row.ai_context_scope as TestRun["aiContextScope"]) ?? null,
    createdAt: String(row.created_at),
  };
}

export function mapDocument(row: Record<string, unknown>): DocumentRecord {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    title: String(row.title),
    originalFilename: String(row.original_filename),
    blobKey: String(row.blob_key),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    fileHash: String(row.file_hash),
    documentDate: row.document_date != null ? String(row.document_date) : null,
    evidenceType: (row.evidence_type as EvidenceType | null) ?? null,
    description: row.description != null ? String(row.description) : null,
    extractionStatus: (row.extraction_status as DocumentStatus) || "pending",
    extractionError: row.extraction_error != null ? String(row.extraction_error) : null,
    pageCount: row.page_count != null ? Number(row.page_count) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapEvidenceLink(row: Record<string, unknown>): EvidenceLink {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    workspaceControlId: row.workspace_control_id != null ? Number(row.workspace_control_id) : null,
    controlNumber: row.control_number != null ? String(row.control_number) : null,
    controlName: row.control_name != null ? String(row.control_name) : null,
    questionId: row.question_id != null ? Number(row.question_id) : null,
    testRunId: row.test_run_id != null ? Number(row.test_run_id) : null,
    title: String(row.title),
    url: row.url != null ? String(row.url) : null,
    evidenceType: (row.evidence_type as EvidenceType | null) ?? null,
    description: row.description != null ? String(row.description) : null,
    documentId: row.document_id != null ? Number(row.document_id) : null,
    createdAt: String(row.created_at),
  };
}

export function mapMatch(row: Record<string, unknown>): DocumentQuestionMatch {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    documentId: Number(row.document_id),
    documentTitle: row.document_title != null ? String(row.document_title) : undefined,
    originalFilename: row.original_filename != null ? String(row.original_filename) : undefined,
    workspaceControlId: Number(row.workspace_control_id),
    controlNumber: row.control_number != null ? String(row.control_number) : undefined,
    controlName: row.control_name != null ? String(row.control_name) : undefined,
    questionId: Number(row.question_id),
    contentRelevance: Number(row.content_relevance),
    evidenceTypeMatch: Boolean(row.evidence_type_match),
    specificity: Number(row.specificity),
    compositeScore: Number(row.composite_score),
    matchedPassage: row.matched_passage != null ? String(row.matched_passage) : null,
    aiSummary: row.ai_summary != null ? String(row.ai_summary) : null,
    suggestedResponse: row.suggested_response != null ? String(row.suggested_response) : null,
    userAccepted:
      row.user_accepted === null || row.user_accepted === undefined
        ? null
        : Boolean(row.user_accepted),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    isCrossControl: Boolean(row.is_cross_control),
    sourceControlId: row.source_control_id != null ? Number(row.source_control_id) : null,
    chunkId: row.chunk_id != null ? Number(row.chunk_id) : null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
  };
}

export function mapRequirementEvidence(row: Record<string, unknown>): RequirementEvidenceLink {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    requirementId: Number(row.requirement_id),
    documentId: row.document_id != null ? Number(row.document_id) : null,
    documentTitle: row.document_title != null ? String(row.document_title) : null,
    originalFilename: row.original_filename != null ? String(row.original_filename) : null,
    title: String(row.title),
    url: row.url != null ? String(row.url) : null,
    evidenceType: (row.evidence_type as EvidenceType | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export function mapRequirementLog(row: Record<string, unknown>): RequirementAssessmentLogEntry {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    frameworkCode: String(row.framework_code),
    reqCode: String(row.req_code),
    previousStatus: (row.previous_status as RequirementStatus | null) ?? null,
    newStatus: row.new_status as RequirementStatus,
    notes: row.notes != null ? String(row.notes) : null,
    evidenceSummary: row.evidence_summary != null ? String(row.evidence_summary) : null,
    owner: row.owner != null ? String(row.owner) : null,
    targetDate: row.target_date != null ? String(row.target_date) : null,
    createdAt: String(row.created_at),
  };
}
