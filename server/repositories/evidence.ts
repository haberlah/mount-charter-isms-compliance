import type {
  DocumentChunk,
  DocumentQuestionMatch,
  DocumentRecord,
  DocumentStatus,
  EvidenceLink,
  EvidenceType,
  QuestionResponse,
} from "@shared/schema";
import { deleteBlobIfUnreferenced } from "../blob-store";
import { getDb } from "../db";
import { mapDocument, mapEvidenceLink, mapMatch } from "./common";
import { controlsRepository } from "./controls";

export const evidenceRepository = {
  listDocuments(workspaceId: number): DocumentRecord[] {
    const db = getDb();
    const docs = (
      db
        .prepare(
          "SELECT * FROM documents WHERE workspace_id = ? AND archived_at IS NULL ORDER BY created_at DESC",
        )
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapDocument);

    const links = db
      .prepare(`
        SELECT dcl.id AS link_id, dcl.document_id, dcl.workspace_control_id,
               dcl.analysis_status, dcl.analysis_completed_at,
               c.id AS control_id, c.control_number, c.name AS control_name
        FROM document_control_links dcl
        JOIN workspace_controls wc ON wc.id = dcl.workspace_control_id
        JOIN controls c ON c.id = wc.control_id
        WHERE dcl.workspace_id = ?
      `)
      .all(workspaceId) as Array<Record<string, unknown>>;

    const linksByDoc = new Map<number, DocumentRecord["linkedControls"]>();
    for (const l of links) {
      const docId = Number(l.document_id);
      const list = linksByDoc.get(docId) || [];
      list.push({
        linkId: Number(l.link_id),
        workspaceControlId: Number(l.workspace_control_id),
        controlId: Number(l.control_id),
        controlNumber: String(l.control_number),
        controlName: String(l.control_name),
        analysisStatus: (l.analysis_status as DocumentStatus) || "pending",
        analysisCompletedAt: l.analysis_completed_at ? String(l.analysis_completed_at) : null,
      });
      linksByDoc.set(docId, list);
    }

    return docs.map((d) => ({ ...d, linkedControls: linksByDoc.get(d.id) || [] }));
  },

  getDocument(workspaceId: number, documentId: number): DocumentRecord | null {
    const row = getDb()
      .prepare("SELECT * FROM documents WHERE id = ? AND workspace_id = ? AND archived_at IS NULL")
      .get(documentId, workspaceId) as Record<string, unknown> | undefined;
    return row ? mapDocument(row) : null;
  },

  findDocumentByHash(workspaceId: number, fileHash: string): DocumentRecord | null {
    const row = getDb()
      .prepare(
        "SELECT * FROM documents WHERE workspace_id = ? AND file_hash = ? AND archived_at IS NULL",
      )
      .get(workspaceId, fileHash) as Record<string, unknown> | undefined;
    return row ? mapDocument(row) : null;
  },

  createDocument(params: {
    workspaceId: number;
    title: string;
    originalFilename: string;
    blobKey: string;
    mimeType: string;
    fileSize: number;
    fileHash: string;
    documentDate?: string | null;
    evidenceType?: EvidenceType | null;
    description?: string | null;
    extractedText?: string | null;
    extractionStatus: DocumentStatus;
    extractionError?: string | null;
    pageCount?: number | null;
    chunks: Array<{
      chunkIndex: number;
      content: string;
      tokenCount: number;
      charStart: number;
      charEnd: number;
      sectionHeading: string | null;
    }>;
  }): DocumentRecord {
    const db = getDb();
    const now = new Date().toISOString();
    db.exec("BEGIN");
    try {
      const res = db
        .prepare(`
          INSERT INTO documents (
            workspace_id, title, original_filename, blob_key, mime_type, file_size, file_hash,
            document_date, evidence_type, description, extracted_text, extraction_status,
            extraction_error, page_count, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          params.workspaceId,
          params.title,
          params.originalFilename,
          params.blobKey,
          params.mimeType,
          params.fileSize,
          params.fileHash,
          params.documentDate ?? null,
          params.evidenceType ?? null,
          params.description ?? null,
          params.extractedText ?? null,
          params.extractionStatus,
          params.extractionError ?? null,
          params.pageCount ?? null,
          now,
          now,
        );
      const docId = Number(res.lastInsertRowid);
      const insertChunk = db.prepare(`
        INSERT INTO document_chunks (
          document_id, chunk_index, content, token_count, char_start, char_end, section_heading
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ch of params.chunks) {
        insertChunk.run(
          docId,
          ch.chunkIndex,
          ch.content,
          ch.tokenCount,
          ch.charStart,
          ch.charEnd,
          ch.sectionHeading,
        );
      }
      db.exec("COMMIT");
      return evidenceRepository.getDocument(params.workspaceId, docId)!;
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  },

  updateDocument(
    workspaceId: number,
    documentId: number,
    patch: Partial<{
      title: string;
      evidenceType: EvidenceType | null;
      documentDate: string | null;
      description: string | null;
    }>,
  ): DocumentRecord | null {
    const current = evidenceRepository.getDocument(workspaceId, documentId);
    if (!current) return null;
    getDb()
      .prepare(`
        UPDATE documents SET
          title = ?,
          evidence_type = ?,
          document_date = ?,
          description = ?,
          updated_at = ?
        WHERE id = ? AND workspace_id = ?
      `)
      .run(
        patch.title ?? current.title,
        patch.evidenceType !== undefined ? patch.evidenceType : current.evidenceType,
        patch.documentDate !== undefined ? patch.documentDate : current.documentDate,
        patch.description !== undefined ? patch.description : current.description,
        new Date().toISOString(),
        documentId,
        workspaceId,
      );
    return evidenceRepository.getDocument(workspaceId, documentId);
  },

  deleteDocument(workspaceId: number, documentId: number): boolean {
    const db = getDb();
    const doc = evidenceRepository.getDocument(workspaceId, documentId);
    if (!doc) return false;

    const auditRefCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM response_change_log WHERE source_document_id = ?")
        .get(documentId) as { c: number }
    ).c;

    if (auditRefCount > 0) {
      db.prepare("UPDATE documents SET archived_at = ? WHERE id = ? AND workspace_id = ?").run(
        new Date().toISOString(),
        documentId,
        workspaceId,
      );
      db.prepare(
        "DELETE FROM document_control_links WHERE document_id = ? AND workspace_id = ?",
      ).run(documentId, workspaceId);
      db.prepare(
        "UPDATE document_question_matches SET is_active = 0 WHERE document_id = ? AND workspace_id = ? AND user_accepted IS NULL",
      ).run(documentId, workspaceId);
      return true;
    }

    db.prepare("DELETE FROM documents WHERE id = ? AND workspace_id = ?").run(
      documentId,
      workspaceId,
    );
    const remaining = (
      db.prepare("SELECT COUNT(*) as c FROM documents WHERE blob_key = ?").get(doc.blobKey) as {
        c: number;
      }
    ).c;
    deleteBlobIfUnreferenced(doc.blobKey, remaining);
    return true;
  },

  getDocumentChunks(workspaceId: number, documentId: number): DocumentChunk[] {
    const doc = evidenceRepository.getDocument(workspaceId, documentId);
    if (!doc) return [];
    return (
      getDb()
        .prepare("SELECT * FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC")
        .all(documentId) as Array<Record<string, unknown>>
    ).map((r) => ({
      id: Number(r.id),
      documentId: Number(r.document_id),
      chunkIndex: Number(r.chunk_index),
      content: String(r.content),
      tokenCount: Number(r.token_count),
      charStart: Number(r.char_start),
      charEnd: Number(r.char_end),
      sectionHeading: r.section_heading != null ? String(r.section_heading) : null,
    }));
  },

  linkDocumentToControl(
    workspaceId: number,
    documentId: number,
    workspaceControlId: number,
  ): boolean {
    const doc = evidenceRepository.getDocument(workspaceId, documentId);
    const wc = controlsRepository.getWorkspaceControlById(workspaceId, workspaceControlId);
    if (!doc || !wc) return false;
    getDb()
      .prepare(`
        INSERT OR IGNORE INTO document_control_links (
          workspace_id, document_id, workspace_control_id, analysis_status
        ) VALUES (?, ?, ?, 'pending')
      `)
      .run(workspaceId, documentId, workspaceControlId);
    return true;
  },

  unlinkDocumentFromControl(
    workspaceId: number,
    documentId: number,
    workspaceControlId: number,
  ): void {
    const db = getDb();
    db.prepare(
      "DELETE FROM document_control_links WHERE workspace_id = ? AND document_id = ? AND workspace_control_id = ?",
    ).run(workspaceId, documentId, workspaceControlId);
    db.prepare(
      "UPDATE document_question_matches SET is_active = 0 WHERE workspace_id = ? AND document_id = ? AND workspace_control_id = ?",
    ).run(workspaceId, documentId, workspaceControlId);
  },

  syncDocumentControlLinks(
    workspaceId: number,
    documentId: number,
    controlNumbers: string[],
  ): boolean {
    const doc = evidenceRepository.getDocument(workspaceId, documentId);
    if (!doc) return false;
    const db = getDb();
    const targetWcIds = new Set<number>();
    for (const num of controlNumbers) {
      const ctrl = controlsRepository.getControlByNumber(num);
      if (ctrl) {
        const wc = controlsRepository.ensureWorkspaceControl(workspaceId, ctrl.id);
        targetWcIds.add(wc.id);
      }
    }
    const existing = db
      .prepare(
        "SELECT workspace_control_id FROM document_control_links WHERE workspace_id = ? AND document_id = ?",
      )
      .all(workspaceId, documentId) as Array<{ workspace_control_id: number }>;
    const existingIds = new Set(existing.map((r) => Number(r.workspace_control_id)));

    for (const wcId of targetWcIds) {
      if (!existingIds.has(wcId)) {
        evidenceRepository.linkDocumentToControl(workspaceId, documentId, wcId);
      }
    }
    for (const wcId of existingIds) {
      if (!targetWcIds.has(wcId)) {
        evidenceRepository.unlinkDocumentFromControl(workspaceId, documentId, wcId);
      }
    }
    return true;
  },

  setDocumentControlAnalysisStatus(
    workspaceId: number,
    documentId: number,
    workspaceControlId: number,
    status: DocumentStatus,
  ): void {
    const completedAt = status === "analysed" ? new Date().toISOString() : null;
    getDb()
      .prepare(`
        UPDATE document_control_links
        SET analysis_status = ?, analysis_completed_at = COALESCE(?, analysis_completed_at)
        WHERE workspace_id = ? AND document_id = ? AND workspace_control_id = ?
      `)
      .run(status, completedAt, workspaceId, documentId, workspaceControlId);
  },

  replaceMatchesForDocumentControl(
    workspaceId: number,
    documentId: number,
    workspaceControlId: number,
    matches: Array<{
      questionId: number;
      contentRelevance: number;
      evidenceTypeMatch: boolean;
      specificity: number;
      compositeScore: number;
      matchedPassage: string;
      aiSummary: string;
      suggestedResponse: string;
      chunkId?: number;
    }>,
  ): DocumentQuestionMatch[] {
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare(`
        UPDATE document_question_matches
        SET is_active = 0
        WHERE workspace_id = ? AND document_id = ? AND workspace_control_id = ?
      `).run(workspaceId, documentId, workspaceControlId);

      const insert = db.prepare(`
        INSERT INTO document_question_matches (
          workspace_id, document_id, workspace_control_id, question_id,
          content_relevance, evidence_type_match, specificity, composite_score,
          matched_passage, ai_summary, suggested_response, chunk_id, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      for (const m of matches) {
        insert.run(
          workspaceId,
          documentId,
          workspaceControlId,
          m.questionId,
          m.contentRelevance,
          m.evidenceTypeMatch ? 1 : 0,
          m.specificity,
          m.compositeScore,
          m.matchedPassage,
          m.aiSummary,
          m.suggestedResponse,
          m.chunkId ?? null,
        );
      }

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return (
      db
        .prepare(`
          SELECT m.*, d.title AS document_title, d.original_filename
          FROM document_question_matches m
          JOIN documents d ON d.id = m.document_id
          WHERE m.workspace_id = ? AND m.document_id = ? AND m.workspace_control_id = ? AND m.is_active = 1
          ORDER BY m.composite_score DESC
        `)
        .all(workspaceId, documentId, workspaceControlId) as Array<Record<string, unknown>>
    ).map(mapMatch);
  },

  listPendingMatches(workspaceId: number): DocumentQuestionMatch[] {
    return (
      getDb()
        .prepare(`
          SELECT m.*, d.title AS document_title, d.original_filename,
                 c.control_number, c.name AS control_name
          FROM document_question_matches m
          JOIN documents d ON d.id = m.document_id AND d.archived_at IS NULL
          JOIN workspace_controls wc ON wc.id = m.workspace_control_id
          JOIN controls c ON c.id = wc.control_id
          WHERE m.workspace_id = ? AND m.is_active = 1 AND m.user_accepted IS NULL AND m.composite_score >= 0.5
          ORDER BY m.composite_score DESC, m.created_at DESC
        `)
        .all(workspaceId) as Array<Record<string, unknown>>
    ).map(mapMatch);
  },

  getMatch(workspaceId: number, matchId: number): DocumentQuestionMatch | null {
    const row = getDb()
      .prepare(`
        SELECT m.*, d.title AS document_title, d.original_filename,
               c.control_number, c.name AS control_name
        FROM document_question_matches m
        JOIN documents d ON d.id = m.document_id
        JOIN workspace_controls wc ON wc.id = m.workspace_control_id
        JOIN controls c ON c.id = wc.control_id
        WHERE m.id = ? AND m.workspace_id = ?
      `)
      .get(matchId, workspaceId) as Record<string, unknown> | undefined;
    return row ? mapMatch(row) : null;
  },

  resolveMatch(params: {
    workspaceId: number;
    matchId: number;
    decision: "accept" | "accept_edited" | "dismiss";
    editedResponse?: string;
  }): { match: DocumentQuestionMatch; response?: QuestionResponse } | null {
    const db = getDb();
    const match = evidenceRepository.getMatch(params.workspaceId, params.matchId);
    if (!match) return null;

    const now = new Date().toISOString();
    if (params.decision === "dismiss") {
      db.prepare(
        "UPDATE document_question_matches SET user_accepted = 0, accepted_at = ? WHERE id = ? AND workspace_id = ?",
      ).run(now, match.id, params.workspaceId);
      return { match: evidenceRepository.getMatch(params.workspaceId, match.id)! };
    }

    const textToSave =
      params.decision === "accept_edited"
        ? (params.editedResponse ?? match.suggestedResponse ?? "")
        : (match.suggestedResponse ?? "");

    const response = controlsRepository.saveQuestionResponse({
      workspaceId: params.workspaceId,
      workspaceControlId: match.workspaceControlId,
      questionId: match.questionId,
      responseText: textToSave,
      changeSource: params.decision === "accept_edited" ? "ai_edited" : "ai_accepted",
      sourceDocumentId: match.documentId,
      sourceMatchId: match.id,
    });

    db.prepare(
      "UPDATE document_question_matches SET user_accepted = 1, accepted_at = ? WHERE id = ? AND workspace_id = ?",
    ).run(now, match.id, params.workspaceId);

    return { match: evidenceRepository.getMatch(params.workspaceId, match.id)!, response };
  },

  listEvidenceLinks(workspaceId: number, workspaceControlId?: number): EvidenceLink[] {
    const db = getDb();
    const sql =
      workspaceControlId != null
        ? `
          SELECT e.*, c.control_number, c.name AS control_name
          FROM evidence_links e
          LEFT JOIN workspace_controls wc ON wc.id = e.workspace_control_id
          LEFT JOIN controls c ON c.id = wc.control_id
          WHERE e.workspace_id = ? AND e.workspace_control_id = ?
          ORDER BY e.created_at DESC
        `
        : `
          SELECT e.*, c.control_number, c.name AS control_name
          FROM evidence_links e
          LEFT JOIN workspace_controls wc ON wc.id = e.workspace_control_id
          LEFT JOIN controls c ON c.id = wc.control_id
          WHERE e.workspace_id = ?
          ORDER BY e.created_at DESC
        `;
    const rows =
      workspaceControlId != null
        ? (db.prepare(sql).all(workspaceId, workspaceControlId) as Array<Record<string, unknown>>)
        : (db.prepare(sql).all(workspaceId) as Array<Record<string, unknown>>);
    return rows.map(mapEvidenceLink);
  },

  createEvidenceLink(params: {
    workspaceId: number;
    workspaceControlId?: number | null;
    questionId?: number | null;
    testRunId?: number | null;
    title: string;
    url?: string | null;
    evidenceType?: EvidenceType | null;
    description?: string | null;
    documentId?: number | null;
  }): EvidenceLink {
    const db = getDb();
    const res = db
      .prepare(`
        INSERT INTO evidence_links (
          workspace_id, workspace_control_id, question_id, test_run_id,
          title, url, evidence_type, description, document_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.workspaceId,
        params.workspaceControlId ?? null,
        params.questionId ?? null,
        params.testRunId ?? null,
        params.title,
        params.url ?? null,
        params.evidenceType ?? null,
        params.description ?? null,
        params.documentId ?? null,
      );
    const row = db
      .prepare("SELECT * FROM evidence_links WHERE id = ?")
      .get(Number(res.lastInsertRowid)) as Record<string, unknown>;
    return mapEvidenceLink(row);
  },

  updateEvidenceLink(
    workspaceId: number,
    id: number,
    patch: {
      title?: string;
      url?: string | null;
      evidenceType?: EvidenceType | null;
      description?: string | null;
    },
  ): EvidenceLink | null {
    const db = getDb();
    const cur = db
      .prepare("SELECT * FROM evidence_links WHERE id = ? AND workspace_id = ?")
      .get(id, workspaceId) as Record<string, unknown> | undefined;
    if (!cur) return null;
    db.prepare(`
      UPDATE evidence_links
      SET title = ?, url = ?, evidence_type = ?, description = ?
      WHERE id = ? AND workspace_id = ?
    `).run(
      patch.title ?? String(cur.title),
      patch.url !== undefined ? patch.url : cur.url != null ? String(cur.url) : null,
      patch.evidenceType !== undefined
        ? patch.evidenceType
        : cur.evidence_type != null
          ? String(cur.evidence_type)
          : null,
      patch.description !== undefined
        ? patch.description
        : cur.description != null
          ? String(cur.description)
          : null,
      id,
      workspaceId,
    );
    const updated = db
      .prepare(`
        SELECT e.*, c.control_number, c.name AS control_name
        FROM evidence_links e
        LEFT JOIN workspace_controls wc ON wc.id = e.workspace_control_id
        LEFT JOIN controls c ON c.id = wc.control_id
        WHERE e.id = ?
      `)
      .get(id) as Record<string, unknown>;
    return mapEvidenceLink(updated);
  },

  deleteEvidenceLink(workspaceId: number, id: number): boolean {
    const res = getDb()
      .prepare("DELETE FROM evidence_links WHERE id = ? AND workspace_id = ?")
      .run(id, workspaceId);
    return Number(res.changes) > 0;
  },
};
