import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { ControlQuestionnaire, OntologyQuestion, Persona } from "@shared/schema";
import frameworksData from "../seed-data/frameworks.json";
import ontologyData from "../seed-data/iso_27001_ontology.json";
import {
  DEFAULT_AI_ROUTING_PRESET,
  DEFAULT_DAILY_COST_BUDGET_USD,
  DEFAULT_DAILY_TOKEN_BUDGET,
  DEFAULT_MAX_CHUNKS_PER_RUN,
  DEFAULT_SCREENING_MODEL,
  DEFAULT_SYNTHESIS_MODEL,
  getDbPath,
} from "./config";
import { loadOntologyMigrationMap, migrateOntologyResponsesV21ToV30 } from "./ontology-migration";

interface FrameworksSeedFile {
  version: string;
  lastVerified?: string;
  frameworks: Array<{
    code: string;
    name: string;
    shortName: string;
    version: string;
    jurisdiction?: string;
    instrumentId?: string | null;
    sourceUrl?: string | null;
    effectiveDate?: string | null;
    transitionNote?: string | null;
    scoringMode: string;
    supportTier: string;
    description: string;
    defaultEnabled: boolean;
    sortOrder: number;
    requirements: Array<{
      reqCode: string;
      clauseRef?: string | null;
      domain: string;
      title: string;
      description: string;
      guidance: string | null;
      levelOrCategory: string | null;
      prescriptiveSla: Record<string, unknown> | null;
      deadlineDate: string | null;
      isDraft?: boolean;
      evidenceExpected: string | null;
      sortOrder: number;
      isoMappings: Array<{
        controlNumber: string;
        coverage: string;
        notes: string | null;
      }>;
    }>;
  }>;
}

interface OntologyIso27002Attributes {
  control_types: Array<"Preventive" | "Detective" | "Corrective">;
  info_sec_properties: Array<"Confidentiality" | "Integrity" | "Availability">;
  cybersecurity_concepts: Array<"Identify" | "Protect" | "Detect" | "Respond" | "Recover">;
  operational_capabilities: string[];
  security_domains: Array<"Governance_and_Ecosystem" | "Protection" | "Defence" | "Resilience">;
}

interface OntologyControl {
  control_number: string;
  control_name: string;
  category: string;
  short_summary?: string;
  plain_english_summary?: string;
  why_it_matters?: string;
  key_deliverables?: string[];
  audit_focus_summary?: string;
  iso27002_attributes?: OntologyIso27002Attributes | null;
  questions: Array<{
    question_id: number;
    question: string;
    guidance: string;
    auditor_focus: string;
    evidence_type: string;
    answer_type: string;
    what_good_looks_like: string;
    red_flags: string;
    nc_pattern: string;
    severity: string;
    primary_persona: string;
    related_controls: string;
    cps234_ref?: string;
    cps230_ref?: string;
  }>;
}

interface OntologyFile {
  metadata: {
    version: string;
    standard: string;
    total_controls: number;
    total_questions: number;
    categories: string[];
  };
  controls: OntologyControl[];
}

const CATEGORY_ORDER: Array<{ name: string; sortOrder: number; ownerRole: string }> = [
  { name: "ISMS Requirements", sortOrder: 1, ownerRole: "IS" },
  { name: "Organisational Controls", sortOrder: 2, ownerRole: "IS" },
  { name: "People Controls", sortOrder: 3, ownerRole: "HR" },
  { name: "Physical Controls", sortOrder: 4, ownerRole: "Facilities" },
  { name: "Technological Controls", sortOrder: 5, ownerRole: "Security Engineering" },
];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_profiles (
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
  ai_provider TEXT NOT NULL DEFAULT 'auto',
  ai_base_url TEXT,
  ai_routing_preset TEXT NOT NULL DEFAULT '${DEFAULT_AI_ROUTING_PRESET}',
  ai_zdr_only INTEGER NOT NULL DEFAULT 1,
  ai_screening_model TEXT NOT NULL DEFAULT '${DEFAULT_SCREENING_MODEL}',
  ai_synthesis_model TEXT NOT NULL DEFAULT '${DEFAULT_SYNTHESIS_MODEL}',
  ai_daily_token_budget INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_TOKEN_BUDGET},
  ai_daily_cost_budget_usd REAL NOT NULL DEFAULT ${DEFAULT_DAILY_COST_BUDGET_USD},
  ai_max_chunks_per_run INTEGER NOT NULL DEFAULT ${DEFAULT_MAX_CHUNKS_PER_RUN},
  soa_version TEXT NOT NULL DEFAULT '1.0',
  soa_approved_by TEXT,
  soa_approved_at TEXT,
  climate_change_relevant TEXT NOT NULL DEFAULT 'Undetermined',
  climate_change_rationale TEXT,
  onboarding_dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS control_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  control_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  short_summary TEXT,
  plain_english_summary TEXT,
  why_it_matters TEXT,
  key_deliverables_json TEXT NOT NULL DEFAULT '[]',
  audit_focus_summary TEXT,
  iso27002_attributes_json TEXT,
  questionnaire_source TEXT NOT NULL DEFAULT 'seed',
  category_id INTEGER NOT NULL REFERENCES control_categories(id),
  owner_role TEXT,
  default_frequency TEXT DEFAULT 'Annual',
  start_quarter TEXT DEFAULT 'Q1',
  cps234_reference TEXT,
  cps230_reference TEXT,
  annex_a_reference TEXT,
  questionnaire_json TEXT,
  questionnaire_generated_at TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS control_org_guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  control_id INTEGER NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  profile_hash TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  model_used TEXT NOT NULL,
  provider TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, control_id, profile_hash)
) STRICT;

CREATE TABLE IF NOT EXISTS legacy_question_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_control_id INTEGER NOT NULL REFERENCES workspace_controls(id) ON DELETE CASCADE,
  control_number TEXT NOT NULL,
  legacy_question_id INTEGER NOT NULL,
  mapped_question_id INTEGER,
  ontology_version TEXT NOT NULL,
  response_text TEXT NOT NULL,
  evidence_references_json TEXT NOT NULL DEFAULT '[]',
  original_updated_at TEXT,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_control_id, ontology_version, legacy_question_id)
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  control_id INTEGER NOT NULL REFERENCES controls(id),
  frequency TEXT,
  start_quarter TEXT,
  is_applicable INTEGER NOT NULL DEFAULT 1,
  inclusion_justification TEXT,
  exclusion_justification TEXT,
  implementation_status TEXT NOT NULL DEFAULT 'NotImplemented',
  next_due_date TEXT,
  selected_persona TEXT NOT NULL DEFAULT 'Auditor',
  selected_urgency TEXT NOT NULL DEFAULT 'later',
  implementation_updated_at TEXT,
  UNIQUE(workspace_id, control_id)
) STRICT;

CREATE TABLE IF NOT EXISTS question_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_control_id INTEGER NOT NULL REFERENCES workspace_controls(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  response_text TEXT NOT NULL DEFAULT '',
  evidence_references_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_control_id, question_id)
) STRICT;

CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  workspace_control_id INTEGER NOT NULL REFERENCES workspace_controls(id),
  test_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status TEXT NOT NULL,
  comments TEXT,
  ai_analysis TEXT,
  ai_suggested_status TEXT,
  ai_confidence REAL,
  ai_context_scope TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS ai_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  control_id INTEGER REFERENCES controls(id),
  test_run_id INTEGER REFERENCES test_runs(id),
  input_summary TEXT,
  output_summary TEXT,
  model_used TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  blob_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  document_date TEXT,
  evidence_type TEXT,
  description TEXT,
  extracted_text TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  extraction_error TEXT,
  page_count INTEGER,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  section_heading TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS document_control_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_control_id INTEGER NOT NULL REFERENCES workspace_controls(id) ON DELETE CASCADE,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  analysis_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(document_id, workspace_control_id)
) STRICT;

CREATE TABLE IF NOT EXISTS document_question_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_control_id INTEGER NOT NULL REFERENCES workspace_controls(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL,
  content_relevance REAL NOT NULL,
  evidence_type_match INTEGER NOT NULL DEFAULT 0,
  specificity REAL NOT NULL,
  composite_score REAL NOT NULL,
  matched_passage TEXT,
  ai_summary TEXT,
  suggested_response TEXT,
  user_accepted INTEGER,
  accepted_at TEXT,
  is_cross_control INTEGER NOT NULL DEFAULT 0,
  source_control_id INTEGER,
  chunk_id INTEGER REFERENCES document_chunks(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS evidence_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_control_id INTEGER REFERENCES workspace_controls(id) ON DELETE CASCADE,
  question_id INTEGER,
  test_run_id INTEGER REFERENCES test_runs(id),
  title TEXT NOT NULL,
  url TEXT,
  evidence_type TEXT,
  description TEXT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS response_change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  workspace_control_id INTEGER NOT NULL REFERENCES workspace_controls(id),
  question_id INTEGER NOT NULL,
  previous_response TEXT,
  new_response TEXT NOT NULL,
  change_source TEXT NOT NULL,
  ontology_version TEXT,
  source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  source_match_id INTEGER REFERENCES document_question_matches(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Staged AI Agent Proposals (human-gated before writing to immutable audit tables)
CREATE TABLE IF NOT EXISTS pending_agent_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  run_label TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  rationale TEXT NOT NULL,
  quoted_passage TEXT,
  source_document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  source_document_title TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  has_rubric_conflict INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  model_used TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_agent_proposals_ws_status
  ON pending_agent_proposals(workspace_id, status, created_at DESC);

-- Normalized Multi-Framework Architecture (ISO 27001, Essential Eight, Privacy Act, Cyber Security Act 2024, APRA CPS 234/230, SOCI, AI6)
CREATE TABLE IF NOT EXISTS frameworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  version TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'International',
  instrument_id TEXT,
  source_url TEXT,
  effective_date TEXT,
  transition_note TEXT,
  scoring_mode TEXT NOT NULL,
  support_tier TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_frameworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  framework_id INTEGER NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  target_level TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, framework_id)
) STRICT;

CREATE TABLE IF NOT EXISTS framework_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  framework_id INTEGER NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  req_code TEXT NOT NULL,
  clause_ref TEXT,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  guidance TEXT,
  level_or_category TEXT,
  prescriptive_sla_json TEXT,
  deadline_date TEXT,
  is_draft INTEGER NOT NULL DEFAULT 0,
  evidence_expected TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(framework_id, req_code)
) STRICT;

CREATE TABLE IF NOT EXISTS control_framework_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  control_id INTEGER NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES framework_requirements(id) ON DELETE CASCADE,
  coverage TEXT NOT NULL,
  mapping_notes TEXT,
  UNIQUE(control_id, requirement_id)
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_requirement_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES framework_requirements(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'NotMet',
  notes TEXT,
  evidence_summary TEXT,
  owner TEXT,
  target_date TEXT,
  assessed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, requirement_id)
) STRICT;

CREATE TABLE IF NOT EXISTS requirement_assessment_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  framework_code TEXT NOT NULL,
  req_code TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  notes TEXT,
  evidence_summary TEXT,
  owner TEXT,
  target_date TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS requirement_evidence_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  requirement_id INTEGER NOT NULL REFERENCES framework_requirements(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  evidence_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Governance Registers (ISO Clauses 6.1.2/6.1.3, 7.5, 9.2/9.3, 10.2, APRA CPS 230, Cyber Security Act 2024)
CREATE TABLE IF NOT EXISTS risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  risk_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  asset_or_process TEXT,
  threat TEXT,
  likelihood INTEGER NOT NULL DEFAULT 3,
  impact INTEGER NOT NULL DEFAULT 3,
  treatment TEXT NOT NULL DEFAULT 'Mitigate',
  treatment_plan TEXT,
  residual_likelihood INTEGER NOT NULL DEFAULT 2,
  residual_impact INTEGER NOT NULL DEFAULT 2,
  owner TEXT,
  review_date TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, risk_code)
) STRICT;

CREATE TABLE IF NOT EXISTS risk_control_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  control_number TEXT NOT NULL,
  UNIQUE(risk_id, control_number)
) STRICT;

CREATE TABLE IF NOT EXISTS capa_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  capa_code TEXT NOT NULL,
  title TEXT NOT NULL,
  finding_type TEXT NOT NULL DEFAULT 'MinorNC',
  source TEXT,
  control_number TEXT,
  framework_code TEXT,
  req_code TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  owner TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  verification_notes TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, capa_code)
) STRICT;

CREATE TABLE IF NOT EXISTS governance_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  title TEXT NOT NULL,
  review_date TEXT NOT NULL,
  scope TEXT,
  lead_or_chair TEXT,
  attendees TEXT,
  findings_summary TEXT,
  decisions_and_actions TEXT,
  next_review_date TEXT,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Completed',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_description TEXT,
  is_material_service_provider INTEGER NOT NULL DEFAULT 0,
  criticality TEXT NOT NULL DEFAULT 'Medium',
  data_residency TEXT,
  data_types_shared TEXT,
  owner TEXT,
  contract_expiry_date TEXT,
  last_reviewed_date TEXT,
  exit_plan_status TEXT NOT NULL DEFAULT 'Missing',
  risk_rating TEXT NOT NULL DEFAULT 'Medium',
  notes TEXT,
  linked_controls_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  policy_code TEXT NOT NULL,
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  owner TEXT,
  approver TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  approved_at TEXT,
  next_review_date TEXT,
  content_markdown TEXT NOT NULL DEFAULT '',
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  linked_controls_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, policy_code)
) STRICT;

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  incident_code TEXT NOT NULL,
  title TEXT NOT NULL,
  incident_type TEXT NOT NULL DEFAULT 'CyberIncident',
  severity TEXT NOT NULL DEFAULT 'High',
  detected_at TEXT NOT NULL,
  ransom_payment_at TEXT,
  status TEXT NOT NULL DEFAULT 'Investigating',
  summary TEXT,
  affected_systems TEXT,
  regulator_notified INTEGER NOT NULL DEFAULT 0,
  regulator_name TEXT,
  regulator_ref TEXT,
  regulator_notified_at TEXT,
  linked_controls_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(workspace_id, incident_code)
) STRICT;

-- Composite & lookup indexes
CREATE INDEX IF NOT EXISTS idx_wc_workspace ON workspace_controls(workspace_id);
CREATE INDEX IF NOT EXISTS idx_qr_ws_ctrl ON question_responses(workspace_id, workspace_control_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_ws_ctrl_date ON test_runs(workspace_id, workspace_control_id, test_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ai_ws_date ON ai_interactions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_ws_hash ON documents(workspace_id, file_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_idx ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_dcl_ws_ctrl ON document_control_links(workspace_id, workspace_control_id);
CREATE INDEX IF NOT EXISTS idx_dqm_ws_ctrl_active ON document_question_matches(workspace_id, workspace_control_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ev_ws_ctrl ON evidence_links(workspace_id, workspace_control_id);
CREATE INDEX IF NOT EXISTS idx_rcl_ws_ctrl_q ON response_change_log(workspace_id, workspace_control_id, question_id);
CREATE INDEX IF NOT EXISTS idx_fw_req_fw ON framework_requirements(framework_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cfm_req ON control_framework_mappings(requirement_id);
CREATE INDEX IF NOT EXISTS idx_cfm_ctrl ON control_framework_mappings(control_id);
CREATE INDEX IF NOT EXISTS idx_wra_ws_req ON workspace_requirement_assessments(workspace_id, requirement_id);
CREATE INDEX IF NOT EXISTS idx_ral_ws_fw_req ON requirement_assessment_log(workspace_id, framework_code, req_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rel_ws_req ON requirement_evidence_links(workspace_id, requirement_id);
CREATE INDEX IF NOT EXISTS idx_risks_ws ON risks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_risk_ctrl_ws ON risk_control_links(workspace_id, control_number);
CREATE INDEX IF NOT EXISTS idx_capa_ws ON capa_items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_gov_rev_ws ON governance_reviews(workspace_id);
CREATE INDEX IF NOT EXISTS idx_vendors_ws ON vendors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_policies_ws ON policies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_incidents_ws ON incidents(workspace_id);

-- Enforce append-only audit trail immutability at the database level
CREATE TRIGGER IF NOT EXISTS trg_test_runs_no_update
BEFORE UPDATE ON test_runs
BEGIN
  SELECT RAISE(ABORT, 'test_runs is append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS trg_test_runs_no_delete
BEFORE DELETE ON test_runs
BEGIN
  SELECT RAISE(ABORT, 'test_runs is append-only and cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_response_change_log_no_update
BEFORE UPDATE ON response_change_log
BEGIN
  SELECT RAISE(ABORT, 'response_change_log is append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS trg_response_change_log_no_delete
BEFORE DELETE ON response_change_log
BEGIN
  SELECT RAISE(ABORT, 'response_change_log is append-only and cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_req_assessment_log_no_update
BEFORE UPDATE ON requirement_assessment_log
BEGIN
  SELECT RAISE(ABORT, 'requirement_assessment_log is append-only and cannot be updated');
END;

CREATE TRIGGER IF NOT EXISTS trg_req_assessment_log_no_delete
BEFORE DELETE ON requirement_assessment_log
BEGIN
  SELECT RAISE(ABORT, 'requirement_assessment_log is append-only and cannot be deleted');
END;
`;

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

function collectUniqueRefs(
  questions: OntologyControl["questions"],
  field: "cps234_ref" | "cps230_ref",
): string | null {
  const refs = new Set<string>();
  for (const q of questions) {
    const val = q[field];
    if (!val) continue;
    for (const part of val.split(";")) {
      const trimmed = part.trim();
      if (trimmed) refs.add(trimmed);
    }
  }
  return refs.size > 0 ? Array.from(refs).join("; ") : null;
}

function buildQuestionnaire(questions: OntologyControl["questions"]): ControlQuestionnaire {
  const byPersona: Record<Persona, number> = { Auditor: 0, Advisor: 0, Analyst: 0 };
  const mapped: OntologyQuestion[] = questions.map((q) => {
    const persona: Persona =
      q.primary_persona === "Advisor" || q.primary_persona === "Analyst"
        ? q.primary_persona
        : "Auditor";
    byPersona[persona]++;
    return {
      question_id: q.question_id,
      question: q.question,
      guidance: q.guidance,
      auditor_focus: q.auditor_focus,
      evidence_type: q.evidence_type,
      answer_type: q.answer_type,
      what_good_looks_like: q.what_good_looks_like,
      red_flags: q.red_flags,
      nc_pattern: q.nc_pattern,
      severity:
        q.severity === "Critical" ||
        q.severity === "High" ||
        q.severity === "Medium" ||
        q.severity === "Low"
          ? q.severity
          : "Medium",
      primary_persona: persona,
      related_controls: q.related_controls,
      cps234_ref: q.cps234_ref || "",
      cps230_ref: q.cps230_ref || "",
    };
  });
  return {
    questions: mapped,
    metadata: { total_questions: mapped.length, by_persona: byPersona },
  };
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runAdditiveMigrations(db: DatabaseSync): void {
  ensureColumn(db, "workspace_controls", "inclusion_justification", "TEXT");
  ensureColumn(
    db,
    "workspace_controls",
    "implementation_status",
    "TEXT NOT NULL DEFAULT 'NotImplemented'",
  );
  ensureColumn(db, "workspace_profiles", "soa_version", "TEXT NOT NULL DEFAULT '1.0'");
  ensureColumn(db, "workspace_profiles", "soa_approved_by", "TEXT");
  ensureColumn(db, "workspace_profiles", "soa_approved_at", "TEXT");
  ensureColumn(
    db,
    "workspace_profiles",
    "climate_change_relevant",
    "TEXT NOT NULL DEFAULT 'Undetermined'",
  );
  ensureColumn(db, "workspace_profiles", "climate_change_rationale", "TEXT");
  ensureColumn(db, "workspace_profiles", "onboarding_dismissed", "INTEGER NOT NULL DEFAULT 0");

  // v2.2 provenance & legislative lifecycle metadata columns
  ensureColumn(db, "frameworks", "jurisdiction", "TEXT NOT NULL DEFAULT 'International'");
  ensureColumn(db, "frameworks", "instrument_id", "TEXT");
  ensureColumn(db, "frameworks", "source_url", "TEXT");
  ensureColumn(db, "frameworks", "effective_date", "TEXT");
  ensureColumn(db, "frameworks", "transition_note", "TEXT");
  ensureColumn(db, "framework_requirements", "clause_ref", "TEXT");
  ensureColumn(db, "framework_requirements", "is_draft", "INTEGER NOT NULL DEFAULT 0");

  // v3.0 multi-provider AI configuration columns
  ensureColumn(db, "workspace_profiles", "ai_provider", "TEXT NOT NULL DEFAULT 'auto'");
  ensureColumn(db, "workspace_profiles", "ai_base_url", "TEXT");

  // v3.2 OpenRouter routing presets, ZDR privacy toggle, and exact USD spend ledger
  ensureColumn(db, "workspace_profiles", "ai_routing_preset", "TEXT NOT NULL DEFAULT 'balanced'");
  ensureColumn(db, "workspace_profiles", "ai_zdr_only", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(
    db,
    "workspace_profiles",
    "ai_daily_cost_budget_usd",
    `REAL NOT NULL DEFAULT ${DEFAULT_DAILY_COST_BUDGET_USD}`,
  );
  ensureColumn(db, "ai_interactions", "provider", "TEXT");
  ensureColumn(db, "ai_interactions", "prompt_tokens", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "ai_interactions", "completion_tokens", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "ai_interactions", "cost_usd", "REAL NOT NULL DEFAULT 0");

  // v3.3 control-level plain-English explainers, ISO 27002:2022 attributes & safe v3.0 ontology tracking
  ensureColumn(db, "controls", "short_summary", "TEXT");
  ensureColumn(db, "controls", "plain_english_summary", "TEXT");
  ensureColumn(db, "controls", "why_it_matters", "TEXT");
  ensureColumn(db, "controls", "key_deliverables_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "controls", "audit_focus_summary", "TEXT");
  ensureColumn(db, "controls", "iso27002_attributes_json", "TEXT");
  ensureColumn(db, "controls", "questionnaire_source", "TEXT NOT NULL DEFAULT 'seed'");
  // Safe additive column on append-only log (ALTER TABLE ADD COLUMN does not fire BEFORE UPDATE triggers)
  ensureColumn(db, "response_change_log", "ontology_version", "TEXT");

  // v3.1 provider-agnostic auto-detect default: upgrade untouched legacy Anthropic default rows once
  const autoMigRow = db
    .prepare("SELECT value FROM app_meta WHERE key = 'v3_1_provider_auto_default'")
    .get() as { value: string } | undefined;
  if (!autoMigRow) {
    db.exec(`
      UPDATE workspace_profiles
      SET ai_provider = 'auto',
          ai_screening_model = 'auto',
          ai_synthesis_model = 'auto'
      WHERE ai_provider IN ('anthropic', 'auto')
        AND ai_screening_model = 'claude-sonnet-4-6'
        AND ai_synthesis_model = 'claude-opus-4-6'
    `);
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(
      "v3_1_provider_auto_default",
      "1",
    );
  }

  // ISO 27001 Clause 6.1.3(d): Clauses 4–10 (RQ4–RQ10) are mandatory and cannot be excluded
  db.exec(`
    UPDATE workspace_controls
    SET is_applicable = 1, exclusion_justification = NULL
    WHERE control_id IN (SELECT id FROM controls WHERE control_number LIKE 'RQ%')
      AND is_applicable = 0
  `);
}

/**
 * Idempotent ontology, multi-framework catalog & default workspace bootstrap.
 * Upserts categories, ISO 27001:2022 (+ Amd 1:2024 + APRA CPS 234/CPS 230) controls,
 * and normalized frameworks (ACSC Essential Eight, Australian Privacy Act APPs + POLA 2024)
 * without ever deleting or overwriting user workspace data.
 */
function ensureSeeded(db: DatabaseSync): void {
  const data = ontologyData as OntologyFile;
  const fwSeed = frameworksData as FrameworksSeedFile;
  const now = new Date().toISOString();

  runAdditiveMigrations(db);

  const metaRow = db.prepare("SELECT value FROM app_meta WHERE key = 'ontology_version'").get() as
    | { value: string }
    | undefined;
  const ontologyNeedsRefresh = metaRow?.value !== data.metadata.version;

  db.exec("BEGIN");
  try {
    const upsertCat = db.prepare(`
      INSERT INTO control_categories (name, sort_order)
      VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET sort_order = excluded.sort_order
    `);
    const getCat = db.prepare("SELECT id FROM control_categories WHERE name = ?");
    const categoryIdByName = new Map<string, number>();
    const ownerRoleByName = new Map<string, string>();

    for (const cat of CATEGORY_ORDER) {
      upsertCat.run(cat.name, cat.sortOrder);
      const row = getCat.get(cat.name) as { id: number };
      categoryIdByName.set(cat.name, row.id);
      ownerRoleByName.set(cat.name, cat.ownerRole);
    }

    const upsertControl = db.prepare(`
      INSERT INTO controls (
        control_number, name, description,
        short_summary, plain_english_summary, why_it_matters,
        key_deliverables_json, audit_focus_summary, iso27002_attributes_json,
        questionnaire_source,
        category_id, owner_role,
        default_frequency, start_quarter, cps234_reference, cps230_reference,
        annex_a_reference, questionnaire_json, questionnaire_generated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?, 'Annual', 'Q1', ?, ?, ?, ?, ?)
      ON CONFLICT(control_number) DO UPDATE SET
        name = excluded.name,
        description = CASE WHEN ? = 1 THEN excluded.description ELSE COALESCE(controls.description, excluded.description) END,
        short_summary = excluded.short_summary,
        plain_english_summary = excluded.plain_english_summary,
        why_it_matters = excluded.why_it_matters,
        key_deliverables_json = excluded.key_deliverables_json,
        audit_focus_summary = excluded.audit_focus_summary,
        iso27002_attributes_json = excluded.iso27002_attributes_json,
        category_id = excluded.category_id,
        cps234_reference = excluded.cps234_reference,
        cps230_reference = excluded.cps230_reference,
        annex_a_reference = excluded.annex_a_reference,
        questionnaire_json = CASE
          WHEN controls.questionnaire_source = 'ai_generated' THEN controls.questionnaire_json
          WHEN ? = 1 THEN excluded.questionnaire_json
          ELSE COALESCE(controls.questionnaire_json, excluded.questionnaire_json)
        END
    `);

    const controlIdByNumber = new Map<string, number>();
    const getControlId = db.prepare("SELECT id FROM controls WHERE control_number = ?");

    for (const ctrl of data.controls) {
      const catId = categoryIdByName.get(ctrl.category);
      if (!catId) continue;
      const questionnaire = buildQuestionnaire(ctrl.questions);
      const description = ctrl.plain_english_summary || ctrl.questions[0]?.guidance || null;
      const annexA = !ctrl.control_number.startsWith("RQ") ? `A.${ctrl.control_number}` : null;
      const refreshFlag = ontologyNeedsRefresh ? 1 : 0;
      const isoAttrs = ctrl.iso27002_attributes
        ? JSON.stringify({
            controlTypes: ctrl.iso27002_attributes.control_types,
            infoSecProperties: ctrl.iso27002_attributes.info_sec_properties,
            cybersecurityConcepts: ctrl.iso27002_attributes.cybersecurity_concepts,
            operationalCapabilities: ctrl.iso27002_attributes.operational_capabilities,
            securityDomains: ctrl.iso27002_attributes.security_domains,
          })
        : null;
      upsertControl.run(
        ctrl.control_number,
        ctrl.control_name,
        description,
        ctrl.short_summary ?? null,
        ctrl.plain_english_summary ?? null,
        ctrl.why_it_matters ?? null,
        JSON.stringify(ctrl.key_deliverables ?? []),
        ctrl.audit_focus_summary ?? null,
        isoAttrs,
        catId,
        ownerRoleByName.get(ctrl.category) || "IS",
        collectUniqueRefs(ctrl.questions, "cps234_ref"),
        collectUniqueRefs(ctrl.questions, "cps230_ref"),
        annexA,
        JSON.stringify(questionnaire),
        now,
        refreshFlag,
        refreshFlag,
      );
      const row = getControlId.get(ctrl.control_number) as { id: number } | undefined;
      if (row) controlIdByNumber.set(ctrl.control_number, row.id);
    }

    // Zero-data-loss v2.x -> v3.0 response migration when upgrading an existing database
    const isUpgradingFromV2 = Boolean(metaRow?.value?.startsWith("2."));
    const isTargetV3 = data.metadata.version.startsWith("3.");
    if (isTargetV3 && isUpgradingFromV2) {
      const migrationMap = loadOntologyMigrationMap();
      if (migrationMap) {
        migrateOntologyResponsesV21ToV30(db, migrationMap);
      }
    }

    db.prepare(`
      INSERT INTO app_meta (key, value) VALUES ('ontology_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(data.metadata.version);

    // Seed normalized multi-framework catalog, requirements, and ISO control mappings
    const upsertFw = db.prepare(`
      INSERT INTO frameworks (
        code, name, short_name, version, jurisdiction, instrument_id, source_url,
        effective_date, transition_note, scoring_mode, support_tier, description, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        version = excluded.version,
        jurisdiction = excluded.jurisdiction,
        instrument_id = excluded.instrument_id,
        source_url = excluded.source_url,
        effective_date = excluded.effective_date,
        transition_note = excluded.transition_note,
        scoring_mode = excluded.scoring_mode,
        support_tier = excluded.support_tier,
        description = excluded.description,
        sort_order = excluded.sort_order
    `);
    const getFwId = db.prepare("SELECT id FROM frameworks WHERE code = ?");
    const upsertReq = db.prepare(`
      INSERT INTO framework_requirements (
        framework_id, req_code, clause_ref, domain, title, description, guidance,
        level_or_category, prescriptive_sla_json, deadline_date, is_draft, evidence_expected, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(framework_id, req_code) DO UPDATE SET
        clause_ref = excluded.clause_ref,
        domain = excluded.domain,
        title = excluded.title,
        description = excluded.description,
        guidance = excluded.guidance,
        level_or_category = excluded.level_or_category,
        prescriptive_sla_json = excluded.prescriptive_sla_json,
        deadline_date = excluded.deadline_date,
        is_draft = excluded.is_draft,
        evidence_expected = excluded.evidence_expected,
        sort_order = excluded.sort_order
    `);
    const getReqId = db.prepare(
      "SELECT id FROM framework_requirements WHERE framework_id = ? AND req_code = ?",
    );
    const deleteMapsForReq = db.prepare(
      "DELETE FROM control_framework_mappings WHERE requirement_id = ?",
    );
    const upsertMap = db.prepare(`
      INSERT INTO control_framework_mappings (control_id, requirement_id, coverage, mapping_notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(control_id, requirement_id) DO UPDATE SET
        coverage = excluded.coverage,
        mapping_notes = excluded.mapping_notes
    `);
    const getExistingReqs = db.prepare(
      "SELECT id, req_code FROM framework_requirements WHERE framework_id = ?",
    );
    const deleteStaleReq = db.prepare("DELETE FROM framework_requirements WHERE id = ?");

    const seededFrameworks: Array<{ id: number; code: string; defaultEnabled: boolean }> = [];

    for (const fw of fwSeed.frameworks) {
      upsertFw.run(
        fw.code,
        fw.name,
        fw.shortName,
        fw.version,
        fw.jurisdiction ?? "International",
        fw.instrumentId ?? null,
        fw.sourceUrl ?? null,
        fw.effectiveDate ?? null,
        fw.transitionNote ?? null,
        fw.scoringMode,
        fw.supportTier,
        fw.description,
        fw.sortOrder,
      );
      const fwRow = getFwId.get(fw.code) as { id: number };
      seededFrameworks.push({ id: fwRow.id, code: fw.code, defaultEnabled: fw.defaultEnabled });

      const activeCodes = new Set<string>();
      for (const req of fw.requirements) {
        activeCodes.add(req.reqCode);
        upsertReq.run(
          fwRow.id,
          req.reqCode,
          req.clauseRef ?? null,
          req.domain,
          req.title,
          req.description,
          req.guidance,
          req.levelOrCategory,
          req.prescriptiveSla ? JSON.stringify(req.prescriptiveSla) : null,
          req.deadlineDate,
          req.isDraft ? 1 : 0,
          req.evidenceExpected,
          req.sortOrder,
        );
        const reqRow = getReqId.get(fwRow.id, req.reqCode) as { id: number };
        deleteMapsForReq.run(reqRow.id);
        for (const m of req.isoMappings) {
          const ctrlId = controlIdByNumber.get(m.controlNumber);
          if (ctrlId) {
            upsertMap.run(ctrlId, reqRow.id, m.coverage, m.notes);
          }
        }
      }

      // Prune obsolete requirement codes (e.g., upgrading v2.1 24 summary E8 rows to v2.2 72 discrete criteria)
      const existingReqs = getExistingReqs.all(fwRow.id) as Array<{ id: number; req_code: string }>;
      for (const existing of existingReqs) {
        if (!activeCodes.has(existing.req_code)) {
          deleteStaleReq.run(existing.id);
        }
      }
    }

    db.prepare(`
      INSERT INTO app_meta (key, value) VALUES ('frameworks_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(fwSeed.version);

    // Create an initial neutral workspace only on a completely empty database
    const wsCount = (db.prepare("SELECT COUNT(*) as c FROM workspaces").get() as { c: number }).c;
    if (wsCount === 0) {
      const res = db
        .prepare("INSERT INTO workspaces (name, slug) VALUES (?, ?)")
        .run("My Organisation", "my-organisation");
      const workspaceId = Number(res.lastInsertRowid);
      db.prepare(
        "INSERT INTO workspace_profiles (workspace_id, company_name, regulatory_requirements_json) VALUES (?, ?, ?)",
      ).run(
        workspaceId,
        "My Organisation",
        JSON.stringify([
          "ISO/IEC 27001:2022",
          "ACSC Essential Eight",
          "Australian Privacy Act (APPs)",
          "Cyber Security Act 2024 (Cth)",
        ]),
      );

      // Provision workspace_controls with NULL frequency/start_quarter so workspace schedule defaults inherit naturally
      db.prepare(`
        INSERT OR IGNORE INTO workspace_controls (
          workspace_id, control_id, frequency, start_quarter, is_applicable, selected_persona, selected_urgency
        )
        SELECT ?, id, NULL, NULL, 1, 'Auditor', 'later'
        FROM controls
      `).run(workspaceId);
    }

    // Ensure every workspace has workspace_frameworks rows for all seeded frameworks
    const allWorkspaces = db.prepare("SELECT id FROM workspaces").all() as Array<{ id: number }>;
    const insertWsFw = db.prepare(`
      INSERT OR IGNORE INTO workspace_frameworks (workspace_id, framework_id, enabled, target_level)
      VALUES (?, ?, ?, ?)
    `);
    for (const ws of allWorkspaces) {
      for (const fw of seededFrameworks) {
        insertWsFw.run(
          ws.id,
          fw.id,
          fw.defaultEnabled ? 1 : 0,
          fw.code === "acsc_e8_2023" ? "ML1" : null,
        );
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function getDb(): DatabaseSync {
  const targetPath = getDbPath();
  if (dbInstance && currentDbPath === targetPath) {
    return dbInstance;
  }
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore
    }
    dbInstance = null;
  }

  const db = new DatabaseSync(targetPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA_SQL);
  ensureSeeded(db);

  try {
    if (fs.existsSync(targetPath)) fs.chmodSync(targetPath, 0o600);
  } catch {
    // Best-effort
  }

  dbInstance = db;
  currentDbPath = targetPath;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}
