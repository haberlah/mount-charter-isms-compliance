import type {
  AgentProposal,
  ControlSummary,
  DocumentQuestionMatch,
  RequirementStatus,
} from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { RequirementStatusBadge } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface AiReviewQueueTabProps {
  pendingMatches: DocumentQuestionMatch[];
  pendingProposals: AgentProposal[];
  controls: ControlSummary[];
}

type InboxFilter = "all" | "iso" | "frameworks" | "governance";

function calibratedLabel(score: number, hasQuote: boolean): { text: string; tone: string } {
  if (!hasQuote)
    return { text: "No verbatim quote — verify manually", tone: "pp-status pp-status--warn" };
  if (score >= 0.8) return { text: "High · Direct quote", tone: "pp-status pp-status--ok" };
  if (score >= 0.6) return { text: "Medium · Partial match", tone: "pp-badge pp-badge--accent" };
  return { text: "Low · Inferred", tone: "pp-status pp-status--warn" };
}

export function AiReviewQueueTab({
  pendingMatches,
  pendingProposals,
  controls,
}: AiReviewQueueTabProps) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [editingMatchId, setEditingMatchId] = useState<number | null>(null);
  const [editingMatchText, setEditingMatchText] = useState("");
  const [editingProposalId, setEditingProposalId] = useState<number | null>(null);
  const [editingPropStatus, setEditingPropStatus] = useState<RequirementStatus>("PartiallyMet");
  const [editingPropSummary, setEditingPropSummary] = useState("");

  const questionTextMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of controls) {
      for (const q of c.aiQuestionnaire?.questions || []) {
        map.set(`${c.controlNumber}:${q.question_id}`, q.question);
      }
    }
    return map;
  }, [controls]);

  const highConfIsoCount = useMemo(
    () =>
      pendingMatches.filter((m) => m.compositeScore >= 0.85 && Boolean(m.matchedPassage?.trim()))
        .length,
    [pendingMatches],
  );

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
      void invalidateWorkspaceQueries();
      showToast("ISO 27001 proposal updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const batchAcceptHighConf = useMutation({
    mutationFn: () =>
      apiRequest<{ acceptedCount: number }>("POST", "/api/matches/batch-accept-high-confidence"),
    onSuccess: (res) => {
      void invalidateWorkspaceQueries();
      showToast(`Accepted ${res.acceptedCount} high-confidence ISO response(s)`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const resolveProposal = useMutation({
    mutationFn: ({
      id,
      decision,
      editedPayload,
    }: {
      id: number;
      decision: "approve" | "edit-approve" | "reject";
      editedPayload?: { suggestedStatus: RequirementStatus; evidenceSummary: string };
    }) =>
      apiRequest(
        "POST",
        `/api/agent/proposals/${id}/${decision}`,
        decision === "edit-approve" ? editedPayload : undefined,
      ),
    onSuccess: (_data, vars) => {
      setEditingProposalId(null);
      void invalidateWorkspaceQueries();
      showToast(
        vars.decision === "reject"
          ? "Framework proposal dismissed"
          : "Framework assessment verified & recorded to audit trail",
        { tone: vars.decision === "reject" ? "info" : "ok" },
      );
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const totalCount = pendingMatches.length + pendingProposals.length;

  if (totalCount === 0) {
    return (
      <div className="pp-state">
        <div className="pp-state__title">AI Proposal Inbox is clear</div>
        <div className="pp-state__text">
          Upload a policy or record and click <strong>Map Everywhere</strong> to fan out cited ISO
          27001 and Australian framework proposals here for human review before anything touches the
          immutable audit trail.
        </div>
      </div>
    );
  }

  const frameworkProposals = useMemo(
    () => pendingProposals.filter((p) => p.targetType === "framework_assessment"),
    [pendingProposals],
  );
  const governanceProposals = useMemo(
    () => pendingProposals.filter((p) => p.targetType !== "framework_assessment"),
    [pendingProposals],
  );

  const showIso = filter === "all" || filter === "iso";
  const showFrameworks = filter === "all" || filter === "frameworks";
  const showGovernance = filter === "all" || filter === "governance";

  return (
    <div className="mw-stack">
      <div className="mw-bulk-bar" role="region" aria-label="Proposal inbox filters and actions">
        <div className="mw-row mw-row--wrap">
          <button
            type="button"
            className={`pp-button pp-button--sm ${filter === "all" ? "pp-button--primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            className={`pp-button pp-button--sm ${filter === "iso" ? "pp-button--primary" : ""}`}
            onClick={() => setFilter("iso")}
          >
            ISO 27001 Answers ({pendingMatches.length})
          </button>
          <button
            type="button"
            className={`pp-button pp-button--sm ${filter === "frameworks" ? "pp-button--primary" : ""}`}
            onClick={() => setFilter("frameworks")}
          >
            AU Frameworks ({frameworkProposals.length})
          </button>
          <button
            type="button"
            className={`pp-button pp-button--sm ${filter === "governance" ? "pp-button--primary" : ""}`}
            onClick={() => setFilter("governance")}
          >
            CAPAs &amp; SoA ({governanceProposals.length})
          </button>
        </div>
        {highConfIsoCount > 0 && showIso && (
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            disabled={batchAcceptHighConf.isPending}
            onClick={() => batchAcceptHighConf.mutate()}
            title="Only accepts ISO questionnaire suggestions scoring >= 85% with a verbatim document quote. Statutory framework assessments and CAPAs always require individual review."
          >
            Accept High-Confidence ISO ({highConfIsoCount})
          </button>
        )}
      </div>

      {showGovernance &&
        governanceProposals.map((p) => (
          <article key={`gov-${p.id}`} className="mw-proposal-card">
            <div className="mw-row mw-row--between mw-row--wrap">
              <div className="mw-row mw-row--wrap">
                <span className="pp-badge pp-badge--accent">AI Proposal · Uncommitted</span>
                <span className="pp-badge">
                  {p.targetType === "capa_item"
                    ? "Draft CAPA"
                    : p.targetType === "soa_justification"
                      ? "SoA Clause 6.1.3(d)"
                      : "Draft Risk"}
                </span>
                <strong>{p.title}</strong>
                <span className="pp-badge mw-mono">{p.targetRef}</span>
              </div>
              <span className="mw-faint mw-mono">
                {p.runLabel}
                {p.modelUsed ? ` · ${p.modelUsed}` : ""}
              </span>
            </div>
            <div className="pp-prose">{p.summary}</div>
            {p.rationale && <div className="mw-muted">{p.rationale}</div>}
            <div className="mw-row mw-row--wrap">
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={resolveProposal.isPending}
                onClick={() => resolveProposal.mutate({ id: p.id, decision: "approve" })}
              >
                {p.targetType === "capa_item"
                  ? "Create Open CAPA"
                  : p.targetType === "soa_justification"
                    ? "Save SoA Justification"
                    : "Create Risk"}
              </button>
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                disabled={resolveProposal.isPending}
                onClick={() => resolveProposal.mutate({ id: p.id, decision: "reject" })}
              >
                Dismiss
              </button>
            </div>
          </article>
        ))}

      {showFrameworks &&
        frameworkProposals.map((p) => {
          const fwCode = String(p.payload.frameworkCode || "");
          const suggestedStatus = String(
            p.payload.suggestedStatus || "PartiallyMet",
          ) as RequirementStatus;
          const gaps = Array.isArray(p.payload.gaps) ? (p.payload.gaps as string[]) : [];
          const hasQuote = Boolean(p.quotedPassage?.trim());
          const badge = calibratedLabel(p.confidence, hasQuote);
          const isEditing = editingProposalId === p.id;

          return (
            <article key={`prop-${p.id}`} className="mw-proposal-card">
              <div className="mw-row mw-row--between mw-row--wrap">
                <div className="mw-row mw-row--wrap">
                  <span className="pp-badge pp-badge--accent">AI Proposal · Uncommitted</span>
                  <Link
                    href={`/frameworks?fw=${encodeURIComponent(fwCode)}`}
                    className="mw-table-link"
                    style={{ fontWeight: 600 }}
                  >
                    {p.title}
                  </Link>
                  <RequirementStatusBadge status={suggestedStatus} />
                  <span className={badge.tone}>{badge.text}</span>
                  {p.hasRubricConflict && (
                    <span className="pp-status pp-status--warn">
                      Prescriptive SLA — verify proof
                    </span>
                  )}
                </div>
                <span className="mw-faint mw-mono">
                  {p.sourceDocumentTitle || "Workspace evidence"}
                  {p.modelUsed ? ` · ${p.modelUsed}` : ""}
                </span>
              </div>

              <div className="pp-prose">{p.summary}</div>
              {p.rationale && <div className="mw-muted">{p.rationale}</div>}
              {p.quotedPassage && <blockquote className="mw-quote">“{p.quotedPassage}”</blockquote>}
              {gaps.length > 0 && (
                <div className="mw-faint">
                  <strong>Remaining gaps:</strong> {gaps.join(" · ")}
                </div>
              )}

              {isEditing ? (
                <div className="mw-stack mw-stack--sm">
                  <div className="mw-row mw-row--wrap">
                    <label className="pp-field__label" htmlFor={`prop-status-${p.id}`}>
                      Verified Status
                    </label>
                    <select
                      id={`prop-status-${p.id}`}
                      className="pp-select pp-select--sm"
                      style={{ width: "auto" }}
                      value={editingPropStatus}
                      onChange={(e) => setEditingPropStatus(e.target.value as RequirementStatus)}
                    >
                      <option value="Met">Met</option>
                      <option value="PartiallyMet">Partially Met</option>
                      <option value="NotMet">Not Met</option>
                      <option value="NotApplicable">Not Applicable</option>
                    </select>
                  </div>
                  <textarea
                    className="pp-textarea"
                    rows={3}
                    value={editingPropSummary}
                    onChange={(e) => setEditingPropSummary(e.target.value)}
                  />
                  <div className="mw-row">
                    <button
                      type="button"
                      className="pp-button pp-button--primary pp-button--sm"
                      disabled={resolveProposal.isPending}
                      onClick={() =>
                        resolveProposal.mutate({
                          id: p.id,
                          decision: "edit-approve",
                          editedPayload: {
                            suggestedStatus: editingPropStatus,
                            evidenceSummary: editingPropSummary.trim(),
                          },
                        })
                      }
                    >
                      Save &amp; Record Assessment
                    </button>
                    <button
                      type="button"
                      className="pp-button pp-button--ghost pp-button--sm"
                      onClick={() => setEditingProposalId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mw-row mw-row--wrap">
                  <button
                    type="button"
                    className="pp-button pp-button--primary pp-button--sm"
                    disabled={resolveProposal.isPending}
                    onClick={() => resolveProposal.mutate({ id: p.id, decision: "approve" })}
                  >
                    Verify &amp; Commit Assessment
                  </button>
                  <button
                    type="button"
                    className="pp-button pp-button--sm"
                    onClick={() => {
                      setEditingProposalId(p.id);
                      setEditingPropStatus(suggestedStatus);
                      setEditingPropSummary(p.summary);
                    }}
                  >
                    Edit &amp; Commit
                  </button>
                  <button
                    type="button"
                    className="pp-button pp-button--ghost pp-button--sm"
                    disabled={resolveProposal.isPending}
                    onClick={() => resolveProposal.mutate({ id: p.id, decision: "reject" })}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </article>
          );
        })}

      {showIso &&
        pendingMatches.map((m) => {
          const qText = questionTextMap.get(`${m.controlNumber}:${m.questionId}`);
          const isEditing = editingMatchId === m.id;
          const hasQuote = Boolean(m.matchedPassage?.trim());
          const badge = calibratedLabel(m.compositeScore, hasQuote);
          return (
            <article key={`iso-${m.id}`} className="mw-proposal-card">
              <div className="mw-row mw-row--between mw-row--wrap">
                <div className="mw-row mw-row--wrap">
                  <span className="pp-badge pp-badge--accent">AI Proposal · Uncommitted</span>
                  <Link
                    href={`/controls/${encodeURIComponent(m.controlNumber || "")}`}
                    className="mw-table-link mw-mono"
                  >
                    {m.controlNumber} · Q{m.questionId}
                  </Link>
                  {m.controlName && <span className="mw-muted">{m.controlName}</span>}
                  <span className={badge.tone}>{badge.text}</span>
                </div>
                <span className="mw-faint">Source: {m.documentTitle || m.originalFilename}</span>
              </div>
              {qText && (
                <div className="pp-prose" style={{ fontWeight: 500 }}>
                  {qText}
                </div>
              )}
              {m.aiSummary && <div className="mw-muted">{m.aiSummary}</div>}
              {m.matchedPassage && (
                <blockquote className="mw-quote">“{m.matchedPassage}”</blockquote>
              )}
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
