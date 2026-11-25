import type {
  CapaFindingType,
  CapaRecord,
  CapaStatus,
  ExitPlanStatus,
  GovernanceReviewRecord,
  GovernanceReviewType,
  GovernanceSummary,
  IncidentRecord,
  IncidentStatus,
  IncidentType,
  PolicyRecord,
  PolicyStatus,
  RiskRecord,
  RiskStatus,
  RiskTreatment,
  Severity,
  StatutoryClockItem,
  VendorCriticality,
  VendorRecord,
} from "@shared/schema";
import { getDb } from "../db";
import { STARTER_RISKS } from "../policy-templates";
import { safeJsonParse } from "./common";

function nextCode(
  table: "risks" | "capa_items" | "policies" | "incidents",
  col: "risk_code" | "capa_code" | "policy_code" | "incident_code",
  prefix: string,
  workspaceId: number,
): string {
  const rows = getDb()
    .prepare(`SELECT ${col} AS code FROM ${table} WHERE workspace_id = ?`)
    .all(workspaceId) as Array<{ code: string }>;
  let max = 0;
  for (const r of rows) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(String(r.code || ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

export function computeStatutoryClocks(incident: {
  incidentType: IncidentType;
  detectedAt: string;
  ransomPaymentAt: string | null;
  regulatorNotified: boolean;
}): StatutoryClockItem[] {
  const clocks: StatutoryClockItem[] = [];
  const nowMs = Date.now();
  const addClock = (regime: string, label: string, startIso: string, hours: number) => {
    const startMs = Date.parse(startIso);
    if (!Number.isFinite(startMs)) return;
    const deadlineMs = startMs + hours * 3_600_000;
    const hoursRemaining = Math.round(((deadlineMs - nowMs) / 3_600_000) * 10) / 10;
    clocks.push({
      regime,
      label,
      deadlineAt: new Date(deadlineMs).toISOString(),
      hoursRemaining,
      overdue: !incident.regulatorNotified && hoursRemaining < 0,
      notified: incident.regulatorNotified,
    });
  };

  if (incident.incidentType === "RansomwareExtortion") {
    addClock(
      "Cyber Security Act 2024 (Part 3)",
      "72h Mandatory ASD Ransomware Payment Report",
      incident.ransomPaymentAt || incident.detectedAt,
      72,
    );
  }
  if (
    incident.incidentType === "DataBreachNDB" ||
    incident.incidentType === "RansomwareExtortion"
  ) {
    addClock(
      "Privacy Act 1988 (Part IIIC NDB)",
      "30-Day Eligible Data Breach Assessment Clock (s 26WH)",
      incident.detectedAt,
      30 * 24,
    );
  }
  if (
    incident.incidentType === "CyberIncident" ||
    incident.incidentType === "RansomwareExtortion" ||
    incident.incidentType === "DataBreachNDB"
  ) {
    addClock(
      "APRA CPS 234 §35 (if APRA-regulated)",
      "72h Material Information Security Incident Notice",
      incident.detectedAt,
      72,
    );
    addClock(
      "SOCI Act 2018 (if critical infrastructure)",
      "12h Critical Cyber Incident Report to ASD",
      incident.detectedAt,
      12,
    );
  }
  if (incident.incidentType === "OperationalDisruption") {
    addClock(
      "APRA CPS 230 §31 (if APRA-regulated)",
      "24h Material Operational Disruption Notice",
      incident.detectedAt,
      24,
    );
  }

  return clocks;
}

function mapRisk(row: Record<string, unknown>, linkedControls: string[]): RiskRecord {
  const likelihood = Number(row.likelihood || 3);
  const impact = Number(row.impact || 3);
  const residualLikelihood = Number(row.residual_likelihood || 2);
  const residualImpact = Number(row.residual_impact || 2);
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    riskCode: String(row.risk_code),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    assetOrProcess: row.asset_or_process != null ? String(row.asset_or_process) : null,
    threat: row.threat != null ? String(row.threat) : null,
    likelihood,
    impact,
    inherentScore: likelihood * impact,
    treatment: (row.treatment as RiskTreatment) || "Mitigate",
    treatmentPlan: row.treatment_plan != null ? String(row.treatment_plan) : null,
    residualLikelihood,
    residualImpact,
    residualScore: residualLikelihood * residualImpact,
    owner: row.owner != null ? String(row.owner) : null,
    reviewDate: row.review_date != null ? String(row.review_date) : null,
    status: (row.status as RiskStatus) || "Open",
    linkedControls,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCapa(row: Record<string, unknown>): CapaRecord {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    capaCode: String(row.capa_code),
    title: String(row.title),
    findingType: (row.finding_type as CapaFindingType) || "MinorNC",
    source: row.source != null ? String(row.source) : null,
    controlNumber: row.control_number != null ? String(row.control_number) : null,
    frameworkCode: row.framework_code != null ? String(row.framework_code) : null,
    reqCode: row.req_code != null ? String(row.req_code) : null,
    rootCause: row.root_cause != null ? String(row.root_cause) : null,
    correctiveAction: row.corrective_action != null ? String(row.corrective_action) : null,
    owner: row.owner != null ? String(row.owner) : null,
    dueDate: row.due_date != null ? String(row.due_date) : null,
    status: (row.status as CapaStatus) || "Open",
    verificationNotes: row.verification_notes != null ? String(row.verification_notes) : null,
    closedAt: row.closed_at != null ? String(row.closed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapReview(row: Record<string, unknown>): GovernanceReviewRecord {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    reviewType: row.review_type as GovernanceReviewType,
    title: String(row.title),
    reviewDate: String(row.review_date),
    scope: row.scope != null ? String(row.scope) : null,
    leadOrChair: row.lead_or_chair != null ? String(row.lead_or_chair) : null,
    attendees: row.attendees != null ? String(row.attendees) : null,
    findingsSummary: row.findings_summary != null ? String(row.findings_summary) : null,
    decisionsAndActions:
      row.decisions_and_actions != null ? String(row.decisions_and_actions) : null,
    nextReviewDate: row.next_review_date != null ? String(row.next_review_date) : null,
    documentId: row.document_id != null ? Number(row.document_id) : null,
    status: row.status === "Planned" ? "Planned" : "Completed",
    createdAt: String(row.created_at),
  };
}

function mapVendor(row: Record<string, unknown>): VendorRecord {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    name: String(row.name),
    serviceDescription: row.service_description != null ? String(row.service_description) : null,
    isMaterialServiceProvider: Boolean(row.is_material_service_provider),
    criticality: (row.criticality as VendorCriticality) || "Medium",
    dataResidency: row.data_residency != null ? String(row.data_residency) : null,
    dataTypesShared: row.data_types_shared != null ? String(row.data_types_shared) : null,
    owner: row.owner != null ? String(row.owner) : null,
    contractExpiryDate: row.contract_expiry_date != null ? String(row.contract_expiry_date) : null,
    lastReviewedDate: row.last_reviewed_date != null ? String(row.last_reviewed_date) : null,
    exitPlanStatus: (row.exit_plan_status as ExitPlanStatus) || "Missing",
    riskRating: (row.risk_rating as VendorCriticality) || "Medium",
    notes: row.notes != null ? String(row.notes) : null,
    linkedControls: safeJsonParse<string[]>(row.linked_controls_json as string, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPolicy(row: Record<string, unknown>): PolicyRecord {
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    policyCode: String(row.policy_code),
    title: String(row.title),
    version: String(row.version || "1.0"),
    owner: row.owner != null ? String(row.owner) : null,
    approver: row.approver != null ? String(row.approver) : null,
    status: (row.status as PolicyStatus) || "Draft",
    approvedAt: row.approved_at != null ? String(row.approved_at) : null,
    nextReviewDate: row.next_review_date != null ? String(row.next_review_date) : null,
    contentMarkdown: String(row.content_markdown || ""),
    documentId: row.document_id != null ? Number(row.document_id) : null,
    linkedControls: safeJsonParse<string[]>(row.linked_controls_json as string, []),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapIncident(row: Record<string, unknown>): IncidentRecord {
  const incidentType = (row.incident_type as IncidentType) || "CyberIncident";
  const detectedAt = String(row.detected_at);
  const ransomPaymentAt = row.ransom_payment_at != null ? String(row.ransom_payment_at) : null;
  const regulatorNotified = Boolean(row.regulator_notified);
  return {
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    incidentCode: String(row.incident_code),
    title: String(row.title),
    incidentType,
    severity: (row.severity as Severity) || "High",
    detectedAt,
    ransomPaymentAt,
    status: (row.status as IncidentStatus) || "Investigating",
    summary: row.summary != null ? String(row.summary) : null,
    affectedSystems: row.affected_systems != null ? String(row.affected_systems) : null,
    regulatorNotified,
    regulatorName: row.regulator_name != null ? String(row.regulator_name) : null,
    regulatorRef: row.regulator_ref != null ? String(row.regulator_ref) : null,
    regulatorNotifiedAt:
      row.regulator_notified_at != null ? String(row.regulator_notified_at) : null,
    linkedControls: safeJsonParse<string[]>(row.linked_controls_json as string, []),
    statutoryClocks: computeStatutoryClocks({
      incidentType,
      detectedAt,
      ransomPaymentAt,
      regulatorNotified,
    }),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface RiskInput {
  title: string;
  description?: string | null;
  assetOrProcess?: string | null;
  threat?: string | null;
  likelihood?: number;
  impact?: number;
  treatment?: RiskTreatment;
  treatmentPlan?: string | null;
  residualLikelihood?: number;
  residualImpact?: number;
  owner?: string | null;
  reviewDate?: string | null;
  status?: RiskStatus;
  linkedControls?: string[];
}

export interface CapaInput {
  title: string;
  findingType?: CapaFindingType;
  source?: string | null;
  controlNumber?: string | null;
  frameworkCode?: string | null;
  reqCode?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  owner?: string | null;
  dueDate?: string | null;
  status?: CapaStatus;
  verificationNotes?: string | null;
}

export interface GovernanceReviewInput {
  reviewType: GovernanceReviewType;
  title: string;
  reviewDate: string;
  scope?: string | null;
  leadOrChair?: string | null;
  attendees?: string | null;
  findingsSummary?: string | null;
  decisionsAndActions?: string | null;
  nextReviewDate?: string | null;
  documentId?: number | null;
  status?: "Planned" | "Completed";
}

export interface VendorInput {
  name: string;
  serviceDescription?: string | null;
  isMaterialServiceProvider?: boolean;
  criticality?: VendorCriticality;
  dataResidency?: string | null;
  dataTypesShared?: string | null;
  owner?: string | null;
  contractExpiryDate?: string | null;
  lastReviewedDate?: string | null;
  exitPlanStatus?: ExitPlanStatus;
  riskRating?: VendorCriticality;
  notes?: string | null;
  linkedControls?: string[];
}

export interface PolicyInput {
  title: string;
  version?: string;
  owner?: string | null;
  approver?: string | null;
  status?: PolicyStatus;
  approvedAt?: string | null;
  nextReviewDate?: string | null;
  contentMarkdown?: string;
  documentId?: number | null;
  linkedControls?: string[];
}

export interface IncidentInput {
  title: string;
  incidentType?: IncidentType;
  severity?: Severity;
  detectedAt: string;
  ransomPaymentAt?: string | null;
  status?: IncidentStatus;
  summary?: string | null;
  affectedSystems?: string | null;
  regulatorNotified?: boolean;
  regulatorName?: string | null;
  regulatorRef?: string | null;
  regulatorNotifiedAt?: string | null;
  linkedControls?: string[];
}

export const governanceRepository = {
  // ─── Risks ─────────────────────────────────────────────────────────────────

  listRisks(workspaceId: number): RiskRecord[] {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM risks WHERE workspace_id = ? ORDER BY (likelihood * impact) DESC, id ASC",
      )
      .all(workspaceId) as Array<Record<string, unknown>>;
    const linkRows = db
      .prepare(
        "SELECT risk_id, control_number FROM risk_control_links WHERE workspace_id = ? ORDER BY control_number ASC",
      )
      .all(workspaceId) as Array<{ risk_id: number; control_number: string }>;
    const byRisk = new Map<number, string[]>();
    for (const l of linkRows) {
      const arr = byRisk.get(Number(l.risk_id)) || [];
      arr.push(String(l.control_number));
      byRisk.set(Number(l.risk_id), arr);
    }
    return rows.map((r) => mapRisk(r, byRisk.get(Number(r.id)) || []));
  },

  listRiskCodesByControl(workspaceId: number): Map<string, string[]> {
    const rows = getDb()
      .prepare(`
        SELECT rcl.control_number, r.risk_code
        FROM risk_control_links rcl
        JOIN risks r ON r.id = rcl.risk_id
        WHERE rcl.workspace_id = ?
        ORDER BY r.risk_code ASC
      `)
      .all(workspaceId) as Array<{ control_number: string; risk_code: string }>;
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const arr = map.get(r.control_number) || [];
      arr.push(r.risk_code);
      map.set(r.control_number, arr);
    }
    return map;
  },

  createRisk(workspaceId: number, input: RiskInput): RiskRecord {
    const db = getDb();
    const code = nextCode("risks", "risk_code", "RSK", workspaceId);
    const likelihood = input.likelihood ?? 3;
    const impact = input.impact ?? 3;
    const resL = input.residualLikelihood ?? Math.max(1, likelihood - 1);
    const resI = input.residualImpact ?? impact;
    const now = new Date().toISOString();

    db.exec("BEGIN");
    try {
      const res = db
        .prepare(`
          INSERT INTO risks (
            workspace_id, risk_code, title, description, asset_or_process, threat,
            likelihood, impact, treatment, treatment_plan, residual_likelihood, residual_impact,
            owner, review_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          workspaceId,
          code,
          input.title,
          input.description ?? null,
          input.assetOrProcess ?? null,
          input.threat ?? null,
          likelihood,
          impact,
          input.treatment ?? "Mitigate",
          input.treatmentPlan ?? null,
          resL,
          resI,
          input.owner ?? null,
          input.reviewDate ?? null,
          input.status ?? "Open",
          now,
          now,
        );
      const id = Number(res.lastInsertRowid);
      const insLink = db.prepare(
        "INSERT OR IGNORE INTO risk_control_links (workspace_id, risk_id, control_number) VALUES (?, ?, ?)",
      );
      for (const cn of input.linkedControls || []) {
        if (cn.trim()) insLink.run(workspaceId, id, cn.trim());
      }
      db.exec("COMMIT");
      return governanceRepository.listRisks(workspaceId).find((r) => r.id === id)!;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },

  updateRisk(workspaceId: number, id: number, patch: Partial<RiskInput>): RiskRecord | null {
    const db = getDb();
    const cur = governanceRepository.listRisks(workspaceId).find((r) => r.id === id);
    if (!cur) return null;
    const now = new Date().toISOString();
    db.exec("BEGIN");
    try {
      db.prepare(`
        UPDATE risks SET
          title = ?, description = ?, asset_or_process = ?, threat = ?,
          likelihood = ?, impact = ?, treatment = ?, treatment_plan = ?,
          residual_likelihood = ?, residual_impact = ?, owner = ?,
          review_date = ?, status = ?, updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `).run(
        patch.title ?? cur.title,
        patch.description !== undefined ? patch.description : cur.description,
        patch.assetOrProcess !== undefined ? patch.assetOrProcess : cur.assetOrProcess,
        patch.threat !== undefined ? patch.threat : cur.threat,
        patch.likelihood ?? cur.likelihood,
        patch.impact ?? cur.impact,
        patch.treatment ?? cur.treatment,
        patch.treatmentPlan !== undefined ? patch.treatmentPlan : cur.treatmentPlan,
        patch.residualLikelihood ?? cur.residualLikelihood,
        patch.residualImpact ?? cur.residualImpact,
        patch.owner !== undefined ? patch.owner : cur.owner,
        patch.reviewDate !== undefined ? patch.reviewDate : cur.reviewDate,
        patch.status ?? cur.status,
        now,
        id,
        workspaceId,
      );
      if (patch.linkedControls !== undefined) {
        db.prepare("DELETE FROM risk_control_links WHERE risk_id = ? AND workspace_id = ?").run(
          id,
          workspaceId,
        );
        const insLink = db.prepare(
          "INSERT OR IGNORE INTO risk_control_links (workspace_id, risk_id, control_number) VALUES (?, ?, ?)",
        );
        for (const cn of patch.linkedControls) {
          if (cn.trim()) insLink.run(workspaceId, id, cn.trim());
        }
      }
      db.exec("COMMIT");
      return governanceRepository.listRisks(workspaceId).find((r) => r.id === id) || null;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },

  deleteRisk(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM risks WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },

  seedStarterRisks(workspaceId: number): RiskRecord[] {
    const existing = governanceRepository.listRisks(workspaceId);
    const existingTitles = new Set(existing.map((r) => r.title.toLowerCase()));
    const created: RiskRecord[] = [];
    for (const s of STARTER_RISKS) {
      if (!existingTitles.has(s.title.toLowerCase())) {
        created.push(governanceRepository.createRisk(workspaceId, s));
      }
    }
    return created;
  },

  // ─── CAPA & Nonconformities ────────────────────────────────────────────────

  listCapas(workspaceId: number): CapaRecord[] {
    return (
      getDb()
        .prepare(
          "SELECT * FROM capa_items WHERE workspace_id = ? ORDER BY status = 'VerifiedClosed' ASC, due_date ASC, id DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapCapa);
  },

  createCapa(workspaceId: number, input: CapaInput): CapaRecord {
    const db = getDb();
    const code = nextCode("capa_items", "capa_code", "NC", workspaceId);
    const now = new Date().toISOString();
    const status = input.status ?? "Open";
    const closedAt = status === "VerifiedClosed" ? now : null;
    const res = db
      .prepare(`
        INSERT INTO capa_items (
          workspace_id, capa_code, title, finding_type, source, control_number,
          framework_code, req_code, root_cause, corrective_action, owner,
          due_date, status, verification_notes, closed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        workspaceId,
        code,
        input.title,
        input.findingType ?? "MinorNC",
        input.source ?? null,
        input.controlNumber ?? null,
        input.frameworkCode ?? null,
        input.reqCode ?? null,
        input.rootCause ?? null,
        input.correctiveAction ?? null,
        input.owner ?? null,
        input.dueDate ?? null,
        status,
        input.verificationNotes ?? null,
        closedAt,
        now,
        now,
      );
    const row = db
      .prepare("SELECT * FROM capa_items WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapCapa(row);
  },

  updateCapa(workspaceId: number, id: number, patch: Partial<CapaInput>): CapaRecord | null {
    const db = getDb();
    const curRow = db
      .prepare("SELECT * FROM capa_items WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!curRow) return null;
    const cur = mapCapa(curRow);
    const nextStatus = patch.status ?? cur.status;
    const now = new Date().toISOString();
    const nextClosedAt = nextStatus === "VerifiedClosed" ? cur.closedAt || now : null;
    db.prepare(`
      UPDATE capa_items SET
        title = ?, finding_type = ?, source = ?, control_number = ?,
        framework_code = ?, req_code = ?, root_cause = ?, corrective_action = ?,
        owner = ?, due_date = ?, status = ?, verification_notes = ?,
        closed_at = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      patch.title ?? cur.title,
      patch.findingType ?? cur.findingType,
      patch.source !== undefined ? patch.source : cur.source,
      patch.controlNumber !== undefined ? patch.controlNumber : cur.controlNumber,
      patch.frameworkCode !== undefined ? patch.frameworkCode : cur.frameworkCode,
      patch.reqCode !== undefined ? patch.reqCode : cur.reqCode,
      patch.rootCause !== undefined ? patch.rootCause : cur.rootCause,
      patch.correctiveAction !== undefined ? patch.correctiveAction : cur.correctiveAction,
      patch.owner !== undefined ? patch.owner : cur.owner,
      patch.dueDate !== undefined ? patch.dueDate : cur.dueDate,
      nextStatus,
      patch.verificationNotes !== undefined ? patch.verificationNotes : cur.verificationNotes,
      nextClosedAt,
      now,
      id,
      workspaceId,
    );
    const updated = db.prepare("SELECT * FROM capa_items WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    return mapCapa(updated);
  },

  deleteCapa(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM capa_items WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },

  // ─── Internal Audits & Management Reviews ──────────────────────────────────

  listReviews(workspaceId: number): GovernanceReviewRecord[] {
    return (
      getDb()
        .prepare(
          "SELECT * FROM governance_reviews WHERE workspace_id = ? ORDER BY review_date DESC, id DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapReview);
  },

  createReview(workspaceId: number, input: GovernanceReviewInput): GovernanceReviewRecord {
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO governance_reviews (
          workspace_id, review_type, title, review_date, scope, lead_or_chair,
          attendees, findings_summary, decisions_and_actions, next_review_date,
          document_id, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        workspaceId,
        input.reviewType,
        input.title,
        input.reviewDate,
        input.scope ?? null,
        input.leadOrChair ?? null,
        input.attendees ?? null,
        input.findingsSummary ?? null,
        input.decisionsAndActions ?? null,
        input.nextReviewDate ?? null,
        input.documentId ?? null,
        input.status ?? "Completed",
      );
    const row = db
      .prepare("SELECT * FROM governance_reviews WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapReview(row);
  },

  deleteReview(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM governance_reviews WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },

  // ─── Vendors & Material Service Providers (CPS 230) ────────────────────────

  listVendors(workspaceId: number): VendorRecord[] {
    return (
      getDb()
        .prepare(
          "SELECT * FROM vendors WHERE workspace_id = ? ORDER BY is_material_service_provider DESC, name ASC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapVendor);
  },

  createVendor(workspaceId: number, input: VendorInput): VendorRecord {
    const db = getDb();
    const now = new Date().toISOString();
    const res = db
      .prepare(`
        INSERT INTO vendors (
          workspace_id, name, service_description, is_material_service_provider,
          criticality, data_residency, data_types_shared, owner, contract_expiry_date,
          last_reviewed_date, exit_plan_status, risk_rating, notes, linked_controls_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        workspaceId,
        input.name,
        input.serviceDescription ?? null,
        input.isMaterialServiceProvider ? 1 : 0,
        input.criticality ?? "Medium",
        input.dataResidency ?? null,
        input.dataTypesShared ?? null,
        input.owner ?? null,
        input.contractExpiryDate ?? null,
        input.lastReviewedDate ?? null,
        input.exitPlanStatus ?? "Missing",
        input.riskRating ?? "Medium",
        input.notes ?? null,
        JSON.stringify(input.linkedControls ?? ["5.19", "5.22"]),
        now,
        now,
      );
    const row = db
      .prepare("SELECT * FROM vendors WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapVendor(row);
  },

  updateVendor(workspaceId: number, id: number, patch: Partial<VendorInput>): VendorRecord | null {
    const db = getDb();
    const curRow = db
      .prepare("SELECT * FROM vendors WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!curRow) return null;
    const cur = mapVendor(curRow);
    db.prepare(`
      UPDATE vendors SET
        name = ?, service_description = ?, is_material_service_provider = ?,
        criticality = ?, data_residency = ?, data_types_shared = ?, owner = ?,
        contract_expiry_date = ?, last_reviewed_date = ?, exit_plan_status = ?,
        risk_rating = ?, notes = ?, linked_controls_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      patch.name ?? cur.name,
      patch.serviceDescription !== undefined ? patch.serviceDescription : cur.serviceDescription,
      (patch.isMaterialServiceProvider ?? cur.isMaterialServiceProvider) ? 1 : 0,
      patch.criticality ?? cur.criticality,
      patch.dataResidency !== undefined ? patch.dataResidency : cur.dataResidency,
      patch.dataTypesShared !== undefined ? patch.dataTypesShared : cur.dataTypesShared,
      patch.owner !== undefined ? patch.owner : cur.owner,
      patch.contractExpiryDate !== undefined ? patch.contractExpiryDate : cur.contractExpiryDate,
      patch.lastReviewedDate !== undefined ? patch.lastReviewedDate : cur.lastReviewedDate,
      patch.exitPlanStatus ?? cur.exitPlanStatus,
      patch.riskRating ?? cur.riskRating,
      patch.notes !== undefined ? patch.notes : cur.notes,
      JSON.stringify(patch.linkedControls ?? cur.linkedControls),
      new Date().toISOString(),
      id,
      workspaceId,
    );
    const updated = db.prepare("SELECT * FROM vendors WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    return mapVendor(updated);
  },

  deleteVendor(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM vendors WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },

  // ─── Policies ──────────────────────────────────────────────────────────────

  listPolicies(workspaceId: number): PolicyRecord[] {
    return (
      getDb()
        .prepare("SELECT * FROM policies WHERE workspace_id = ? ORDER BY policy_code ASC")
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapPolicy);
  },

  createPolicy(workspaceId: number, input: PolicyInput): PolicyRecord {
    const db = getDb();
    const code = nextCode("policies", "policy_code", "POL", workspaceId);
    const now = new Date().toISOString();
    const res = db
      .prepare(`
        INSERT INTO policies (
          workspace_id, policy_code, title, version, owner, approver, status,
          approved_at, next_review_date, content_markdown, document_id,
          linked_controls_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        workspaceId,
        code,
        input.title,
        input.version ?? "1.0",
        input.owner ?? null,
        input.approver ?? null,
        input.status ?? "Draft",
        input.approvedAt ?? null,
        input.nextReviewDate ?? null,
        input.contentMarkdown ?? "",
        input.documentId ?? null,
        JSON.stringify(input.linkedControls ?? []),
        now,
        now,
      );
    const row = db
      .prepare("SELECT * FROM policies WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapPolicy(row);
  },

  updatePolicy(workspaceId: number, id: number, patch: Partial<PolicyInput>): PolicyRecord | null {
    const db = getDb();
    const curRow = db
      .prepare("SELECT * FROM policies WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!curRow) return null;
    const cur = mapPolicy(curRow);
    db.prepare(`
      UPDATE policies SET
        title = ?, version = ?, owner = ?, approver = ?, status = ?,
        approved_at = ?, next_review_date = ?, content_markdown = ?,
        document_id = ?, linked_controls_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      patch.title ?? cur.title,
      patch.version ?? cur.version,
      patch.owner !== undefined ? patch.owner : cur.owner,
      patch.approver !== undefined ? patch.approver : cur.approver,
      patch.status ?? cur.status,
      patch.approvedAt !== undefined ? patch.approvedAt : cur.approvedAt,
      patch.nextReviewDate !== undefined ? patch.nextReviewDate : cur.nextReviewDate,
      patch.contentMarkdown !== undefined ? patch.contentMarkdown : cur.contentMarkdown,
      patch.documentId !== undefined ? patch.documentId : cur.documentId,
      JSON.stringify(patch.linkedControls ?? cur.linkedControls),
      new Date().toISOString(),
      id,
      workspaceId,
    );
    const updated = db.prepare("SELECT * FROM policies WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    return mapPolicy(updated);
  },

  deletePolicy(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM policies WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },

  // ─── Incidents & Statutory Breach Clocks ───────────────────────────────────

  listIncidents(workspaceId: number): IncidentRecord[] {
    return (
      getDb()
        .prepare(
          "SELECT * FROM incidents WHERE workspace_id = ? ORDER BY detected_at DESC, id DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapIncident);
  },

  createIncident(workspaceId: number, input: IncidentInput): IncidentRecord {
    const db = getDb();
    const code = nextCode("incidents", "incident_code", "INC", workspaceId);
    const now = new Date().toISOString();
    const res = db
      .prepare(`
        INSERT INTO incidents (
          workspace_id, incident_code, title, incident_type, severity, detected_at,
          ransom_payment_at, status, summary, affected_systems, regulator_notified,
          regulator_name, regulator_ref, regulator_notified_at, linked_controls_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        workspaceId,
        code,
        input.title,
        input.incidentType ?? "CyberIncident",
        input.severity ?? "High",
        input.detectedAt,
        input.ransomPaymentAt ?? null,
        input.status ?? "Investigating",
        input.summary ?? null,
        input.affectedSystems ?? null,
        input.regulatorNotified ? 1 : 0,
        input.regulatorName ?? null,
        input.regulatorRef ?? null,
        input.regulatorNotifiedAt ?? null,
        JSON.stringify(input.linkedControls ?? ["5.24", "5.25", "5.26"]),
        now,
        now,
      );
    const row = db
      .prepare("SELECT * FROM incidents WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapIncident(row);
  },

  updateIncident(
    workspaceId: number,
    id: number,
    patch: Partial<IncidentInput>,
  ): IncidentRecord | null {
    const db = getDb();
    const curRow = db
      .prepare("SELECT * FROM incidents WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!curRow) return null;
    const cur = mapIncident(curRow);
    db.prepare(`
      UPDATE incidents SET
        title = ?, incident_type = ?, severity = ?, detected_at = ?,
        ransom_payment_at = ?, status = ?, summary = ?, affected_systems = ?,
        regulator_notified = ?, regulator_name = ?, regulator_ref = ?,
        regulator_notified_at = ?, linked_controls_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      patch.title ?? cur.title,
      patch.incidentType ?? cur.incidentType,
      patch.severity ?? cur.severity,
      patch.detectedAt ?? cur.detectedAt,
      patch.ransomPaymentAt !== undefined ? patch.ransomPaymentAt : cur.ransomPaymentAt,
      patch.status ?? cur.status,
      patch.summary !== undefined ? patch.summary : cur.summary,
      patch.affectedSystems !== undefined ? patch.affectedSystems : cur.affectedSystems,
      (patch.regulatorNotified ?? cur.regulatorNotified) ? 1 : 0,
      patch.regulatorName !== undefined ? patch.regulatorName : cur.regulatorName,
      patch.regulatorRef !== undefined ? patch.regulatorRef : cur.regulatorRef,
      patch.regulatorNotifiedAt !== undefined ? patch.regulatorNotifiedAt : cur.regulatorNotifiedAt,
      JSON.stringify(patch.linkedControls ?? cur.linkedControls),
      new Date().toISOString(),
      id,
      workspaceId,
    );
    const updated = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    return mapIncident(updated);
  },

  deleteIncident(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM incidents WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },

  // ─── Summary Aggregate ─────────────────────────────────────────────────────

  getGovernanceSummary(workspaceId: number): GovernanceSummary {
    const risks = governanceRepository.listRisks(workspaceId);
    const capas = governanceRepository.listCapas(workspaceId);
    const reviews = governanceRepository.listReviews(workspaceId);
    const vendors = governanceRepository.listVendors(workspaceId);
    const policies = governanceRepository.listPolicies(workspaceId);
    const incidents = governanceRepository.listIncidents(workspaceId);
    const today = new Date().toISOString().slice(0, 10);

    return {
      totalRisks: risks.length,
      highOpenRisks: risks.filter((r) => r.status !== "Closed" && r.residualScore >= 12).length,
      openCapas: capas.filter((c) => c.status !== "VerifiedClosed").length,
      overdueCapas: capas.filter(
        (c) => c.status !== "VerifiedClosed" && Boolean(c.dueDate && c.dueDate < today),
      ).length,
      totalReviews: reviews.length,
      totalVendors: vendors.length,
      materialServiceProviders: vendors.filter((v) => v.isMaterialServiceProvider).length,
      mspMissingExitPlan: vendors.filter(
        (v) => v.isMaterialServiceProvider && v.exitPlanStatus === "Missing",
      ).length,
      totalPolicies: policies.length,
      policiesReviewDue: policies.filter(
        (p) =>
          p.status === "ReviewDue" ||
          (p.status === "Approved" && Boolean(p.nextReviewDate && p.nextReviewDate < today)),
      ).length,
      activeIncidents: incidents.filter((i) => i.status !== "Closed").length,
    };
  },
};
