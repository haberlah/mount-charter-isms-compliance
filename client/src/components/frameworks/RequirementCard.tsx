import type {
  DocumentRecord,
  EvidenceType,
  FrameworkRequirementItem,
  RequirementAiAssessment,
  RequirementAssessmentLogEntry,
  RequirementStatus,
} from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { formatShortDate, Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface RequirementCardProps {
  frameworkCode: string;
  req: FrameworkRequirementItem;
  documents: DocumentRecord[];
}

export function RequirementCard({ frameworkCode, req, documents }: RequirementCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [aiResult, setAiResult] = useState<RequirementAiAssessment | null>(null);

  const [draftStatus, setDraftStatus] = useState<RequirementStatus>(req.assessment.status);
  const [draftOwner, setDraftOwner] = useState(req.assessment.owner || "");
  const [draftTargetDate, setDraftTargetDate] = useState(req.assessment.targetDate || "");
  const [draftEvidence, setDraftEvidence] = useState(req.assessment.evidenceSummary || "");
  const [draftNotes, setDraftNotes] = useState(req.assessment.notes || "");

  const [evMode, setEvMode] = useState<"doc" | "url">("doc");
  const [evDocId, setEvDocId] = useState<string>("");
  const [evTitle, setEvTitle] = useState("");
  const [evUrl, setEvUrl] = useState("");
  const [evType, setEvType] = useState<EvidenceType>("RECORD");

  const { data: history = [], isLoading: loadingHistory } = useQuery<
    RequirementAssessmentLogEntry[]
  >({
    queryKey: ["req-history", frameworkCode, req.reqCode],
    queryFn: () =>
      apiRequest<RequirementAssessmentLogEntry[]>(
        "GET",
        `/api/frameworks/${encodeURIComponent(frameworkCode)}/requirements/${encodeURIComponent(req.reqCode)}/history`,
      ),
    enabled: showHistory,
  });

  const updateReq = useMutation({
    mutationFn: (patch: {
      status: RequirementStatus;
      owner?: string | null;
      targetDate?: string | null;
      evidenceSummary?: string | null;
      notes?: string | null;
    }) =>
      apiRequest(
        "PATCH",
        `/api/frameworks/${encodeURIComponent(frameworkCode)}/requirements/${encodeURIComponent(req.reqCode)}`,
        patch,
      ),
    onSuccess: () => {
      setIsEditing(false);
      invalidateWorkspaceQueries();
      showToast("Requirement assessment saved", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const addEvidence = useMutation({
    mutationFn: (payload: {
      documentId?: number | null;
      title: string;
      url?: string | null;
      evidenceType?: EvidenceType | null;
    }) =>
      apiRequest(
        "POST",
        `/api/frameworks/${encodeURIComponent(frameworkCode)}/requirements/${encodeURIComponent(req.reqCode)}/evidence`,
        payload,
      ),
    onSuccess: () => {
      setShowEvidenceForm(false);
      setEvDocId("");
      setEvTitle("");
      setEvUrl("");
      invalidateWorkspaceQueries();
      showToast("Evidence linked to requirement", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const removeEvidence = useMutation({
    mutationFn: (id: number) =>
      apiRequest(
        "DELETE",
        `/api/frameworks/${encodeURIComponent(frameworkCode)}/requirements/${encodeURIComponent(req.reqCode)}/evidence/${id}`,
      ),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("Evidence link removed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const runAiAssess = useMutation({
    mutationFn: () =>
      apiRequest<RequirementAiAssessment>(
        "POST",
        `/api/frameworks/${encodeURIComponent(frameworkCode)}/requirements/${encodeURIComponent(req.reqCode)}/ai-assess`,
      ),
    onSuccess: (res) => {
      setAiResult(res);
      showToast(`AI suggested ${res.suggestedStatus} (${Math.round(res.confidence * 100)}%)`, {
        tone: "ok",
      });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const openEditor = () => {
    setDraftStatus(req.assessment.status);
    setDraftOwner(req.assessment.owner || "");
    setDraftTargetDate(req.assessment.targetDate || "");
    setDraftEvidence(req.assessment.evidenceSummary || "");
    setDraftNotes(req.assessment.notes || "");
    setIsEditing(true);
  };

  const hasRubricConflict = req.linkedControls.some((c) => c.coverage === "rubric_conflict");

  return (
    <article className="mw-question-card">
      <div className="mw-row mw-row--between mw-row--wrap">
        <div className="mw-row mw-row--wrap">
          <span className="pp-badge">{req.reqCode}</span>
          {req.levelOrCategory && (
            <span className="pp-badge pp-badge--accent">{req.levelOrCategory}</span>
          )}
          {req.clauseRef && <span className="mw-faint mw-mono">{req.clauseRef}</span>}
          <span className="mw-faint">{req.domain}</span>
          {req.isDraft && <span className="pp-status pp-status--warn">Draft — Not Yet Law</span>}
          {req.deadlineDate && !req.isDraft && (
            <span className="pp-status pp-status--warn">
              Effective {formatShortDate(req.deadlineDate)}
            </span>
          )}
        </div>

        <div className="mw-row">
          <select
            className="pp-select pp-select--sm"
            aria-label={`Status for ${req.reqCode}`}
            value={req.assessment.status}
            onChange={(e) => updateReq.mutate({ status: e.target.value as RequirementStatus })}
          >
            <option value="NotMet">Not Met</option>
            <option value="PartiallyMet">Partially Met</option>
            <option value="Met">Met</option>
            <option value="NotApplicable">Not Applicable</option>
          </select>
          <button
            type="button"
            className="pp-button pp-button--ghost pp-button--sm"
            disabled={runAiAssess.isPending}
            onClick={() => runAiAssess.mutate()}
            title="Analyse linked ISO controls & evidence using configured AI provider"
          >
            {runAiAssess.isPending ? "Analysing…" : "AI Assess"}
          </button>
          <button
            type="button"
            className="pp-button pp-button--ghost pp-button--sm"
            onClick={() => (isEditing ? setIsEditing(false) : openEditor())}
          >
            {isEditing ? "Close" : "Assess"}
          </button>
          <button
            type="button"
            className="pp-button pp-button--ghost pp-button--sm"
            onClick={() => setShowEvidenceForm((v) => !v)}
          >
            <Icon name="link-2" />
            <span>Evidence ({req.evidenceLinks.length})</span>
          </button>
          {req.historyCount > 0 && (
            <button
              type="button"
              className="pp-button pp-button--ghost pp-button--sm"
              onClick={() => setShowHistory((v) => !v)}
            >
              History ({req.historyCount})
            </button>
          )}
        </div>
      </div>

      <div style={{ fontWeight: 500 }}>{req.title}</div>
      <div className="mw-muted pp-prose">{req.description}</div>
      {req.guidance && (
        <div className="mw-faint pp-prose" style={{ lineHeight: 1.45 }}>
          <strong>In practice:</strong> {req.guidance}
        </div>
      )}

      {req.driftWarnings && req.driftWarnings.length > 0 && (
        <div className="pp-banner pp-banner--err" role="alert">
          <div className="pp-banner__body">
            <div className="pp-banner__title">
              Cross-Framework Drift Detected ({req.driftWarnings.length})
            </div>
            <div className="pp-banner__text">
              {req.driftWarnings.map((w, i) => (
                <div key={`${w.controlNumber}-${i}`}>
                  <strong>ISO {w.controlNumber}:</strong> {w.reason}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {aiResult && (
        <div className="mw-match-card">
          <div className="mw-row mw-row--between mw-row--wrap">
            <strong>
              AI Readiness Suggestion ({aiResult.provider} · {aiResult.modelUsed})
            </strong>
            <div className="mw-row">
              <span className="pp-badge pp-badge--accent">
                {aiResult.suggestedStatus} ({Math.round(aiResult.confidence * 100)}%)
              </span>
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={updateReq.isPending}
                onClick={() => {
                  updateReq.mutate({
                    status: aiResult.suggestedStatus,
                    notes: [
                      aiResult.reasoning,
                      aiResult.gaps.length > 0 ? `Gaps: ${aiResult.gaps.join("; ")}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  });
                  setAiResult(null);
                }}
              >
                Apply Assessment
              </button>
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={() => setAiResult(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="pp-prose">{aiResult.reasoning}</div>
          {aiResult.gaps.length > 0 && (
            <div className="pp-prose">
              <strong>Identified Gaps:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {aiResult.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          {aiResult.recommendedActions.length > 0 && (
            <div className="pp-prose">
              <strong>Recommended Actions:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {aiResult.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {hasRubricConflict && (
        <div className="pp-banner pp-banner--warn" role="note">
          <div className="pp-banner__body">
            <div className="pp-banner__title">Prescriptive SLA overrides ISO 27001 guidance</div>
            <div className="pp-banner__text">
              This requirement enforces a stricter prescriptive SLA (e.g. 48-hour critical patching)
              than ISO/IEC 27001:2022 risk-based timelines.
            </div>
          </div>
        </div>
      )}

      <details className="pp-disclosure pp-disclosure--plain">
        <summary>Implementation guidance &amp; expected evidence</summary>
        <div className="pp-disclosure__body mw-stack mw-stack--sm mw-muted pp-prose">
          {req.guidance && (
            <div>
              <strong>Guidance:</strong> {req.guidance}
            </div>
          )}
          {req.evidenceExpected && (
            <div>
              <strong>Expected evidence:</strong> {req.evidenceExpected}
            </div>
          )}
        </div>
      </details>

      {req.linkedControls.length > 0 && (
        <div className="mw-row mw-row--wrap" style={{ gap: 6 }}>
          <span className="mw-faint">Linked ISO 27001 controls:</span>
          {req.linkedControls.map((c) => (
            <Link
              key={c.controlNumber}
              href={`/controls/${encodeURIComponent(c.controlNumber)}`}
              className="pp-badge"
              style={{ textDecoration: "none" }}
              title={`${c.controlNumber} ${c.controlName} — ${c.mappingNotes || c.coverage}`}
            >
              {c.controlNumber} ({c.latestStatus || "Untested"} · {c.questionnairePercentage}%)
            </Link>
          ))}
        </div>
      )}

      {req.evidenceLinks.length > 0 && (
        <div className="mw-row mw-row--wrap" style={{ gap: 6 }}>
          <span className="mw-faint">Attached evidence:</span>
          {req.evidenceLinks.map((ev) => (
            <span key={ev.id} className="pp-badge" style={{ display: "inline-flex", gap: 6 }}>
              {ev.url ? (
                <a
                  href={ev.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  {ev.title}
                </a>
              ) : (
                <span>{ev.documentTitle || ev.title}</span>
              )}
              <button
                type="button"
                aria-label={`Remove evidence ${ev.title}`}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  color: "inherit",
                  lineHeight: 1,
                }}
                onClick={() => removeEvidence.mutate(ev.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!isEditing &&
        (req.assessment.evidenceSummary || req.assessment.notes || req.assessment.owner) && (
          <div className="mw-faint">
            {req.assessment.owner && <span>Owner: {req.assessment.owner} · </span>}
            {req.assessment.targetDate && (
              <span>Target: {formatShortDate(req.assessment.targetDate)} · </span>
            )}
            {req.assessment.evidenceSummary && (
              <span>Evidence: {req.assessment.evidenceSummary}</span>
            )}
          </div>
        )}

      {showEvidenceForm && (
        <div
          className="mw-stack mw-stack--sm"
          style={{ paddingTop: 8, borderTop: "1px solid var(--paper-line-soft)" }}
        >
          <div className="mw-row mw-row--between">
            <strong style={{ fontSize: "var(--paper-size-secondary)" }}>
              Attach Evidence to {req.reqCode}
            </strong>
            <div className="mw-row">
              <button
                type="button"
                className={`pp-button pp-button--sm ${evMode === "doc" ? "pp-button--primary" : ""}`}
                onClick={() => setEvMode("doc")}
              >
                Local Document
              </button>
              <button
                type="button"
                className={`pp-button pp-button--sm ${evMode === "url" ? "pp-button--primary" : ""}`}
                onClick={() => setEvMode("url")}
              >
                External URL
              </button>
            </div>
          </div>

          {evMode === "doc" ? (
            <div className="mw-row mw-row--wrap">
              <select
                className="pp-select pp-select--sm"
                style={{ flex: 1, minWidth: 220 }}
                aria-label="Select local evidence document"
                value={evDocId}
                onChange={(e) => {
                  setEvDocId(e.target.value);
                  const found = documents.find((d) => String(d.id) === e.target.value);
                  if (found && !evTitle) setEvTitle(found.title);
                }}
              >
                <option value="">Choose an uploaded document…</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.originalFilename})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={!evDocId || addEvidence.isPending}
                onClick={() => {
                  const found = documents.find((d) => String(d.id) === evDocId);
                  if (!found) return;
                  addEvidence.mutate({
                    documentId: found.id,
                    title: evTitle.trim() || found.title,
                    evidenceType: found.evidenceType || "DOCUMENT",
                  });
                }}
              >
                Link Document
              </button>
            </div>
          ) : (
            <div className="mw-form-grid">
              <input
                className="pp-input pp-input--sm"
                placeholder="Evidence title (e.g. Intune Patch SLA Report)"
                value={evTitle}
                onChange={(e) => setEvTitle(e.target.value)}
              />
              <input
                className="pp-input pp-input--sm"
                placeholder="https://..."
                value={evUrl}
                onChange={(e) => setEvUrl(e.target.value)}
              />
              <select
                className="pp-select pp-select--sm"
                value={evType}
                onChange={(e) => setEvType(e.target.value as EvidenceType)}
              >
                <option value="RECORD">RECORD</option>
                <option value="POLICY">POLICY</option>
                <option value="REGISTER">REGISTER</option>
                <option value="MATRIX">MATRIX</option>
                <option value="DOCUMENT">DOCUMENT</option>
                <option value="OTHER">OTHER</option>
              </select>
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={!evTitle.trim() || !evUrl.trim() || addEvidence.isPending}
                onClick={() =>
                  addEvidence.mutate({
                    title: evTitle.trim(),
                    url: evUrl.trim(),
                    evidenceType: evType,
                  })
                }
              >
                Add Link
              </button>
            </div>
          )}
        </div>
      )}

      {showHistory && (
        <div
          className="mw-stack mw-stack--sm"
          style={{ paddingTop: 8, borderTop: "1px solid var(--paper-line-soft)" }}
        >
          <strong style={{ fontSize: "var(--paper-size-secondary)" }}>
            Immutable Assessment History
          </strong>
          {loadingHistory ? (
            <span className="mw-faint">Loading history…</span>
          ) : history.length === 0 ? (
            <span className="mw-faint">No recorded changes yet.</span>
          ) : (
            history.slice(0, 8).map((h) => (
              <div key={h.id} className="mw-faint">
                <strong>{formatShortDate(h.createdAt)}</strong>: {h.previousStatus || "Initial"} →{" "}
                <strong>{h.newStatus}</strong>
                {h.owner ? ` · Owner: ${h.owner}` : ""}
                {h.notes ? ` · ${h.notes}` : ""}
              </div>
            ))
          )}
        </div>
      )}

      {isEditing && (
        <div
          className="mw-stack"
          style={{ paddingTop: 8, borderTop: "1px solid var(--paper-line-soft)" }}
        >
          <div className="mw-form-grid">
            <div className="pp-field">
              <label className="pp-field__label" htmlFor={`req-owner-${req.reqCode}`}>
                Owner
              </label>
              <input
                id={`req-owner-${req.reqCode}`}
                className="pp-input pp-input--sm"
                placeholder="e.g. Head of Security / Privacy Officer"
                value={draftOwner}
                onChange={(e) => setDraftOwner(e.target.value)}
              />
            </div>
            <div className="pp-field">
              <label className="pp-field__label" htmlFor={`req-target-${req.reqCode}`}>
                Target / Review Date
              </label>
              <input
                id={`req-target-${req.reqCode}`}
                type="date"
                className="pp-input pp-input--sm"
                value={draftTargetDate}
                onChange={(e) => setDraftTargetDate(e.target.value)}
              />
            </div>
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor={`req-ev-${req.reqCode}`}>
              Evidence Summary
            </label>
            <textarea
              id={`req-ev-${req.reqCode}`}
              className="pp-textarea"
              rows={2}
              value={draftEvidence}
              onChange={(e) => setDraftEvidence(e.target.value)}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor={`req-notes-${req.reqCode}`}>
              Assessment Notes / Gaps
            </label>
            <textarea
              id={`req-notes-${req.reqCode}`}
              className="pp-textarea"
              rows={2}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
            />
          </div>
          <div className="mw-row">
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              disabled={updateReq.isPending}
              onClick={() =>
                updateReq.mutate({
                  status: draftStatus,
                  owner: draftOwner.trim() || null,
                  targetDate: draftTargetDate || null,
                  evidenceSummary: draftEvidence.trim() || null,
                  notes: draftNotes.trim() || null,
                })
              }
            >
              Save Assessment
            </button>
            <button
              type="button"
              className="pp-button pp-button--sm"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
