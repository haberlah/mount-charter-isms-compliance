import type { ControlSummary, DocumentQuestionMatch } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface AiReviewQueueTabProps {
  pendingMatches: DocumentQuestionMatch[];
  controls: ControlSummary[];
}

export function AiReviewQueueTab({ pendingMatches, controls }: AiReviewQueueTabProps) {
  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [editingMatchText, setEditingMatchText] = useState("");

  const questionTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of controls) {
      for (const q of c.aiQuestionnaire?.questions || []) {
        map.set(`${c.controlNumber}:${q.question_id}`, q.question);
      }
    }
    return map;
  }, [controls]);

  const resolveQueuedMatch = useMutation({
    mutationFn: ({
      id,
      decision,
      editedText,
    }: {
      id: number;
      decision: "accept" | "accept_edited" | "dismiss";
      editedText?: string;
    }) => {
      if (decision === "accept_edited") {
        return apiRequest("POST", `/api/matches/${id}/accept-edited`, {
          responseText: editedText || "",
        });
      }
      return apiRequest("POST", `/api/matches/${id}/${decision}`);
    },
    onSuccess: () => {
      setEditingMatchId(null);
      invalidateWorkspaceQueries();
      showToast("AI suggestion updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  if (pendingMatches.length === 0) {
    return (
      <div className="pp-state">
        <div className="pp-state__title">AI review queue is clear</div>
        <div className="pp-state__text">
          Link an uploaded document to a control and click Analyse to generate draft responses with
          source quotes for review here.
        </div>
      </div>
    );
  }

  return (
    <div className="mw-stack">
      {pendingMatches.map((m) => {
        const qText = questionTextMap.get(`${m.controlNumber}:${m.questionId}`);
        const isEditing = editingMatchId === m.id;
        return (
          <article key={m.id} className="mw-match-card">
            <div className="mw-row mw-row--between mw-row--wrap">
              <div className="mw-row mw-row--wrap">
                <Link
                  href={`/controls/${encodeURIComponent(m.controlNumber || "")}`}
                  className="mw-table-link mw-mono"
                >
                  {m.controlNumber} · Q{m.questionId}
                </Link>
                {m.controlName && <span className="mw-muted">{m.controlName}</span>}
                <span className="pp-badge pp-badge--accent">
                  {Math.round(m.compositeScore * 100)}%
                </span>
              </div>
              <span className="mw-faint">Source: {m.documentTitle || m.originalFilename}</span>
            </div>
            {qText && (
              <div className="pp-prose" style={{ fontWeight: 500 }}>
                {qText}
              </div>
            )}
            {m.aiSummary && <div className="mw-muted">{m.aiSummary}</div>}
            {m.matchedPassage && <blockquote className="mw-quote">“{m.matchedPassage}”</blockquote>}
            {isEditing ? (
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
                    disabled={!editingMatchText.trim() || resolveQueuedMatch.isPending}
                    onClick={() =>
                      resolveQueuedMatch.mutate({
                        id: m.id,
                        decision: "accept_edited",
                        editedText: editingMatchText.trim(),
                      })
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
                {m.suggestedResponse && <div className="pp-prose">{m.suggestedResponse}</div>}
                <div className="mw-row mw-row--wrap">
                  <button
                    type="button"
                    className="pp-button pp-button--primary pp-button--sm"
                    onClick={() => resolveQueuedMatch.mutate({ id: m.id, decision: "accept" })}
                  >
                    Accept Suggestion
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
                    onClick={() => resolveQueuedMatch.mutate({ id: m.id, decision: "dismiss" })}
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
