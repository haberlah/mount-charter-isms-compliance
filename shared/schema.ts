import { z } from "zod";

export const frequencyValues = ["Annual", "Quarterly", "Monthly"] as const;
export const quarterValues = ["Q1", "Q2", "Q3", "Q4"] as const;
export const testStatusValues = [
  "Pass",
  "PassPrevious",
  "Fail",
  "Blocked",
  "NotAttempted",
  "ContinualImprovement",
] as const;
export const personaValues = ["Auditor", "Advisor", "Analyst"] as const;
export const controlUrgencyValues = ["now", "next", "later"] as const;
export const riskAppetiteValues = ["Conservative", "Moderate", "Aggressive"] as const;
export const evidenceTypeValues = [
  "REGISTER",
  "RECORD",
  "POLICY",
  "MATRIX",
  "DOCUMENT",
  "OTHER",
] as const;
export const documentStatusValues = [
  "pending",
  "extracting",
  "extracted",
  "analysing",
  "analysed",
  "error",
] as const;
export const interactionTypeValues = [
  "questionnaire_generation",
  "response_review",
  "test_analysis",
  "ontology_load",
  "document_analysis",
  "evidence_fanout",
  "framework_assessment",
  "mock_auditor",
  "soa_scoping",
  "policy_redline",
  "vendor_assurance",
  "connectivity_test",
] as const;
export const concreteAiProviderValues = [
  "openrouter",
  "anthropic",
  "openai",
  "gemini",
  "xai",
  "meta",
  "ollama",
  "lmstudio",
  "custom_openai",
  "claude_cli",
  "codex_cli",
  "gemini_cli",
  "grok_cli",
  "cursor_cli",
] as const;
export const aiProviderValues = ["auto", ...concreteAiProviderValues] as const;
export const aiRoutingPresetValues = ["balanced", "max_depth", "low_cost"] as const;
export const agentProposalTargetValues = [
  "question_response",
  "framework_assessment",
  "evidence_link",
  "capa_item",
  "risk_item",
  "soa_justification",
] as const;
export const agentProposalStatusValues = [
  "pending",
  "approved",
  "edited_approved",
  "rejected",
] as const;
export const riskTreatmentValues = ["Mitigate", "Accept", "Transfer", "Avoid"] as const;
export const riskStatusValues = ["Open", "InTreatment", "Accepted", "Closed"] as const;
export const capaFindingTypeValues = ["MajorNC", "MinorNC", "OFI", "AuditFinding"] as const;
export const capaStatusValues = ["Open", "InProgress", "VerifiedClosed"] as const;
export const governanceReviewTypeValues = ["InternalAudit", "ManagementReview"] as const;
export const vendorCriticalityValues = ["Critical", "High", "Medium", "Low"] as const;
export const exitPlanStatusValues = ["Missing", "Documented", "Tested"] as const;
export const policyStatusValues = ["Draft", "Approved", "ReviewDue", "Retired"] as const;
export const incidentTypeValues = [
  "RansomwareExtortion",
  "DataBreachNDB",
  "CyberIncident",
  "OperationalDisruption",
  "Other",
] as const;
export const incidentStatusValues = ["Investigating", "Contained", "Eradicated", "Closed"] as const;
export const aiContextScopeValues = ["current_only", "last_3", "all_history"] as const;
export const implementationStatusValues = [
  "Implemented",
  "PartiallyImplemented",
  "Planned",
  "NotImplemented",
] as const;
export const climateChangeRelevanceValues = ["Relevant", "NotRelevant", "Undetermined"] as const;
export const frameworkScoringModeValues = [
  "pass_fail",
  "maturity_0_3",
  "window_attestation",
  "statutory_register",
] as const;
export const frameworkSupportTierValues = ["full", "cross_mapped", "ai_context_only"] as const;
export const requirementStatusValues = ["Met", "PartiallyMet", "NotMet", "NotApplicable"] as const;
export const mappingCoverageValues = [
  "full",
  "partial",
  "delta_required",
  "rubric_conflict",
] as const;
export const e8TargetLevelValues = ["ML1", "ML2", "ML3"] as const;
export const e8AchievedLevelValues = ["ML0", "ML1", "ML2", "ML3"] as const;

export type ControlFrequency = (typeof frequencyValues)[number];
export type ControlStartQuarter = (typeof quarterValues)[number];
export type TestStatus = (typeof testStatusValues)[number];
export type Persona = (typeof personaValues)[number];
export type ControlUrgency = (typeof controlUrgencyValues)[number];
export type RiskAppetite = (typeof riskAppetiteValues)[number];
export type EvidenceType = (typeof evidenceTypeValues)[number];
export type DocumentStatus = (typeof documentStatusValues)[number];
export type InteractionType = (typeof interactionTypeValues)[number];
export type ConcreteAiProvider = (typeof concreteAiProviderValues)[number];
export type AiProvider = (typeof aiProviderValues)[number];
export type AiRoutingPreset = (typeof aiRoutingPresetValues)[number];
export type AgentProposalTarget = (typeof agentProposalTargetValues)[number];
export type AgentProposalStatus = (typeof agentProposalStatusValues)[number];
export type RiskTreatment = (typeof riskTreatmentValues)[number];
export type RiskStatus = (typeof riskStatusValues)[number];
export type CapaFindingType = (typeof capaFindingTypeValues)[number];
export type CapaStatus = (typeof capaStatusValues)[number];
export type GovernanceReviewType = (typeof governanceReviewTypeValues)[number];
export type VendorCriticality = (typeof vendorCriticalityValues)[number];
export type ExitPlanStatus = (typeof exitPlanStatusValues)[number];
export type PolicyStatus = (typeof policyStatusValues)[number];
export type IncidentType = (typeof incidentTypeValues)[number];
export type IncidentStatus = (typeof incidentStatusValues)[number];
export type AiContextScope = (typeof aiContextScopeValues)[number];
export type ImplementationStatus = (typeof implementationStatusValues)[number];
export type ClimateChangeRelevance = (typeof climateChangeRelevanceValues)[number];
export type FrameworkScoringMode = (typeof frameworkScoringModeValues)[number];
export type FrameworkSupportTier = (typeof frameworkSupportTierValues)[number];
export type RequirementStatus = (typeof requirementStatusValues)[number];
export type MappingCoverage = (typeof mappingCoverageValues)[number];
export type E8TargetLevel = (typeof e8TargetLevelValues)[number];
export type E8AchievedLevel = (typeof e8AchievedLevelValues)[number];
export type Severity = "Critical" | "High" | "Medium" | "Low";

export interface OntologyQuestion {
  question_id: number;
  question: string;
  guidance: string;
  auditor_focus: string;
  evidence_type: string;
  answer_type: string;
  what_good_looks_like: string;
  red_flags: string;
  nc_pattern: string;
  severity: Severity;
  primary_persona: Persona;
  related_controls: string;
  cps234_ref?: string;
  cps230_ref?: string;
}

export interface ControlQuestionnaire {
  questions: OntologyQuestion[];
  metadata: {
    total_questions: number;
    by_persona: Record<Persona, number>;
  };
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface WorkspaceProfile {
  id: number;
  workspaceId: number;
  companyName: string | null;
  industry: string | null;
  companySize: string | null;
  techStack: string | null;
  deploymentModel: string | null;
  regulatoryRequirements: string[];
  dataClassificationLevels: string[];
  riskAppetite: RiskAppetite;
  defaultControlFrequency: ControlFrequency | null;
  defaultStartQuarter: ControlStartQuarter | null;
  additionalContext: string | null;
  hideNonApplicableControls: boolean;
  aiProvider: AiProvider;
  aiBaseUrl: string | null;
  aiRoutingPreset: AiRoutingPreset;
  aiZdrOnly: boolean;
  aiScreeningModel: string;
  aiSynthesisModel: string;
  aiDailyTokenBudget: number;
  aiDailyCostBudgetUsd: number;
  aiMaxChunksPerRun: number;
  soaVersion: string;
  soaApprovedBy: string | null;
  soaApprovedAt: string | null;
  climateChangeRelevant: ClimateChangeRelevance;
  climateChangeRationale: string | null;
  onboardingDismissed: boolean;
  createdAt: string;
  updatedAt: string;
}

// Keep alias for schedule helpers
export type OrganisationProfile = WorkspaceProfile;

export interface ControlCategory {
  id: number;
  name: string;
  sortOrder: number;
}

export interface Control {
  id: number;
  controlNumber: string;
  name: string;
  description: string | null;
  categoryId: number;
  ownerRole: string | null;
  defaultFrequency: ControlFrequency | null;
  startQuarter: ControlStartQuarter | null;
  cps234Reference: string | null;
  cps230Reference: string | null;
  annexAReference: string | null;
  aiQuestionnaire: ControlQuestionnaire | null;
  questionnaireGeneratedAt: string | null;
}

export interface QuestionResponse {
  id?: number;
  question_id: number;
  response_text: string;
  evidence_references: string[];
  last_updated: string;
}

export interface WorkspaceControl {
  id: number;
  workspaceId: number;
  controlId: number;
  frequency: ControlFrequency | null;
  startQuarter: ControlStartQuarter | null;
  isApplicable: boolean;
  inclusionJustification: string | null;
  exclusionJustification: string | null;
  implementationStatus: ImplementationStatus;
  nextDueDate: string | null;
  selectedPersona: Persona;
  selectedUrgency: ControlUrgency;
  implementationUpdatedAt: string | null;
}

export interface TestRun {
  id: number;
  workspaceId: number;
  workspaceControlId: number;
  testDate: string;
  status: TestStatus;
  comments: string | null;
  aiAnalysis: string | null;
  aiSuggestedStatus: TestStatus | null;
  aiConfidence: number | null;
  aiContextScope: AiContextScope | null;
  createdAt: string;
}

export interface TestRunWithControl extends TestRun {
  controlNumber: string;
  controlName: string;
  categoryName: string;
  evidenceLinks?: EvidenceLink[];
}

export interface AiInteraction {
  id: number;
  workspaceId: number;
  interactionType: InteractionType;
  controlId: number | null;
  controlNumber?: string | null;
  testRunId: number | null;
  inputSummary: string | null;
  outputSummary: string | null;
  modelUsed: string;
  provider?: string | null;
  tokensUsed: number;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
  createdAt: string;
}

export interface EvidenceLink {
  id: number;
  workspaceId: number;
  workspaceControlId: number | null;
  controlNumber?: string | null;
  controlName?: string | null;
  questionId: number | null;
  testRunId: number | null;
  title: string;
  url: string | null;
  evidenceType: EvidenceType | null;
  description: string | null;
  documentId: number | null;
  createdAt: string;
}

export interface ActionItem {
  id: number;
  workspaceId: number;
  title: string;
  doneAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface DocumentRecord {
  id: number;
  workspaceId: number;
  title: string;
  originalFilename: string;
  blobKey: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  documentDate: string | null;
  evidenceType: EvidenceType | null;
  description: string | null;
  extractionStatus: DocumentStatus;
  extractionError: string | null;
  pageCount: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedControls?: Array<{
    linkId: number;
    workspaceControlId: number;
    controlId: number;
    controlNumber: string;
    controlName: string;
    analysisStatus: DocumentStatus;
    analysisCompletedAt: string | null;
  }>;
}

export interface DocumentChunk {
  id: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  charStart: number;
  charEnd: number;
  sectionHeading: string | null;
}

export interface DocumentQuestionMatch {
  id: number;
  workspaceId: number;
  documentId: number;
  documentTitle?: string;
  originalFilename?: string;
  workspaceControlId: number;
  controlNumber?: string;
  controlName?: string;
  questionId: number;
  contentRelevance: number;
  evidenceTypeMatch: boolean;
  specificity: number;
  compositeScore: number;
  matchedPassage: string | null;
  aiSummary: string | null;
  suggestedResponse: string | null;
  userAccepted: boolean | null;
  acceptedAt: string | null;
  isCrossControl: boolean;
  sourceControlId: number | null;
  chunkId: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface ResponseChangeLogEntry {
  id: number;
  workspaceId: number;
  workspaceControlId: number;
  questionId: number;
  previousResponse: string | null;
  newResponse: string;
  changeSource: string;
  sourceDocumentId: number | null;
  sourceMatchId: number | null;
  createdAt: string;
}

export interface ControlSummary extends Control {
  category: ControlCategory;
  workspaceControl: WorkspaceControl;
  latestTestRun: TestRun | null;
  questionnaireProgress: {
    total: number;
    answered: number;
    percentage: number;
  };
  linkedDocumentCount: number;
  evidenceLinkCount: number;
  pendingMatchCount: number;
  linkedRiskCodes?: string[];
}

export interface ControlDetailResponse extends ControlSummary {
  responses: QuestionResponse[];
  testRuns: TestRun[];
  evidenceLinks: EvidenceLink[];
  linkedDocuments: Array<
    DocumentRecord & {
      linkId: number;
      analysisStatus: DocumentStatus;
      analysisCompletedAt: string | null;
    }
  >;
  matches: DocumentQuestionMatch[];
  changeLog: ResponseChangeLogEntry[];
}

export interface UrgencyBoardItem {
  controlNumber: string;
  controlName: string;
  categoryName: string;
  selectedUrgency: ControlUrgency;
  status: TestStatus | null;
  dueDate: string | null;
  daysUntilDue: number | null;
  ownerRole: string | null;
  questionnaireProgress: { total: number; answered: number; percentage: number };
}

export interface DashboardStats {
  totalControls: number;
  applicableControls: number;
  excludedControls: number;
  testedControls: number;
  passedControls: number;
  failedControls: number;
  notTestedControls: number;
  blockedControls: number;
  continualImprovementControls: number;
  compliancePercentage: number;
  questionnaireProgress: {
    totalQuestions: number;
    answeredQuestions: number;
    percentage: number;
    controlsComplete: number;
    controlsPartial: number;
    controlsNotStarted: number;
  };
  categoryBreakdown: Array<{
    categoryId: number;
    categoryName: string;
    total: number;
    passed: number;
    failed: number;
    notTested: number;
  }>;
  urgencySummary: {
    now: { total: number; completed: number; open: number };
    next: { total: number; completed: number; open: number };
    later: { total: number; completed: number; open: number };
    completed: number;
  };
  urgencyBoard: {
    now: UrgencyBoardItem[];
    next: UrgencyBoardItem[];
    later: UrgencyBoardItem[];
  };
  dueSoon: Array<{
    controlNumber: string;
    controlName: string;
    dueDate: string;
    daysUntilDue: number;
    lastTested: string | null;
  }>;
  recentTestRuns: TestRunWithControl[];
  documentStats: DocumentStats;
  onboarding: {
    hasProfile: boolean;
    hasScopedControls: boolean;
    hasDocuments: boolean;
    hasResponsesOrTests: boolean;
    dismissed: boolean;
  };
  climateChangeRelevant: ClimateChangeRelevance;
  frameworks: FrameworkSummary[];
  governanceSummary?: GovernanceSummary;
}

export interface DocumentStats {
  totalDocuments: number;
  totalFileSize: number;
  controlsWithEvidence: number;
  controlsWithGaps: number;
  documentsByType: Record<string, number>;
  pendingSuggestions: number;
}

// ─── Normalized Multi-Framework Types ────────────────────────────────────────

export interface FrameworkControlLink {
  controlId: number;
  controlNumber: string;
  controlName: string;
  coverage: MappingCoverage;
  mappingNotes: string | null;
  latestStatus: TestStatus | null;
  implementationStatus: ImplementationStatus;
  questionnairePercentage: number;
}

export interface RequirementEvidenceLink {
  id: number;
  workspaceId: number;
  requirementId: number;
  documentId: number | null;
  documentTitle?: string | null;
  originalFilename?: string | null;
  title: string;
  url: string | null;
  evidenceType: EvidenceType | null;
  createdAt: string;
}

export interface RequirementAssessmentLogEntry {
  id: number;
  workspaceId: number;
  frameworkCode: string;
  reqCode: string;
  previousStatus: RequirementStatus | null;
  newStatus: RequirementStatus;
  notes: string | null;
  evidenceSummary: string | null;
  owner: string | null;
  targetDate: string | null;
  createdAt: string;
}

export interface RequirementDriftWarning {
  controlNumber: string;
  controlName: string;
  reason: string;
  severity: "warn" | "err";
}

export interface RequirementAiAssessment {
  suggestedStatus: RequirementStatus;
  confidence: number;
  evidenceSummary: string;
  gaps: string[];
  recommendedActions: string[];
  reasoning: string;
  modelUsed: string;
  provider: AiProvider;
}

export interface FrameworkRequirementItem {
  id: number;
  frameworkId: number;
  reqCode: string;
  clauseRef: string | null;
  domain: string;
  title: string;
  description: string;
  guidance: string | null;
  levelOrCategory: string | null;
  prescriptiveSla: Record<string, unknown> | null;
  deadlineDate: string | null;
  isDraft: boolean;
  evidenceExpected: string | null;
  sortOrder: number;
  assessment: {
    status: RequirementStatus;
    notes: string | null;
    evidenceSummary: string | null;
    owner: string | null;
    targetDate: string | null;
    assessedAt: string | null;
  };
  linkedControls: FrameworkControlLink[];
  evidenceLinks: RequirementEvidenceLink[];
  historyCount: number;
  driftWarnings: RequirementDriftWarning[];
}

export interface EssentialEightStrategySummary {
  strategy: string;
  achievedLevel: E8AchievedLevel;
  ml1Status: RequirementStatus;
  ml2Status: RequirementStatus;
  ml3Status: RequirementStatus;
  ml1Met: number;
  ml1Total: number;
  ml2Met: number;
  ml2Total: number;
  ml3Met: number;
  ml3Total: number;
  hasRubricConflict: boolean;
}

export interface FrameworkSummary {
  id: number;
  code: string;
  name: string;
  shortName: string;
  version: string;
  jurisdiction: string;
  instrumentId: string | null;
  sourceUrl: string | null;
  effectiveDate: string | null;
  transitionNote: string | null;
  scoringMode: FrameworkScoringMode;
  supportTier: FrameworkSupportTier;
  description: string;
  sortOrder: number;
  enabled: boolean;
  targetLevel: string | null;
  notes: string | null;
  /** Count of in-force requirements (excludes isDraft items) */
  totalRequirements: number;
  /** Count of forward-looking draft/exposure-draft items excluded from readiness % */
  draftCount: number;
  /** Count of requirements whose linked ISO controls have drifted (failed/blocked/excluded) */
  driftCount: number;
  metCount: number;
  partiallyMetCount: number;
  notMetCount: number;
  notApplicableCount: number;
  readinessPercentage: number;
  /** For ACSC Essential Eight: Weakest-Link MIN across all 8 strategies */
  weakestLinkMaturity?: E8AchievedLevel;
  e8Strategies?: EssentialEightStrategySummary[];
  /** Upcoming statutory deadline summary (e.g. 10 Dec 2026 POLA ADM/COPC) */
  upcomingDeadlines?: Array<{
    reqCode: string;
    title: string;
    deadlineDate: string;
    daysRemaining: number;
    status: RequirementStatus;
  }>;
}

export interface FrameworkDetailResponse extends FrameworkSummary {
  requirements: FrameworkRequirementItem[];
}

// ─── Shared Zod Request Schemas ───────────────────────────────────────────────

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(120),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(120),
});

export const updateWorkspaceControlSchema = z
  .object({
    frequency: z.enum(frequencyValues).nullable().optional(),
    startQuarter: z.enum(quarterValues).nullable().optional(),
    isApplicable: z.boolean().optional(),
    inclusionJustification: z.string().trim().max(2000).nullable().optional(),
    exclusionJustification: z.string().trim().max(2000).nullable().optional(),
    implementationStatus: z.enum(implementationStatusValues).optional(),
    selectedPersona: z.enum(personaValues).optional(),
    selectedUrgency: z.enum(controlUrgencyValues).optional(),
  })
  .refine(
    (data) =>
      data.isApplicable !== false ||
      Boolean(data.exclusionJustification && data.exclusionJustification.trim().length >= 5),
    {
      message: "ISO 27001 Clause 6.1.3(d) requires a justification when excluding a control",
      path: ["exclusionJustification"],
    },
  );

export const saveQuestionResponseSchema = z.object({
  questionId: z.number().int().positive(),
  responseText: z.string().max(20000),
  evidenceReferences: z.array(z.string().trim().max(500)).max(50).optional(),
});

export const bulkSaveQuestionResponsesSchema = z.object({
  responses: z.array(saveQuestionResponseSchema).min(1).max(100),
});

export const createTestRunSchema = z.object({
  controlNumber: z.string().trim().min(1).max(20),
  status: z.enum(testStatusValues),
  comments: z.string().max(20000).optional().nullable(),
  aiAnalysis: z.string().max(50000).optional().nullable(),
  aiSuggestedStatus: z.enum(testStatusValues).optional().nullable(),
  aiConfidence: z.number().min(0).max(1).optional().nullable(),
  aiContextScope: z.enum(aiContextScopeValues).optional().nullable(),
  evidenceLinks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        url: z.string().trim().max(2000).optional().nullable(),
        evidenceType: z.enum(evidenceTypeValues).optional().nullable(),
        description: z.string().trim().max(2000).optional().nullable(),
        documentId: z.number().int().positive().optional().nullable(),
      }),
    )
    .max(50)
    .optional(),
});

export const createEvidenceLinkSchema = z.object({
  controlNumber: z.string().trim().min(1).max(20).optional().nullable(),
  questionId: z.number().int().positive().optional().nullable(),
  testRunId: z.number().int().positive().optional().nullable(),
  title: z.string().trim().min(1, "Title is required").max(300),
  url: z.string().trim().max(2000).optional().nullable(),
  evidenceType: z.enum(evidenceTypeValues).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  documentId: z.number().int().positive().optional().nullable(),
});

export const updateEvidenceLinkSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300).optional(),
  url: z.string().trim().max(2000).nullable().optional(),
  evidenceType: z.enum(evidenceTypeValues).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  evidenceType: z.enum(evidenceTypeValues).nullable().optional(),
  documentDate: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const updateProfileSchema = z.object({
  companyName: z.string().trim().max(200).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  companySize: z.string().trim().max(80).nullable().optional(),
  techStack: z.string().trim().max(1000).nullable().optional(),
  deploymentModel: z.string().trim().max(120).nullable().optional(),
  regulatoryRequirements: z.array(z.string().trim().max(80)).max(20).optional(),
  dataClassificationLevels: z.array(z.string().trim().max(80)).max(20).optional(),
  riskAppetite: z.enum(riskAppetiteValues).optional(),
  defaultControlFrequency: z.enum(frequencyValues).nullable().optional(),
  defaultStartQuarter: z.enum(quarterValues).nullable().optional(),
  additionalContext: z.string().trim().max(4000).nullable().optional(),
  hideNonApplicableControls: z.boolean().optional(),
  aiProvider: z.enum(aiProviderValues).optional(),
  aiBaseUrl: z.string().trim().max(500).nullable().optional(),
  aiRoutingPreset: z.enum(aiRoutingPresetValues).optional(),
  aiZdrOnly: z.boolean().optional(),
  aiScreeningModel: z.string().trim().min(1).max(120).optional(),
  aiSynthesisModel: z.string().trim().min(1).max(120).optional(),
  aiDailyTokenBudget: z.number().int().min(10_000).max(5_000_000).optional(),
  aiDailyCostBudgetUsd: z.number().min(0.1).max(500).optional(),
  aiMaxChunksPerRun: z.number().int().min(1).max(100).optional(),
  soaVersion: z.string().trim().min(1).max(40).optional(),
  soaApprovedBy: z.string().trim().max(120).nullable().optional(),
  soaApprovedAt: z.string().trim().max(40).nullable().optional(),
  climateChangeRelevant: z.enum(climateChangeRelevanceValues).optional(),
  climateChangeRationale: z.string().trim().max(4000).nullable().optional(),
  onboardingDismissed: z.boolean().optional(),
});

export const createActionItemSchema = z.object({
  title: z.string().trim().min(1, "Action item cannot be empty").max(500),
});

export const updateActionItemSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  done: z.boolean().optional(),
});

export const bulkSoaUpdateSchema = z.object({
  updates: z
    .array(
      z
        .object({
          controlNumber: z.string().trim().min(1).max(20),
          isApplicable: z.boolean().optional(),
          inclusionJustification: z.string().trim().max(2000).nullable().optional(),
          exclusionJustification: z.string().trim().max(2000).nullable().optional(),
          implementationStatus: z.enum(implementationStatusValues).optional(),
          selectedUrgency: z.enum(controlUrgencyValues).optional(),
          frequency: z.enum(frequencyValues).nullable().optional(),
          startQuarter: z.enum(quarterValues).nullable().optional(),
        })
        .refine(
          (item) =>
            item.isApplicable !== false ||
            Boolean(item.exclusionJustification && item.exclusionJustification.trim().length >= 5),
          {
            message: "Exclusion justification is required when marking a control Not Applicable",
            path: ["exclusionJustification"],
          },
        ),
    )
    .min(1)
    .max(200),
});

export const updateFrameworkConfigSchema = z.object({
  enabled: z.boolean().optional(),
  targetLevel: z.enum(e8TargetLevelValues).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateRequirementAssessmentSchema = z.object({
  status: z.enum(requirementStatusValues),
  notes: z.string().trim().max(4000).nullable().optional(),
  evidenceSummary: z.string().trim().max(4000).nullable().optional(),
  owner: z.string().trim().max(120).nullable().optional(),
  targetDate: z.string().trim().max(40).nullable().optional(),
});

export const createRequirementEvidenceSchema = z
  .object({
    documentId: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1, "Title is required").max(300),
    url: z.string().trim().max(2000).nullable().optional(),
    evidenceType: z.enum(evidenceTypeValues).nullable().optional(),
  })
  .refine((data) => Boolean(data.documentId) || Boolean(data.url && data.url.trim().length > 0), {
    message: "Provide either a local evidence library document or an external URL",
    path: ["url"],
  });

// ─── Governance Registers (Risks, CAPA, Reviews, Vendors, Policies, Incidents) ──

export interface RiskRecord {
  id: number;
  workspaceId: number;
  riskCode: string;
  title: string;
  description: string | null;
  assetOrProcess: string | null;
  threat: string | null;
  likelihood: number;
  impact: number;
  inherentScore: number;
  treatment: RiskTreatment;
  treatmentPlan: string | null;
  residualLikelihood: number;
  residualImpact: number;
  residualScore: number;
  owner: string | null;
  reviewDate: string | null;
  status: RiskStatus;
  linkedControls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CapaRecord {
  id: number;
  workspaceId: number;
  capaCode: string;
  title: string;
  findingType: CapaFindingType;
  source: string | null;
  controlNumber: string | null;
  frameworkCode: string | null;
  reqCode: string | null;
  rootCause: string | null;
  correctiveAction: string | null;
  owner: string | null;
  dueDate: string | null;
  status: CapaStatus;
  verificationNotes: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceReviewRecord {
  id: number;
  workspaceId: number;
  reviewType: GovernanceReviewType;
  title: string;
  reviewDate: string;
  scope: string | null;
  leadOrChair: string | null;
  attendees: string | null;
  findingsSummary: string | null;
  decisionsAndActions: string | null;
  nextReviewDate: string | null;
  documentId: number | null;
  status: "Planned" | "Completed";
  createdAt: string;
}

export interface VendorRecord {
  id: number;
  workspaceId: number;
  name: string;
  serviceDescription: string | null;
  isMaterialServiceProvider: boolean;
  criticality: VendorCriticality;
  dataResidency: string | null;
  dataTypesShared: string | null;
  owner: string | null;
  contractExpiryDate: string | null;
  lastReviewedDate: string | null;
  exitPlanStatus: ExitPlanStatus;
  riskRating: VendorCriticality;
  notes: string | null;
  linkedControls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRecord {
  id: number;
  workspaceId: number;
  policyCode: string;
  title: string;
  version: string;
  owner: string | null;
  approver: string | null;
  status: PolicyStatus;
  approvedAt: string | null;
  nextReviewDate: string | null;
  contentMarkdown: string;
  documentId: number | null;
  linkedControls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StatutoryClockItem {
  regime: string;
  label: string;
  deadlineAt: string;
  hoursRemaining: number;
  overdue: boolean;
  notified: boolean;
}

export interface IncidentRecord {
  id: number;
  workspaceId: number;
  incidentCode: string;
  title: string;
  incidentType: IncidentType;
  severity: Severity;
  detectedAt: string;
  ransomPaymentAt: string | null;
  status: IncidentStatus;
  summary: string | null;
  affectedSystems: string | null;
  regulatorNotified: boolean;
  regulatorName: string | null;
  regulatorRef: string | null;
  regulatorNotifiedAt: string | null;
  linkedControls: string[];
  statutoryClocks: StatutoryClockItem[];
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceSummary {
  totalRisks: number;
  highOpenRisks: number;
  openCapas: number;
  overdueCapas: number;
  totalReviews: number;
  totalVendors: number;
  materialServiceProviders: number;
  mspMissingExitPlan: number;
  totalPolicies: number;
  policiesReviewDue: number;
  activeIncidents: number;
}

// ─── Multi-Provider AI & Local CLI Collectors ────────────────────────────────

export interface AiProviderStatus {
  /** Saved workspace preference ("auto" or a pinned concrete provider) */
  configuredProvider: AiProvider;
  /** Resolved concrete provider currently in use, or null if none connected */
  activeProvider: ConcreteAiProvider | null;
  mode: "api_key" | "local_oss" | "subscription_cli" | "none";
  configured: boolean;
  source: string;
  message: string;
  baseUrl: string | null;
  /** Saved screening model preference (may be "auto") */
  screeningModel: string;
  /** Saved synthesis model preference (may be "auto") */
  synthesisModel: string;
  /** Concrete model resolved for screening when activeProvider is available */
  resolvedScreeningModel: string | null;
  /** Concrete model resolved for synthesis when activeProvider is available */
  resolvedSynthesisModel: string | null;
  providers: Array<{
    id: ConcreteAiProvider;
    name: string;
    mode: "api_key" | "local_oss" | "subscription_cli";
    configured: boolean;
    source: string;
    detail: string;
    defaultScreeningModel: string;
    defaultSynthesisModel: string;
    defaultBaseUrl?: string;
    suggestedModels: string[];
  }>;
}

export interface ProviderModelMetadata {
  contextLength?: number;
  promptPricePerM?: number;
  completionPricePerM?: number;
  supportsTools?: boolean;
  supportsStructuredOutputs?: boolean;
}

export interface ProviderModelsResponse {
  provider: ConcreteAiProvider;
  models: string[];
  recommendedScreening: string;
  recommendedSynthesis: string;
  recommendedLongContext?: string;
  modelMeta?: Record<string, ProviderModelMetadata>;
  liveFetched: boolean;
  fetchedAt: string;
  note: string;
}

export interface AgentProposal {
  id: number;
  workspaceId: number;
  runId: string;
  runLabel: string;
  targetType: AgentProposalTarget;
  targetRef: string;
  title: string;
  summary: string;
  rationale: string;
  quotedPassage: string | null;
  sourceDocumentId: number | null;
  sourceDocumentTitle: string | null;
  confidence: number;
  hasRubricConflict: boolean;
  payload: Record<string, unknown>;
  modelUsed: string | null;
  costUsd: number;
  status: AgentProposalStatus;
  reviewedAt: string | null;
  createdAt: string;
}

export interface MockAuditFinding {
  stage: "Stage 1 (Design)" | "Stage 2 (Operating Effectiveness)";
  severity: "MajorNC" | "MinorNC" | "OFI";
  title: string;
  citations: string[];
  contradiction: string;
  remediation: string;
  suggestedCapa?: {
    title: string;
    findingType: "MajorNC" | "MinorNC" | "OFI" | "AuditFinding";
    controlNumber?: string | null;
    rootCause: string;
    correctiveAction: string;
  };
}

export interface MockAuditDossier {
  runId: string;
  generatedAt: string;
  readinessVerdict: "Audit Ready" | "Conditional — Minor Gaps" | "Not Ready — Major NCs Found";
  executiveSummary: string;
  deterministicChecks: Array<{
    code: string;
    severity: "MajorNC" | "MinorNC" | "OFI";
    detail: string;
  }>;
  findings: MockAuditFinding[];
  stagedProposalCount: number;
  tokensUsed: number;
  costUsd: number;
  modelUsed: string;
  provider: string;
}

export interface PolicyRedlineResult {
  policyId: number;
  policyCode: string;
  policyTitle: string;
  summary: string;
  overPromises: Array<{
    clause: string;
    policyClaim: string;
    operationalReality: string;
    riskLevel: "High" | "Medium" | "Low";
  }>;
  redlinedMarkdown: string;
  tokensUsed: number;
  costUsd: number;
  modelUsed: string;
}

export interface VendorAssuranceResult {
  vendorId: number;
  vendorName: string;
  documentId: number;
  documentTitle: string;
  auditWindow: string;
  bridgeLetterNeeded: boolean;
  exceptionsOrQualifications: string[];
  dataResidencyFindings: string;
  app8CrossBorderRisk: "Low" | "Medium" | "High";
  subProcessors: string[];
  cuecs: Array<{
    cuec: string;
    mappedIsoControl: string | null;
    statusNote: string;
  }>;
  cps230Clauses: {
    apraAccessRights: "Present" | "Missing" | "Unclear";
    incidentNotice24h72h: "Present" | "Missing" | "Unclear";
    exitAndTransitionSupport: "Present" | "Missing" | "Unclear";
  };
  summary: string;
  stagedProposalCount: number;
  tokensUsed: number;
  costUsd: number;
  modelUsed: string;
}

export interface EvidenceFanOutEstimate {
  documentId: number;
  documentTitle: string;
  chunkCount: number;
  candidateControlCount: number;
  candidateControlNumbers: string[];
  candidateFrameworkReqCount: number;
  candidateFrameworks: string[];
  estimatedTokens: number;
  estimatedCostUsd: number;
  provider: ConcreteAiProvider | null;
  screeningModel: string | null;
  synthesisModel: string | null;
  isStaleDocument: boolean;
}

export interface CollectorInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
  statusNote: string;
  mappedControls: string[];
  mappedFrameworks: Array<{ frameworkCode: string; reqCode: string }>;
}

export interface CollectorRunResult {
  collectorId: string;
  documentId: number;
  title: string;
  capturedAt: string;
  linkedControls: string[];
  linkedRequirements: string[];
  summary: string;
}

// ─── Governance Zod Schemas ──────────────────────────────────────────────────

export const createRiskSchema = z.object({
  title: z.string().trim().min(1, "Risk title is required").max(240),
  description: z.string().trim().max(4000).nullable().optional(),
  assetOrProcess: z.string().trim().max(240).nullable().optional(),
  threat: z.string().trim().max(500).nullable().optional(),
  likelihood: z.number().int().min(1).max(5).default(3),
  impact: z.number().int().min(1).max(5).default(3),
  treatment: z.enum(riskTreatmentValues).default("Mitigate"),
  treatmentPlan: z.string().trim().max(4000).nullable().optional(),
  residualLikelihood: z.number().int().min(1).max(5).optional(),
  residualImpact: z.number().int().min(1).max(5).optional(),
  owner: z.string().trim().max(120).nullable().optional(),
  reviewDate: z.string().trim().max(40).nullable().optional(),
  status: z.enum(riskStatusValues).default("Open"),
  linkedControls: z.array(z.string().trim().max(20)).max(50).optional(),
});

export const updateRiskSchema = createRiskSchema.partial();

export const createCapaSchema = z.object({
  title: z.string().trim().min(1, "CAPA title is required").max(240),
  findingType: z.enum(capaFindingTypeValues).default("MinorNC"),
  source: z.string().trim().max(160).nullable().optional(),
  controlNumber: z.string().trim().max(20).nullable().optional(),
  frameworkCode: z.string().trim().max(60).nullable().optional(),
  reqCode: z.string().trim().max(60).nullable().optional(),
  rootCause: z.string().trim().max(4000).nullable().optional(),
  correctiveAction: z.string().trim().max(4000).nullable().optional(),
  owner: z.string().trim().max(120).nullable().optional(),
  dueDate: z.string().trim().max(40).nullable().optional(),
  status: z.enum(capaStatusValues).default("Open"),
  verificationNotes: z.string().trim().max(4000).nullable().optional(),
});

export const updateCapaSchema = createCapaSchema.partial();

export const createGovernanceReviewSchema = z.object({
  reviewType: z.enum(governanceReviewTypeValues),
  title: z.string().trim().min(1, "Review title is required").max(240),
  reviewDate: z.string().trim().min(4).max(40),
  scope: z.string().trim().max(1000).nullable().optional(),
  leadOrChair: z.string().trim().max(120).nullable().optional(),
  attendees: z.string().trim().max(1000).nullable().optional(),
  findingsSummary: z.string().trim().max(8000).nullable().optional(),
  decisionsAndActions: z.string().trim().max(8000).nullable().optional(),
  nextReviewDate: z.string().trim().max(40).nullable().optional(),
  documentId: z.number().int().positive().nullable().optional(),
  status: z.enum(["Planned", "Completed"]).default("Completed"),
});

export const createVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required").max(200),
  serviceDescription: z.string().trim().max(1000).nullable().optional(),
  isMaterialServiceProvider: z.boolean().default(false),
  criticality: z.enum(vendorCriticalityValues).default("Medium"),
  dataResidency: z.string().trim().max(160).nullable().optional(),
  dataTypesShared: z.string().trim().max(500).nullable().optional(),
  owner: z.string().trim().max(120).nullable().optional(),
  contractExpiryDate: z.string().trim().max(40).nullable().optional(),
  lastReviewedDate: z.string().trim().max(40).nullable().optional(),
  exitPlanStatus: z.enum(exitPlanStatusValues).default("Missing"),
  riskRating: z.enum(vendorCriticalityValues).default("Medium"),
  notes: z.string().trim().max(4000).nullable().optional(),
  linkedControls: z.array(z.string().trim().max(20)).max(50).optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const createPolicySchema = z.object({
  title: z.string().trim().min(1, "Policy title is required").max(240),
  version: z.string().trim().min(1).max(40).default("1.0"),
  owner: z.string().trim().max(120).nullable().optional(),
  approver: z.string().trim().max(120).nullable().optional(),
  status: z.enum(policyStatusValues).default("Draft"),
  approvedAt: z.string().trim().max(40).nullable().optional(),
  nextReviewDate: z.string().trim().max(40).nullable().optional(),
  contentMarkdown: z.string().max(100_000).default(""),
  documentId: z.number().int().positive().nullable().optional(),
  linkedControls: z.array(z.string().trim().max(20)).max(50).optional(),
});

export const updatePolicySchema = createPolicySchema.partial();

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1, "Incident title is required").max(240),
  incidentType: z.enum(incidentTypeValues).default("CyberIncident"),
  severity: z.enum(["Critical", "High", "Medium", "Low"]).default("High"),
  detectedAt: z.string().trim().min(4).max(40),
  ransomPaymentAt: z.string().trim().max(40).nullable().optional(),
  status: z.enum(incidentStatusValues).default("Investigating"),
  summary: z.string().trim().max(8000).nullable().optional(),
  affectedSystems: z.string().trim().max(2000).nullable().optional(),
  regulatorNotified: z.boolean().default(false),
  regulatorName: z.string().trim().max(160).nullable().optional(),
  regulatorRef: z.string().trim().max(120).nullable().optional(),
  regulatorNotifiedAt: z.string().trim().max(40).nullable().optional(),
  linkedControls: z.array(z.string().trim().max(20)).max(50).optional(),
});

export const updateIncidentSchema = createIncidentSchema.partial();
