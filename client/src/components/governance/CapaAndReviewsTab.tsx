import type {
  CapaFindingType,
  CapaRecord,
  CapaStatus,
  GovernanceReviewRecord,
  GovernanceReviewType,
} from "@shared/schema";
import { useState } from "react";
import { ConfirmDialog, formatShortDate, Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

const FINDING_LABELS: Record<CapaFindingType, string> = {
  MajorNC: "Major NC",
  MinorNC: "Minor NC",
  OFI: "OFI",
  AuditFinding: "Audit Finding",
};

const REVIEW_LABELS: Record<GovernanceReviewType, string> = {
  InternalAudit: "Internal Audit (Clause 9.2)",
  ManagementReview: "Management Review (Clause 9.3)",
};

export function CapaAndReviewsTab({
  capas,
  reviews,
  onRefresh,
}: {
  capas: CapaRecord[];
  reviews: GovernanceReviewRecord[];
  onRefresh: () => void;
}) {
  const [showCapaForm, setShowCapaForm] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [deleteCapa, setDeleteCapa] = useState<CapaRecord | null>(null);
  const [deleteReview, setDeleteReview] = useState<GovernanceReviewRecord | null>(null);
  const [busy, setBusy] = useState(false);

  // CAPA form
  const [cTitle, setCTitle] = useState("");
  const [cType, setCType] = useState<CapaFindingType>("MinorNC");
  const [cSource, setCSource] = useState("Internal Audit");
  const [cControl, setCControl] = useState("");
  const [cRootCause, setCRootCause] = useState("");
  const [cAction, setCAction] = useState("");
  const [cOwner, setCOwner] = useState("");
  const [cDueDate, setCDueDate] = useState("");

  // Review form
  const [rType, setRType] = useState<GovernanceReviewType>("ManagementReview");
  const [rTitle, setRTitle] = useState("");
  const [rDate, setRDate] = useState(new Date().toISOString().slice(0, 10));
  const [rChair, setRChair] = useState("");
  const [rScope, setRScope] = useState("");
  const [rFindings, setRFindings] = useState("");
  const [rDecisions, setRDecisions] = useState("");
  const [rNextDate, setRNextDate] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const createCapa = async () => {
    if (!cTitle.trim()) {
      showToast("CAPA title is required", { tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/governance/capas", {
        title: cTitle.trim(),
        findingType: cType,
        source: cSource.trim() || null,
        controlNumber: cControl.trim() || null,
        rootCause: cRootCause.trim() || null,
        correctiveAction: cAction.trim() || null,
        owner: cOwner.trim() || null,
        dueDate: cDueDate || null,
      });
      setCTitle("");
      setCControl("");
      setCRootCause("");
      setCAction("");
      setCOwner("");
      setCDueDate("");
      setShowCapaForm(false);
      showToast("CAPA / Nonconformity logged", { tone: "ok" });
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const updateCapaStatus = async (c: CapaRecord, next: CapaStatus) => {
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/governance/capas/${c.id}`, { status: next });
      showToast(`${c.capaCode} marked ${next}`, { tone: "ok" });
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const createReview = async () => {
    if (!rTitle.trim() || !rDate) {
      showToast("Title and date are required", { tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/governance/reviews", {
        reviewType: rType,
        title: rTitle.trim(),
        reviewDate: rDate,
        leadOrChair: rChair.trim() || null,
        scope: rScope.trim() || null,
        findingsSummary: rFindings.trim() || null,
        decisionsAndActions: rDecisions.trim() || null,
        nextReviewDate: rNextDate || null,
        status: "Completed",
      });
      setRTitle("");
      setRChair("");
      setRScope("");
      setRFindings("");
      setRDecisions("");
      setRNextDate("");
      setShowReviewForm(false);
      showToast("Governance review recorded", { tone: "ok" });
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mw-stack mw-stack--lg">
      {/* CAPA / Nonconformities */}
      <div className="mw-stack">
        <div className="mw-row mw-row--between mw-row--wrap">
          <div>
            <div className="pp-title">
              Corrective Actions &amp; Nonconformities (ISO Clause 10.2)
            </div>
            <div className="mw-muted">
              Track Major/Minor NCs, OFIs, root cause analysis, and verified closure.
            </div>
          </div>
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            onClick={() => setShowCapaForm((v) => !v)}
          >
            <Icon name="plus" />
            {showCapaForm ? "Close Form" : "Log Finding / CAPA"}
          </button>
        </div>

        {showCapaForm && (
          <div className="pp-card">
            <div className="pp-card__body mw-stack">
              <div className="mw-form-grid">
                <div className="pp-field">
                  <label htmlFor="capa-title">Finding Title *</label>
                  <input
                    id="capa-title"
                    className="pp-input"
                    value={cTitle}
                    onChange={(e) => setCTitle(e.target.value)}
                    placeholder="e.g. Privileged access review overdue for production AWS"
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="capa-type">Classification</label>
                  <select
                    id="capa-type"
                    className="pp-select"
                    value={cType}
                    onChange={(e) => setCType(e.target.value as CapaFindingType)}
                  >
                    <option value="MajorNC">Major Nonconformity</option>
                    <option value="MinorNC">Minor Nonconformity</option>
                    <option value="OFI">Opportunity for Improvement (OFI)</option>
                    <option value="AuditFinding">Audit Finding</option>
                  </select>
                </div>
                <div className="pp-field">
                  <label htmlFor="capa-source">Source</label>
                  <input
                    id="capa-source"
                    className="pp-input"
                    value={cSource}
                    onChange={(e) => setCSource(e.target.value)}
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="capa-ctrl">Control / Clause (optional)</label>
                  <input
                    id="capa-ctrl"
                    className="pp-input mw-mono"
                    value={cControl}
                    onChange={(e) => setCControl(e.target.value)}
                    placeholder="e.g. 5.18 or RQ9"
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="capa-owner">Owner</label>
                  <input
                    id="capa-owner"
                    className="pp-input"
                    value={cOwner}
                    onChange={(e) => setCOwner(e.target.value)}
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="capa-due">Due Date</label>
                  <input
                    id="capa-due"
                    type="date"
                    className="pp-input"
                    value={cDueDate}
                    onChange={(e) => setCDueDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="mw-form-grid">
                <div className="pp-field">
                  <label htmlFor="capa-root">Root Cause Analysis</label>
                  <textarea
                    id="capa-root"
                    className="pp-textarea"
                    rows={2}
                    value={cRootCause}
                    onChange={(e) => setCRootCause(e.target.value)}
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="capa-act">Corrective Action Plan</label>
                  <textarea
                    id="capa-act"
                    className="pp-textarea"
                    rows={2}
                    value={cAction}
                    onChange={(e) => setCAction(e.target.value)}
                  />
                </div>
              </div>
              <div className="mw-row">
                <button
                  type="button"
                  className="pp-button pp-button--primary pp-button--sm"
                  disabled={busy}
                  onClick={createCapa}
                >
                  Save CAPA
                </button>
                <button
                  type="button"
                  className="pp-button pp-button--sm"
                  onClick={() => setShowCapaForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {capas.length === 0 ? (
          <div className="pp-card">
            <div className="pp-card__body mw-muted">
              No nonconformities or corrective actions logged yet.
            </div>
          </div>
        ) : (
          <div className="pp-card">
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Finding &amp; Action</th>
                    <th>Type</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {capas.map((c) => {
                    const overdue =
                      c.status !== "VerifiedClosed" && Boolean(c.dueDate && c.dueDate < today);
                    return (
                      <tr key={c.id}>
                        <td className="mw-mono mw-nowrap">{c.capaCode}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>
                            {c.title}{" "}
                            {c.controlNumber && (
                              <span className="pp-badge mw-mono">{c.controlNumber}</span>
                            )}
                          </div>
                          {c.rootCause && <div className="mw-faint">Root cause: {c.rootCause}</div>}
                          {c.correctiveAction && (
                            <div className="mw-muted">Action: {c.correctiveAction}</div>
                          )}
                        </td>
                        <td className="mw-nowrap">
                          <span
                            className={
                              c.findingType === "MajorNC"
                                ? "pp-status pp-status--err"
                                : c.findingType === "MinorNC"
                                  ? "pp-status pp-status--warn"
                                  : "pp-badge"
                            }
                          >
                            {FINDING_LABELS[c.findingType]}
                          </span>
                        </td>
                        <td className="mw-nowrap">
                          <span className={overdue ? "pp-status pp-status--err" : ""}>
                            {formatShortDate(c.dueDate)}
                          </span>
                          {c.owner && <div className="mw-faint">{c.owner}</div>}
                        </td>
                        <td className="mw-nowrap">
                          <span
                            className={`mw-cell-select ${
                              c.status === "VerifiedClosed"
                                ? "mw-cell-select--ok"
                                : c.status === "InProgress"
                                  ? "mw-cell-select--accent"
                                  : "mw-cell-select--muted"
                            }`}
                          >
                            <select
                              className="pp-select pp-select--sm pp-select--ghost"
                              aria-label={`Status for ${c.capaCode}`}
                              value={c.status}
                              disabled={busy}
                              onChange={(e) => updateCapaStatus(c, e.target.value as CapaStatus)}
                            >
                              <option value="Open">Open</option>
                              <option value="InProgress">In Progress</option>
                              <option value="VerifiedClosed">Verified Closed</option>
                            </select>
                          </span>
                        </td>
                        <td className="mw-nowrap">
                          <button
                            type="button"
                            className="pp-button pp-button--sm pp-button--ghost"
                            onClick={() => setDeleteCapa(c)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Internal Audits & Management Reviews */}
      <div className="mw-stack">
        <div className="mw-row mw-row--between mw-row--wrap">
          <div>
            <div className="pp-title">
              Internal Audits &amp; Management Reviews (Clauses 9.2 &amp; 9.3)
            </div>
            <div className="mw-muted">
              Mandatory pre-certification records of internal ISMS audits and executive management
              review minutes.
            </div>
          </div>
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() => setShowReviewForm((v) => !v)}
          >
            <Icon name="plus" />
            {showReviewForm ? "Close Form" : "Record Audit / Review"}
          </button>
        </div>

        {showReviewForm && (
          <div className="pp-card">
            <div className="pp-card__body mw-stack">
              <div className="mw-form-grid">
                <div className="pp-field">
                  <label htmlFor="rev-type">Review Type</label>
                  <select
                    id="rev-type"
                    className="pp-select"
                    value={rType}
                    onChange={(e) => setRType(e.target.value as GovernanceReviewType)}
                  >
                    <option value="InternalAudit">Internal Audit (Clause 9.2)</option>
                    <option value="ManagementReview">Management Review (Clause 9.3)</option>
                  </select>
                </div>
                <div className="pp-field">
                  <label htmlFor="rev-title">Title *</label>
                  <input
                    id="rev-title"
                    className="pp-input"
                    value={rTitle}
                    onChange={(e) => setRTitle(e.target.value)}
                    placeholder="e.g. FY26 Q4 Management Review"
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="rev-date">Date *</label>
                  <input
                    id="rev-date"
                    type="date"
                    className="pp-input"
                    value={rDate}
                    onChange={(e) => setRDate(e.target.value)}
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="rev-chair">Lead Auditor / Chair</label>
                  <input
                    id="rev-chair"
                    className="pp-input"
                    value={rChair}
                    onChange={(e) => setRChair(e.target.value)}
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="rev-scope">Scope</label>
                  <input
                    id="rev-scope"
                    className="pp-input"
                    value={rScope}
                    onChange={(e) => setRScope(e.target.value)}
                    placeholder="e.g. Full ISO 27001:2022 + Essential Eight ML2"
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="rev-next">Next Review Date</label>
                  <input
                    id="rev-next"
                    type="date"
                    className="pp-input"
                    value={rNextDate}
                    onChange={(e) => setRNextDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="mw-form-grid">
                <div className="pp-field">
                  <label htmlFor="rev-find">Key Findings / Inputs Reviewed</label>
                  <textarea
                    id="rev-find"
                    className="pp-textarea"
                    rows={2}
                    value={rFindings}
                    onChange={(e) => setRFindings(e.target.value)}
                  />
                </div>
                <div className="pp-field">
                  <label htmlFor="rev-dec">Decisions &amp; Resource Actions</label>
                  <textarea
                    id="rev-dec"
                    className="pp-textarea"
                    rows={2}
                    value={rDecisions}
                    onChange={(e) => setRDecisions(e.target.value)}
                  />
                </div>
              </div>
              <div className="mw-row">
                <button
                  type="button"
                  className="pp-button pp-button--primary pp-button--sm"
                  disabled={busy}
                  onClick={createReview}
                >
                  Save Record
                </button>
                <button
                  type="button"
                  className="pp-button pp-button--sm"
                  onClick={() => setShowReviewForm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {reviews.length === 0 ? (
          <div className="pp-card">
            <div className="pp-card__body mw-muted">
              No internal audits or management reviews recorded yet.
            </div>
          </div>
        ) : (
          <div className="mw-stack">
            {reviews.map((rev) => (
              <div key={rev.id} className="pp-card">
                <div className="pp-card__body mw-stack mw-stack--sm">
                  <div className="mw-row mw-row--between mw-row--wrap">
                    <div className="mw-row mw-row--wrap">
                      <span className="pp-badge pp-badge--accent">
                        {REVIEW_LABELS[rev.reviewType]}
                      </span>
                      <strong>{rev.title}</strong>
                    </div>
                    <div className="mw-row">
                      <span className="mw-faint">
                        {formatShortDate(rev.reviewDate)}
                        {rev.leadOrChair ? ` · ${rev.leadOrChair}` : ""}
                      </span>
                      <button
                        type="button"
                        className="pp-button pp-button--sm pp-button--ghost"
                        onClick={() => setDeleteReview(rev)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {rev.scope && <div className="mw-muted">Scope: {rev.scope}</div>}
                  {rev.findingsSummary && (
                    <div className="pp-prose">
                      <strong>Findings:</strong> {rev.findingsSummary}
                    </div>
                  )}
                  {rev.decisionsAndActions && (
                    <div className="pp-prose">
                      <strong>Decisions:</strong> {rev.decisionsAndActions}
                    </div>
                  )}
                  {rev.nextReviewDate && (
                    <div className="mw-faint">
                      Next scheduled review: {formatShortDate(rev.nextReviewDate)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteCapa)}
        title="Delete CAPA"
        message={`Delete ${deleteCapa?.capaCode} ("${deleteCapa?.title}")?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!deleteCapa) return;
          setBusy(true);
          try {
            await apiRequest("DELETE", `/api/governance/capas/${deleteCapa.id}`);
            setDeleteCapa(null);
            await invalidateWorkspaceQueries();
            onRefresh();
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setDeleteCapa(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteReview)}
        title="Delete Review Record"
        message={`Delete "${deleteReview?.title}"?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!deleteReview) return;
          setBusy(true);
          try {
            await apiRequest("DELETE", `/api/governance/reviews/${deleteReview.id}`);
            setDeleteReview(null);
            await invalidateWorkspaceQueries();
            onRefresh();
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setDeleteReview(null)}
      />
    </div>
  );
}
