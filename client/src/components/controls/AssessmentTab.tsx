import { parseApraRefs } from "@shared/apra-paragraphs";
import type { ControlDetailResponse, DocumentQuestionMatch } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog, Icon, SeverityBadge } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

function formatEvidenceHint(raw: string): string {
  if (!raw) return "Document";
  return raw
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" / ");
}

interface AssessmentTabProps {
  detail: ControlDetailResponse;
  controlNumber: string;
  draftResponses: Record<number, string>;
  dirtyQuestions: Set<number>;
  savingQuestionId: number | null;
  onDraftChange: (questionId: number, value: string, savedValue: string) => void;
  onSaveResponse: (questionId: number, text: string) => Promise<void>;
  onClearDirty: (questionId: number) => void;
  onGoEvidenceTab: () => void;
}

export function AssessmentTab({
  detail,
  controlNumber,
  draftResponses,
  dirtyQuestions,
  savingQuestionId,
  onDraftChange,
  onSaveResponse,
  onClearDirty,
  onGoEvidenceTab,
}: AssessmentTabProps) {
  const [generatingQ, setGeneratingQ] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [editingMatchText, setEditingMatchText] = useState("");
  const [pendingOverwriteMatch, setPendingOverwriteMatch] = useState<{
    match: DocumentQuestionMatch;
    mode: "accept" | "accept_edited";
    text?: string;
  } | null>(null);

  const executeResolveMatch = useMutation({
    mutationFn: ({
      match,
      decision,
      editedText,
    }: {
      match: DocumentQuestionMatch;
      decision: "accept" | "accept_edited" | "dismiss";
      editedText?: string;
    }) => {
      if (decision === "accept_edited") {
        return apiRequest("POST", `/api/matches/${match.id}/accept-edited`, {
          responseText: editedText || match.suggestedResponse || "",
        });
      }
      return apiRequest("POST", `/api/matches/${match.id}/${decision}`);
    },
    onSuccess: (_res, vars) => {
      setPendingOverwriteMatch(null);
      setEditingMatchId(null);
      if (vars.decision !== "dismiss") {
        onClearDirty(vars.match.questionId);
      }
      invalidateWorkspaceQueries(controlNumber);
      showToast("AI suggestion updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const requestAcceptMatch = (
    match: DocumentQuestionMatch,
    mode: "accept" | "accept_edited",
    text?: string,
  ) => {
    const existing = (draftResponses[match.questionId] || "").trim();
    if (existing) {
      setPendingOverwriteMatch({ match, mode, text });
    } else {
      executeResolveMatch.mutate({ match, decision: mode, editedText: text });
    }
  };

  const questions = detail.aiQuestionnaire?.questions || [];
  const enabledSet = new Set(detail.enabledFrameworkCodes || []);
  const showCps234 = enabledSet.has("apra_cps234");
  const showCps230 = enabledSet.has("apra_cps230");

  return (
    <div className="mw-stack">
      {questions.length === 0 ? (
        <div className="pp-state">
          <div className="pp-state__title">No questionnaire loaded</div>
          <div className="pp-state__text">
            Generate an ISO/IEC 27001:2022 (+ Amd 1:2024) assessment questionnaire using your
            configured AI provider.
          </div>
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            disabled={generatingQ}
            aria-busy={generatingQ}
            onClick={async () => {
              setGeneratingQ(true);
              try {
                await apiRequest(
                  "POST",
                  `/api/controls/${encodeURIComponent(controlNumber)}/generate-questionnaire`,
                );
                await invalidateWorkspaceQueries(controlNumber);
                showToast("Questionnaire generated", { tone: "ok" });
              } catch (err) {
                showToast(err instanceof Error ? err.message : "Generation failed", {
                  tone: "err",
                });
              } finally {
                setGeneratingQ(false);
              }
            }}
          >
            <Icon name="sparkles" />
            <span>{generatingQ ? "Generating…" : "Generate Questionnaire"}</span>
          </button>
        </div>
      ) : (
        questions.map((q) => {
          const pendingMatches = detail.matches.filter(
            (m) => m.questionId === q.question_id && m.userAccepted === null,
          );
          const draft = draftResponses[q.question_id] ?? "";
          const savedVal =
            detail.responses.find((r) => r.question_id === q.question_id)?.response_text ?? "";
          const isDirty = dirtyQuestions.has(q.question_id) && draft !== savedVal;
          const qCps234 = showCps234 ? parseApraRefs(q.cps234_ref, "cps234") : [];
          const qCps230 = showCps230 ? parseApraRefs(q.cps230_ref, "cps230") : [];

          return (
            <article
              key={q.question_id}
              className={`mw-question-card${isDirty ? " mw-question-card--dirty" : ""}`}
            >
              <div className="mw-row mw-row--between mw-row--wrap">
                <div className="mw-row mw-row--wrap" style={{ gap: 8 }}>
                  <span className="mw-mono" style={{ fontWeight: 600 }}>
                    Q{q.question_id}
                  </span>
                  <span className="mw-faint">Expected: {formatEvidenceHint(q.evidence_type)}</span>
                </div>
                {isDirty ? (
                  <span className="pp-status pp-status--warn">Unsaved</span>
                ) : savedVal.trim() ? (
                  <span className="mw-faint">✓ Saved</span>
                ) : null}
              </div>

              <div className="pp-prose" style={{ fontWeight: 500 }}>
                {q.question}
              </div>

              <details className="pp-disclosure pp-disclosure--plain">
                <summary>Auditor rubric &amp; guidance</summary>
                <div className="pp-disclosure__body mw-rubric-kv mw-muted pp-prose">
                  <div>
                    <strong>Audit severity:</strong>{" "}
                    <span style={{ marginLeft: 4 }}>
                      <SeverityBadge severity={q.severity} />
                    </span>
                  </div>
                  {q.guidance && (
                    <div>
                      <strong>Guidance:</strong> {q.guidance}
                    </div>
                  )}
                  {q.auditor_focus && (
                    <div>
                      <strong>Auditor focus:</strong> {q.auditor_focus}
                    </div>
                  )}
                  {q.what_good_looks_like && (
                    <div>
                      <strong>What good looks like:</strong> {q.what_good_looks_like}
                    </div>
                  )}
                  {q.red_flags && (
                    <div>
                      <strong>Red flags:</strong> {q.red_flags}
                    </div>
                  )}
                  {q.nc_pattern && (
                    <div>
                      <strong>Typical nonconformity:</strong> {q.nc_pattern}
                    </div>
                  )}
                  {q.related_controls && (
                    <div>
                      <strong>Related controls:</strong> {q.related_controls}
                    </div>
                  )}
                  {(qCps234.length > 0 || qCps230.length > 0) && (
                    <div>
                      <strong>Active APRA mapping:</strong>{" "}
                      {[
                        ...qCps234.map((g) => `CPS 234 §${g.code} (${g.label})`),
                        ...qCps230.map((g) => `CPS 230 §${g.code} (${g.label})`),
                      ].join(" · ")}
                    </div>
                  )}
                </div>
              </details>

              {pendingMatches.map((m) => {
                const isEditingMatch = editingMatchId === m.id;
                return (
                  <div key={m.id} className="mw-match-card">
                    <div className="mw-row mw-row--between mw-row--wrap">
                      <span className="mw-row">
                        <Icon name="sparkles" />
                        <strong>AI Suggestion</strong>
                        <span className="pp-badge pp-badge--accent">
                          {Math.round(m.compositeScore * 100)}%
                        </span>
                      </span>
                      <span className="mw-faint">
                        Source:{" "}
                        {m.documentTitle || m.originalFilename || `Document #${m.documentId}`}
                      </span>
                    </div>
                    {m.aiSummary && <div className="mw-muted">{m.aiSummary}</div>}
                    {m.matchedPassage && (
                      <blockquote className="mw-quote">“{m.matchedPassage}”</blockquote>
                    )}
                    {isEditingMatch ? (
                      <div className="mw-stack mw-stack--sm">
                        <textarea
                          className="pp-textarea"
                          rows={3}
                          value={editingMatchText}
                          onChange={(e) => setEditingMatchText(e.target.value)}
                        />
                        <div className="mw-row">
                          <button
                            type="button"
                            className="pp-button pp-button--primary pp-button--sm"
                            disabled={!editingMatchText.trim()}
                            onClick={() =>
                              requestAcceptMatch(m, "accept_edited", editingMatchText.trim())
                            }
                          >
                            Save Edited Response
                          </button>
                          <button
                            type="button"
                            className="pp-button pp-button--ghost pp-button--sm"
                            onClick={() => setEditingMatchId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.suggestedResponse && (
                          <div className="pp-prose">{m.suggestedResponse}</div>
                        )}
                        <div className="mw-row mw-row--wrap">
                          <button
                            type="button"
                            className="pp-button pp-button--primary pp-button--sm"
                            onClick={() => requestAcceptMatch(m, "accept")}
                          >
                            Accept into Response
                          </button>
                          <button
                            type="button"
                            className="pp-button pp-button--sm"
                            onClick={() => {
                              setEditingMatchId(m.id);
                              setEditingMatchText(m.suggestedResponse || "");
                            }}
                          >
                            Edit &amp; Accept
                          </button>
                          <button
                            type="button"
                            className="pp-button pp-button--ghost pp-button--sm"
                            onClick={() =>
                              executeResolveMatch.mutate({ match: m, decision: "dismiss" })
                            }
                          >
                            Dismiss
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              <div className="pp-field">
                <label className="pp-field__label" htmlFor={`q-resp-${q.question_id}`}>
                  Implementation response
                </label>
                <textarea
                  id={`q-resp-${q.question_id}`}
                  className="pp-textarea mw-question-textarea"
                  placeholder="Document how this organisation satisfies the control requirement and cite evidence…"
                  value={draft}
                  onChange={(e) => onDraftChange(q.question_id, e.target.value, savedVal)}
                />
              </div>

              <div className="mw-row mw-row--between">
                <span className="mw-faint">
                  {isDirty
                    ? "Unsaved changes (⌘S to save all)"
                    : savedVal
                      ? "Saved"
                      : "Not answered yet"}
                </span>
                <div className="mw-row">
                  {detail.linkedDocuments.length === 0 && (
                    <button
                      type="button"
                      className="pp-button pp-button--ghost pp-button--sm"
                      onClick={onGoEvidenceTab}
                    >
                      Link Evidence
                    </button>
                  )}
                  <button
                    type="button"
                    className={`pp-button pp-button--sm${isDirty ? " pp-button--primary" : ""}`}
                    disabled={!isDirty || savingQuestionId === q.question_id}
                    aria-busy={savingQuestionId === q.question_id}
                    onClick={() => void onSaveResponse(q.question_id, draft)}
                  >
                    {savingQuestionId === q.question_id ? "Saving…" : "Save Response"}
                  </button>
                </div>
              </div>
            </article>
          );
        })
      )}

      <ConfirmDialog
        open={Boolean(pendingOverwriteMatch)}
        title="Replace Existing Response?"
        message={
          pendingOverwriteMatch
            ? `Q${pendingOverwriteMatch.match.questionId} already has a response. Replace it with the AI suggestion from "${pendingOverwriteMatch.match.documentTitle || "document"}"? The previous answer will be preserved in the immutable change log.`
            : ""
        }
        confirmLabel="Replace Response"
        busy={executeResolveMatch.isPending}
        onConfirm={() => {
          if (!pendingOverwriteMatch) return;
          executeResolveMatch.mutate({
            match: pendingOverwriteMatch.match,
            decision: pendingOverwriteMatch.mode,
            editedText: pendingOverwriteMatch.text,
          });
        }}
        onClose={() => setPendingOverwriteMatch(null)}
      />
    </div>
  );
}
