import type { DatabaseSync } from "node:sqlite";
import bundledMigrationMap from "../seed-data/ontology_v2_1_to_v3_0_map.json";

export interface QuestionMigrationTarget {
  target_question_id: number;
  mode: "1:1" | "merged";
  legacy_label?: string;
}

export interface OntologyMigrationMap {
  from_version: string;
  to_version: string;
  controls: Record<string, Record<string, QuestionMigrationTarget>>;
}

export interface OntologyMigrationResult {
  alreadyMigrated: boolean;
  archivedResponses: number;
  remappedResponses: number;
  mergedGroups: number;
  skippedAiControls: number;
  remappedPendingMatches: number;
  deactivatedStaleMatches: number;
}

export const ONTOLOGY_MIGRATION_META_KEY = "ontology_migration_v2_1_to_v3_0";

export function loadOntologyMigrationMap(): OntologyMigrationMap | null {
  return bundledMigrationMap as OntologyMigrationMap;
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Deterministically remap & archive v2.1 question_responses and pending matches into v3.0
 * question IDs with zero data loss and full respect for append-only audit trail triggers.
 *
 * CRITICAL INVARIANTS:
 * 1. NEVER UPDATE or DELETE rows in `response_change_log` (blocked by immutable triggers).
 *    Only INSERT new `'ontology_migration_v3'` ledger entries when responses change/merge.
 * 2. NEVER DELETE rows in `document_question_matches` (because `response_change_log.source_match_id`
 *    has `ON DELETE SET NULL`, which would fire an UPDATE on `response_change_log` and abort!).
 *    Instead, deactivate historical/unmappable matches via `is_active = 0` and remap pending ones.
 * 3. NEVER overwrite controls where `questionnaire_source = 'ai_generated'`.
 * 4. Archive every non-empty pre-migration response verbatim into `legacy_question_responses`.
 */
export function migrateOntologyResponsesV21ToV30(
  db: DatabaseSync,
  map: OntologyMigrationMap,
): OntologyMigrationResult {
  const meta = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(ONTOLOGY_MIGRATION_META_KEY) as { value: string } | undefined;

  if (meta?.value === "done") {
    return {
      alreadyMigrated: true,
      archivedResponses: 0,
      remappedResponses: 0,
      mergedGroups: 0,
      skippedAiControls: 0,
      remappedPendingMatches: 0,
      deactivatedStaleMatches: 0,
    };
  }

  const now = new Date().toISOString();
  let archivedResponses = 0;
  let remappedResponses = 0;
  let mergedGroups = 0;
  let skippedAiControls = 0;
  let remappedPendingMatches = 0;
  let deactivatedStaleMatches = 0;

  const wcRows = db
    .prepare(`
      SELECT wc.id AS workspace_control_id,
             wc.workspace_id,
             c.control_number,
             c.questionnaire_source
      FROM workspace_controls wc
      JOIN controls c ON c.id = wc.control_id
    `)
    .all() as Array<{
    workspace_control_id: number;
    workspace_id: number;
    control_number: string;
    questionnaire_source: string;
  }>;

  const selectResponses = db.prepare(`
    SELECT id, question_id, response_text, evidence_references_json, updated_at
    FROM question_responses
    WHERE workspace_control_id = ?
    ORDER BY question_id ASC
  `);

  const insertLegacy = db.prepare(`
    INSERT OR IGNORE INTO legacy_question_responses (
      workspace_id, workspace_control_id, control_number, legacy_question_id,
      mapped_question_id, ontology_version, response_text, evidence_references_json,
      original_updated_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteResponsesForWc = db.prepare(
    "DELETE FROM question_responses WHERE workspace_control_id = ?",
  );

  const insertRemappedResponse = db.prepare(`
    INSERT INTO question_responses (
      workspace_id, workspace_control_id, question_id, response_text,
      evidence_references_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertChangeLog = db.prepare(`
    INSERT INTO response_change_log (
      workspace_id, workspace_control_id, question_id, previous_response,
      new_response, change_source, ontology_version, created_at
    ) VALUES (?, ?, ?, ?, ?, 'ontology_migration_v3', ?, ?)
  `);

  const selectMatches = db.prepare(`
    SELECT id, question_id, user_accepted, is_active
    FROM document_question_matches
    WHERE workspace_control_id = ? AND is_active = 1
  `);

  const updateMatchQuestion = db.prepare(
    "UPDATE document_question_matches SET question_id = ? WHERE id = ?",
  );

  const deactivateMatch = db.prepare(
    "UPDATE document_question_matches SET is_active = 0 WHERE id = ?",
  );

  for (const wc of wcRows) {
    if (wc.questionnaire_source === "ai_generated") {
      skippedAiControls++;
      continue;
    }

    const controlMap = map.controls[wc.control_number];
    if (!controlMap) continue;

    const existingResponses = selectResponses.all(wc.workspace_control_id) as Array<{
      id: number;
      question_id: number;
      response_text: string;
      evidence_references_json: string;
      updated_at: string;
    }>;

    if (existingResponses.length > 0) {
      const grouped = new Map<
        number,
        Array<{
          oldQuestionId: number;
          text: string;
          refs: string[];
          updatedAt: string;
          legacyLabel?: string;
        }>
      >();

      for (const r of existingResponses) {
        const trimmed = r.response_text.trim();
        const target = controlMap[String(r.question_id)];
        const targetQId = target?.target_question_id ?? 1;

        if (trimmed.length > 0) {
          insertLegacy.run(
            wc.workspace_id,
            wc.workspace_control_id,
            wc.control_number,
            r.question_id,
            targetQId,
            map.from_version,
            r.response_text,
            r.evidence_references_json,
            r.updated_at,
            now,
          );
          archivedResponses++;

          const list = grouped.get(targetQId) ?? [];
          list.push({
            oldQuestionId: r.question_id,
            text: r.response_text,
            refs: safeParseStringArray(r.evidence_references_json),
            updatedAt: r.updated_at,
            legacyLabel: target?.legacy_label,
          });
          grouped.set(targetQId, list);
        }
      }

      deleteResponsesForWc.run(wc.workspace_control_id);

      for (const [targetQId, entries] of Array.from(grouped.entries()).sort(
        (a, b) => a[0] - b[0],
      )) {
        const refSet = new Set<string>();
        let latestUpdated = entries[0].updatedAt;
        for (const e of entries) {
          for (const ref of e.refs) refSet.add(ref);
          if (e.updatedAt > latestUpdated) latestUpdated = e.updatedAt;
        }

        let finalText: string;
        let changedOrMerged = false;

        if (entries.length === 1) {
          finalText = entries[0].text;
          changedOrMerged = entries[0].oldQuestionId !== targetQId;
        } else {
          mergedGroups++;
          changedOrMerged = true;
          finalText = entries
            .map((e) => {
              const header = e.legacyLabel
                ? `[Migrated from v2.1 Q${e.oldQuestionId} — ${e.legacyLabel}]`
                : `[Migrated from v2.1 Q${e.oldQuestionId}]`;
              return `${header}\n${e.text.trim()}`;
            })
            .join("\n\n");
        }

        insertRemappedResponse.run(
          wc.workspace_id,
          wc.workspace_control_id,
          targetQId,
          finalText,
          JSON.stringify(Array.from(refSet)),
          latestUpdated,
        );
        remappedResponses++;

        if (changedOrMerged) {
          const prevSummary =
            entries.length === 1
              ? `[v2.1 Q${entries[0].oldQuestionId}] ${entries[0].text}`
              : entries.map((e) => `[v2.1 Q${e.oldQuestionId}] ${e.text}`).join("\n---\n");
          insertChangeLog.run(
            wc.workspace_id,
            wc.workspace_control_id,
            targetQId,
            prevSummary,
            finalText,
            map.to_version,
            now,
          );
        }
      }
    }

    // Safely handle document_question_matches without EVER deleting rows
    const activeMatches = selectMatches.all(wc.workspace_control_id) as Array<{
      id: number;
      question_id: number;
      user_accepted: number | null;
      is_active: number;
    }>;

    for (const m of activeMatches) {
      const target = controlMap[String(m.question_id)];
      if (m.user_accepted !== null) {
        // Historical accepted/rejected match: preserve FK & audit provenance, hide from active queue if ID shifted
        if (!target || target.target_question_id !== m.question_id) {
          deactivateMatch.run(m.id);
          deactivatedStaleMatches++;
        }
      } else if (target) {
        if (target.target_question_id !== m.question_id) {
          updateMatchQuestion.run(target.target_question_id, m.id);
          remappedPendingMatches++;
        }
      } else {
        deactivateMatch.run(m.id);
        deactivatedStaleMatches++;
      }
    }
  }

  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(
    ONTOLOGY_MIGRATION_META_KEY,
    "done",
  );

  return {
    alreadyMigrated: false,
    archivedResponses,
    remappedResponses,
    mergedGroups,
    skippedAiControls,
    remappedPendingMatches,
    deactivatedStaleMatches,
  };
}

/**
 * Remap question responses inside a pre-v3.0 WorkspaceBackupManifest so old backups
 * restore cleanly without losing answers or creating orphaned question IDs.
 */
export function remapBackupResponsesForOntology(
  responses: Array<Record<string, unknown>>,
  backupOntologyVersion: string | undefined,
  map: OntologyMigrationMap | null,
): Array<Record<string, unknown>> {
  if (!map || responses.length === 0) return responses;
  if (backupOntologyVersion && !backupOntologyVersion.startsWith("2.")) {
    return responses;
  }

  const grouped = new Map<
    string,
    {
      controlNumber: string;
      targetQuestionId: number;
      items: Array<{ oldQuestionId: number; text: string; refs: string[]; legacyLabel?: string }>;
    }
  >();

  for (const r of responses) {
    const controlNumber = String(r.controlNumber || "");
    const oldQuestionId = Number(r.questionId);
    const text = String(r.responseText || "");
    if (!controlNumber || !text.trim()) continue;

    const controlMap = map.controls[controlNumber];
    const target = controlMap?.[String(oldQuestionId)];
    const targetQuestionId = target?.target_question_id ?? oldQuestionId;
    const key = `${controlNumber}::${targetQuestionId}`;
    const refs = Array.isArray(r.evidenceReferences)
      ? (r.evidenceReferences as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

    const bucket = grouped.get(key) ?? {
      controlNumber,
      targetQuestionId,
      items: [],
    };
    bucket.items.push({
      oldQuestionId,
      text,
      refs,
      legacyLabel: target?.legacy_label,
    });
    grouped.set(key, bucket);
  }

  const remapped: Array<Record<string, unknown>> = [];
  for (const bucket of grouped.values()) {
    const refSet = new Set<string>();
    for (const item of bucket.items) {
      for (const ref of item.refs) refSet.add(ref);
    }
    const responseText =
      bucket.items.length === 1
        ? bucket.items[0].text
        : bucket.items
            .map((item) => {
              const header = item.legacyLabel
                ? `[Restored from v2.1 Q${item.oldQuestionId} — ${item.legacyLabel}]`
                : `[Restored from v2.1 Q${item.oldQuestionId}]`;
              return `${header}\n${item.text.trim()}`;
            })
            .join("\n\n");

    remapped.push({
      controlNumber: bucket.controlNumber,
      questionId: bucket.targetQuestionId,
      responseText,
      evidenceReferences: Array.from(refSet),
    });
  }

  return remapped;
}
