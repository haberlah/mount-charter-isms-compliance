import type {
  ActionItem,
  AiProvider,
  ClimateChangeRelevance,
  ControlFrequency,
  ControlStartQuarter,
  RiskAppetite,
  Workspace,
  WorkspaceProfile,
} from "@shared/schema";
import { calculateNextDueDate } from "../control-schedule";
import { getDb } from "../db";
import { mapProfile, mapWorkspace, slugify } from "./common";

export const workspaceRepository = {
  listWorkspaces(includeArchived = false): Workspace[] {
    const db = getDb();
    const sql = includeArchived
      ? "SELECT * FROM workspaces ORDER BY id ASC"
      : "SELECT * FROM workspaces WHERE archived_at IS NULL ORDER BY id ASC";
    return (db.prepare(sql).all() as Array<Record<string, unknown>>).map(mapWorkspace);
  },

  getDefaultWorkspace(): Workspace {
    const active = workspaceRepository.listWorkspaces(false);
    if (active.length > 0) return active[0];
    return workspaceRepository.createWorkspace("My Organisation");
  },

  getWorkspace(id: number): Workspace | null {
    const row = getDb().prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? mapWorkspace(row) : null;
  },

  createWorkspace(name: string): Workspace {
    const db = getDb();
    let slug = slugify(name);
    let suffix = 1;
    while (db.prepare("SELECT 1 FROM workspaces WHERE slug = ?").get(slug)) {
      slug = `${slugify(name)}-${++suffix}`;
    }

    db.exec("BEGIN");
    try {
      const res = db
        .prepare("INSERT INTO workspaces (name, slug) VALUES (?, ?)")
        .run(name.trim(), slug);
      const workspaceId = Number(res.lastInsertRowid);
      db.prepare(
        "INSERT INTO workspace_profiles (workspace_id, company_name, regulatory_requirements_json) VALUES (?, ?, ?)",
      ).run(
        workspaceId,
        name.trim(),
        JSON.stringify([
          "ISO/IEC 27001:2022",
          "ACSC Essential Eight",
          "Australian Privacy Act (APPs)",
          "Cyber Security Act 2024 (Cth)",
        ]),
      );
      db.prepare(`
        INSERT OR IGNORE INTO workspace_controls (
          workspace_id, control_id, frequency, start_quarter, is_applicable, selected_persona, selected_urgency
        )
        SELECT ?, id, default_frequency, start_quarter, 1, 'Auditor', 'later'
        FROM controls
      `).run(workspaceId);
      db.prepare(`
        INSERT OR IGNORE INTO workspace_frameworks (workspace_id, framework_id, enabled, target_level)
        SELECT ?, id,
          CASE WHEN code IN ('iso27001_2022', 'acsc_e8_2023', 'au_privacy_act', 'au_cyber_security_act_2024') THEN 1 ELSE 0 END,
          CASE WHEN code = 'acsc_e8_2023' THEN 'ML1' ELSE NULL END
        FROM frameworks
      `).run(workspaceId);
      db.exec("COMMIT");
      return workspaceRepository.getWorkspace(workspaceId)!;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },

  renameWorkspace(workspaceId: number, name: string): Workspace | null {
    const db = getDb();
    const existing = workspaceRepository.getWorkspace(workspaceId);
    if (!existing) return null;
    const trimmed = name.trim();
    db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(trimmed, workspaceId);
    db.prepare(
      "UPDATE workspace_profiles SET company_name = ?, updated_at = ? WHERE workspace_id = ?",
    ).run(trimmed, new Date().toISOString(), workspaceId);
    return workspaceRepository.getWorkspace(workspaceId);
  },

  archiveWorkspace(workspaceId: number): Workspace | null {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("UPDATE workspaces SET archived_at = ? WHERE id = ?").run(now, workspaceId);
    if (workspaceRepository.listWorkspaces(false).length === 0) {
      workspaceRepository.createWorkspace("My Organisation");
    }
    return workspaceRepository.getWorkspace(workspaceId);
  },

  restoreWorkspace(workspaceId: number): Workspace | null {
    const db = getDb();
    const existing = workspaceRepository.getWorkspace(workspaceId);
    if (!existing) return null;
    db.prepare("UPDATE workspaces SET archived_at = NULL WHERE id = ?").run(workspaceId);
    return workspaceRepository.getWorkspace(workspaceId);
  },

  getProfile(workspaceId: number): WorkspaceProfile {
    const db = getDb();
    let row = db
      .prepare("SELECT * FROM workspace_profiles WHERE workspace_id = ?")
      .get(workspaceId) as Record<string, unknown> | undefined;
    if (!row) {
      const ws = workspaceRepository.getWorkspace(workspaceId);
      db.prepare("INSERT INTO workspace_profiles (workspace_id, company_name) VALUES (?, ?)").run(
        workspaceId,
        ws?.name || "My Organisation",
      );
      row = db
        .prepare("SELECT * FROM workspace_profiles WHERE workspace_id = ?")
        .get(workspaceId) as Record<string, unknown>;
    }
    return mapProfile(row);
  },

  updateProfile(
    workspaceId: number,
    patch: Partial<{
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
      aiRoutingPreset: WorkspaceProfile["aiRoutingPreset"];
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
    }>,
  ): WorkspaceProfile {
    const db = getDb();
    const current = workspaceRepository.getProfile(workspaceId);
    const now = new Date().toISOString();
    const nextName = patch.companyName !== undefined ? patch.companyName : current.companyName;

    db.prepare(`
      UPDATE workspace_profiles SET
        company_name = ?,
        industry = ?,
        company_size = ?,
        tech_stack = ?,
        deployment_model = ?,
        regulatory_requirements_json = ?,
        data_classification_levels_json = ?,
        risk_appetite = ?,
        default_control_frequency = ?,
        default_start_quarter = ?,
        additional_context = ?,
        hide_non_applicable_controls = ?,
        ai_provider = ?,
        ai_base_url = ?,
        ai_routing_preset = ?,
        ai_zdr_only = ?,
        ai_screening_model = ?,
        ai_synthesis_model = ?,
        ai_daily_token_budget = ?,
        ai_daily_cost_budget_usd = ?,
        ai_max_chunks_per_run = ?,
        soa_version = ?,
        soa_approved_by = ?,
        soa_approved_at = ?,
        climate_change_relevant = ?,
        climate_change_rationale = ?,
        onboarding_dismissed = ?,
        updated_at = ?
      WHERE workspace_id = ?
    `).run(
      nextName,
      patch.industry !== undefined ? patch.industry : current.industry,
      patch.companySize !== undefined ? patch.companySize : current.companySize,
      patch.techStack !== undefined ? patch.techStack : current.techStack,
      patch.deploymentModel !== undefined ? patch.deploymentModel : current.deploymentModel,
      JSON.stringify(
        patch.regulatoryRequirements !== undefined
          ? patch.regulatoryRequirements
          : current.regulatoryRequirements,
      ),
      JSON.stringify(
        patch.dataClassificationLevels !== undefined
          ? patch.dataClassificationLevels
          : current.dataClassificationLevels,
      ),
      patch.riskAppetite ?? current.riskAppetite,
      patch.defaultControlFrequency !== undefined
        ? patch.defaultControlFrequency
        : current.defaultControlFrequency,
      patch.defaultStartQuarter !== undefined
        ? patch.defaultStartQuarter
        : current.defaultStartQuarter,
      patch.additionalContext !== undefined ? patch.additionalContext : current.additionalContext,
      (patch.hideNonApplicableControls ?? current.hideNonApplicableControls) ? 1 : 0,
      patch.aiProvider ?? current.aiProvider,
      patch.aiBaseUrl !== undefined ? patch.aiBaseUrl : current.aiBaseUrl,
      patch.aiRoutingPreset ?? current.aiRoutingPreset,
      (patch.aiZdrOnly ?? current.aiZdrOnly) ? 1 : 0,
      patch.aiScreeningModel ?? current.aiScreeningModel,
      patch.aiSynthesisModel ?? current.aiSynthesisModel,
      patch.aiDailyTokenBudget ?? current.aiDailyTokenBudget,
      patch.aiDailyCostBudgetUsd ?? current.aiDailyCostBudgetUsd,
      patch.aiMaxChunksPerRun ?? current.aiMaxChunksPerRun,
      patch.soaVersion ?? current.soaVersion,
      patch.soaApprovedBy !== undefined ? patch.soaApprovedBy : current.soaApprovedBy,
      patch.soaApprovedAt !== undefined ? patch.soaApprovedAt : current.soaApprovedAt,
      patch.climateChangeRelevant ?? current.climateChangeRelevant,
      patch.climateChangeRationale !== undefined
        ? patch.climateChangeRationale
        : current.climateChangeRationale,
      (patch.onboardingDismissed ?? current.onboardingDismissed) ? 1 : 0,
      now,
      workspaceId,
    );

    if (nextName?.trim()) {
      db.prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(nextName.trim(), workspaceId);
    }

    return workspaceRepository.getProfile(workspaceId);
  },

  applyScheduleDefaults(workspaceId: number): { updatedCount: number } {
    const db = getDb();
    const profile = workspaceRepository.getProfile(workspaceId);
    const freq = profile.defaultControlFrequency ?? "Annual";
    const quarter = profile.defaultStartQuarter ?? "Q1";
    const due = calculateNextDueDate(freq, quarter);
    const res = db
      .prepare(`
        UPDATE workspace_controls
        SET frequency = ?, start_quarter = ?, next_due_date = CASE WHEN is_applicable = 1 THEN ? ELSE NULL END
        WHERE workspace_id = ?
      `)
      .run(freq, quarter, due, workspaceId);
    return { updatedCount: Number(res.changes || 0) };
  },

  listActionItems(workspaceId: number): ActionItem[] {
    return (
      getDb()
        .prepare(
          "SELECT * FROM action_items WHERE workspace_id = ? ORDER BY done_at IS NOT NULL ASC, sort_order ASC, id DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      workspaceId: Number(r.workspace_id),
      title: String(r.title),
      doneAt: r.done_at ? String(r.done_at) : null,
      sortOrder: Number(r.sort_order),
      createdAt: String(r.created_at),
    }));
  },

  createActionItem(workspaceId: number, title: string): ActionItem {
    const db = getDb();
    const res = db
      .prepare("INSERT INTO action_items (workspace_id, title) VALUES (?, ?)")
      .run(workspaceId, title);
    const r = db
      .prepare("SELECT * FROM action_items WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return {
      id: Number(r.id),
      workspaceId: Number(r.workspace_id),
      title: String(r.title),
      doneAt: null,
      sortOrder: Number(r.sort_order),
      createdAt: String(r.created_at),
    };
  },

  updateActionItem(
    workspaceId: number,
    id: number,
    patch: { title?: string; done?: boolean },
  ): ActionItem | null {
    const db = getDb();
    const cur = db
      .prepare("SELECT * FROM action_items WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!cur) return null;
    const title = patch.title !== undefined ? patch.title : String(cur.title);
    const doneAt =
      patch.done !== undefined
        ? patch.done
          ? new Date().toISOString()
          : null
        : cur.done_at
          ? String(cur.done_at)
          : null;
    db.prepare(
      "UPDATE action_items SET title = ?, done_at = ? WHERE id = ? AND workspace_id = ?",
    ).run(title, doneAt, id, workspaceId);
    const r = db.prepare("SELECT * FROM action_items WHERE id = ?").get(id) as Record<
      string,
      unknown
    >;
    return {
      id: Number(r.id),
      workspaceId: Number(r.workspace_id),
      title: String(r.title),
      doneAt: r.done_at ? String(r.done_at) : null,
      sortOrder: Number(r.sort_order),
      createdAt: String(r.created_at),
    };
  },

  deleteActionItem(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM action_items WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },
};
