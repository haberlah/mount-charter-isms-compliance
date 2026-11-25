import type { RiskRecord, RiskStatus, RiskTreatment } from "@shared/schema";
import { useState } from "react";
import { Link } from "wouter";
import { ConfirmDialog, formatShortDate, Icon } from "@/components/PaperUi";
import { apiRequest, downloadFile, invalidateWorkspaceQueries, showToast } from "@/lib/api";

function riskTone(score: number): string {
  if (score >= 15) return "pp-status pp-status--err";
  if (score >= 10) return "pp-status pp-status--warn";
  if (score >= 5) return "pp-badge pp-badge--accent";
  return "pp-status pp-status--ok";
}

export function RisksTab({ risks, onRefresh }: { risks: RiskRecord[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RiskRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RiskRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [assetOrProcess, setAssetOrProcess] = useState("");
  const [threat, setThreat] = useState("");
  const [likelihood, setLikelihood] = useState(3);
  const [impact, setImpact] = useState(4);
  const [treatment, setTreatment] = useState<RiskTreatment>("Mitigate");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [residualLikelihood, setResidualLikelihood] = useState(2);
  const [residualImpact, setResidualImpact] = useState(3);
  const [owner, setOwner] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [status, setStatus] = useState<RiskStatus>("Open");
  const [linkedControls, setLinkedControls] = useState("");

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setAssetOrProcess("");
    setThreat("");
    setLikelihood(3);
    setImpact(4);
    setTreatment("Mitigate");
    setTreatmentPlan("");
    setResidualLikelihood(2);
    setResidualImpact(3);
    setOwner("");
    setReviewDate("");
    setStatus("Open");
    setLinkedControls("");
  };

  const openEdit = (r: RiskRecord) => {
    setEditing(r);
    setTitle(r.title);
    setAssetOrProcess(r.assetOrProcess || "");
    setThreat(r.threat || "");
    setLikelihood(r.likelihood);
    setImpact(r.impact);
    setTreatment(r.treatment);
    setTreatmentPlan(r.treatmentPlan || "");
    setResidualLikelihood(r.residualLikelihood);
    setResidualImpact(r.residualImpact);
    setOwner(r.owner || "");
    setReviewDate(r.reviewDate || "");
    setStatus(r.status);
    setLinkedControls(r.linkedControls.join(", "));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showToast("Risk title is required", { tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        assetOrProcess: assetOrProcess.trim() || null,
        threat: threat.trim() || null,
        likelihood,
        impact,
        treatment,
        treatmentPlan: treatmentPlan.trim() || null,
        residualLikelihood,
        residualImpact,
        owner: owner.trim() || null,
        reviewDate: reviewDate || null,
        status,
        linkedControls: linkedControls
          .split(/[,\s;]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (editing) {
        await apiRequest("PATCH", `/api/governance/risks/${editing.id}`, payload);
        showToast(`Updated ${editing.riskCode}`, { tone: "ok" });
      } else {
        await apiRequest("POST", "/api/governance/risks", payload);
        showToast("Risk added to register", { tone: "ok" });
      }
      resetForm();
      setShowForm(false);
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const handleSeed = async () => {
    setBusy(true);
    try {
      const res = await apiRequest<{ createdCount: number }>(
        "POST",
        "/api/governance/risks/seed-starter",
      );
      showToast(
        res.createdCount > 0
          ? `Added ${res.createdCount} Australian SMB starter risks`
          : "All starter risks are already in your register",
        { tone: "ok" },
      );
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await apiRequest("DELETE", `/api/governance/risks/${deleteTarget.id}`);
      showToast(`Deleted ${deleteTarget.riskCode}`, { tone: "ok" });
      setDeleteTarget(null);
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const highOpen = risks.filter((r) => r.status !== "Closed" && r.residualScore >= 12).length;
  const inTreatment = risks.filter((r) => r.status === "InTreatment").length;
  const linkedTotal = new Set(risks.flatMap((r) => r.linkedControls)).size;

  return (
    <div className="mw-stack">
      <div className="mw-kpi-grid">
        <div className="pp-card">
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-faint">Total Risks</div>
            <div className="pp-title" style={{ fontSize: 22 }}>
              {risks.length}
            </div>
            <div className="mw-muted">ISO Clauses 6.1.2 &amp; 8.2</div>
          </div>
        </div>
        <div className="pp-card">
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-faint">High Residual (≥ 12)</div>
            <div className="pp-title" style={{ fontSize: 22 }}>
              {highOpen}
            </div>
            <div className="mw-muted">Open risks above appetite</div>
          </div>
        </div>
        <div className="pp-card">
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-faint">In Treatment</div>
            <div className="pp-title" style={{ fontSize: 22 }}>
              {inTreatment}
            </div>
            <div className="mw-muted">Active Risk Treatment Plans</div>
          </div>
        </div>
        <div className="pp-card">
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-faint">ISO Controls Linked</div>
            <div className="pp-title" style={{ fontSize: 22 }}>
              {linkedTotal}
            </div>
            <div className="mw-muted">Traced onto Statement of Applicability</div>
          </div>
        </div>
      </div>

      <div className="mw-row mw-row--between mw-row--wrap">
        <div className="mw-muted">
          Linked ISO 27001 controls automatically populate the Statement of Applicability (Clause
          6.1.3(d)).
        </div>
        <div className="mw-row mw-row--wrap">
          <button
            type="button"
            className="pp-button pp-button--sm"
            disabled={busy}
            onClick={handleSeed}
          >
            Seed 8 AU Starter Risks
          </button>
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              downloadFile("/api/exports/risks.csv", "mount-charter-risk-register.csv")
            }
          >
            <Icon name="download" />
            Export CSV
          </button>
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
            }}
          >
            <Icon name="plus" />
            {showForm && !editing ? "Close Form" : "Add Risk"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="pp-card">
          <div className="pp-card__header">
            <div className="pp-title">
              {editing ? `Edit ${editing.riskCode}` : "New Information Security Risk"}
            </div>
          </div>
          <div className="pp-card__body mw-stack">
            <div className="mw-form-grid">
              <div className="pp-field">
                <label htmlFor="rsk-title">Risk Title *</label>
                <input
                  id="rsk-title"
                  className="pp-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Ransomware encryption of cloud backups"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-asset">Asset or Business Process</label>
                <input
                  id="rsk-asset"
                  className="pp-input"
                  value={assetOrProcess}
                  onChange={(e) => setAssetOrProcess(e.target.value)}
                  placeholder="e.g. Production database & M365 tenant"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-threat">Threat / Vulnerability</label>
                <input
                  id="rsk-threat"
                  className="pp-input"
                  value={threat}
                  onChange={(e) => setThreat(e.target.value)}
                  placeholder="e.g. Phished admin credentials without phishing-resistant MFA"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-controls">Linked ISO 27001 Controls (comma-separated)</label>
                <input
                  id="rsk-controls"
                  className="pp-input mw-mono"
                  value={linkedControls}
                  onChange={(e) => setLinkedControls(e.target.value)}
                  placeholder="e.g. 5.17, 8.5, 8.13"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-inh">
                  Inherent Likelihood × Impact (Score: {likelihood * impact})
                </label>
                <div className="mw-row">
                  <select
                    id="rsk-inh"
                    className="pp-select"
                    value={likelihood}
                    onChange={(e) => setLikelihood(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        L = {n}
                      </option>
                    ))}
                  </select>
                  <select
                    className="pp-select"
                    aria-label="Inherent Impact"
                    value={impact}
                    onChange={(e) => setImpact(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        I = {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-res">
                  Residual Likelihood × Impact (Score: {residualLikelihood * residualImpact})
                </label>
                <div className="mw-row">
                  <select
                    id="rsk-res"
                    className="pp-select"
                    value={residualLikelihood}
                    onChange={(e) => setResidualLikelihood(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        L = {n}
                      </option>
                    ))}
                  </select>
                  <select
                    className="pp-select"
                    aria-label="Residual Impact"
                    value={residualImpact}
                    onChange={(e) => setResidualImpact(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        I = {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-treatment">Treatment Decision</label>
                <select
                  id="rsk-treatment"
                  className="pp-select"
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value as RiskTreatment)}
                >
                  <option value="Mitigate">Mitigate (Apply Controls)</option>
                  <option value="Transfer">Transfer (Insurance / Contract)</option>
                  <option value="Accept">Accept (Documented Risk Acceptance)</option>
                  <option value="Avoid">Avoid (Discontinue Activity)</option>
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-status">Status</label>
                <select
                  id="rsk-status"
                  className="pp-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RiskStatus)}
                >
                  <option value="Open">Open</option>
                  <option value="InTreatment">In Treatment</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-owner">Risk Owner</label>
                <input
                  id="rsk-owner"
                  className="pp-input"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="e.g. Head of Engineering"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="rsk-review">Next Review Date</label>
                <input
                  id="rsk-review"
                  type="date"
                  className="pp-input"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                />
              </div>
            </div>
            <div className="pp-field">
              <label htmlFor="rsk-plan">Risk Treatment Plan</label>
              <textarea
                id="rsk-plan"
                className="pp-textarea"
                rows={2}
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                placeholder="Describe control actions, target dates, and acceptance criteria..."
              />
            </div>
            <div className="mw-row">
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={busy}
                onClick={handleSave}
              >
                {busy ? "Saving…" : editing ? "Save Risk" : "Create Risk"}
              </button>
              <button
                type="button"
                className="pp-button pp-button--sm"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {risks.length === 0 ? (
        <div className="pp-card">
          <div className="pp-state">
            <div className="pp-state__title">No risks registered yet</div>
            <div className="mw-muted">
              Seed 8 realistic Australian cloud/SMB risks or add your own to link risk treatment
              directly to ISO 27001 Annex A controls.
            </div>
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              disabled={busy}
              onClick={handleSeed}
            >
              Seed 8 AU Starter Risks
            </button>
          </div>
        </div>
      ) : (
        <div className="pp-card">
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Risk &amp; Treatment</th>
                  <th>Inherent → Residual</th>
                  <th>Linked Controls</th>
                  <th>Owner / Review</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id}>
                    <td className="mw-mono mw-nowrap">{r.riskCode}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.title}</div>
                      {r.assetOrProcess && <div className="mw-faint">{r.assetOrProcess}</div>}
                      {r.treatmentPlan && (
                        <div className="mw-muted" style={{ marginTop: 2 }}>
                          {r.treatment}: {r.treatmentPlan}
                        </div>
                      )}
                    </td>
                    <td className="mw-nowrap">
                      <span className={riskTone(r.inherentScore)}>{r.inherentScore}</span>
                      {" → "}
                      <span className={riskTone(r.residualScore)}>{r.residualScore}</span>
                    </td>
                    <td>
                      <div className="mw-chip-group">
                        {r.linkedControls.length === 0 ? (
                          <span className="mw-faint">—</span>
                        ) : (
                          r.linkedControls.map((cn) => (
                            <Link
                              key={cn}
                              href={`/controls/${encodeURIComponent(cn)}`}
                              className="pp-badge mw-mono"
                              style={{ textDecoration: "none" }}
                            >
                              {cn}
                            </Link>
                          ))
                        )}
                      </div>
                    </td>
                    <td>
                      <div>{r.owner || "Unassigned"}</div>
                      <div className="mw-faint">{formatShortDate(r.reviewDate)}</div>
                    </td>
                    <td className="mw-nowrap">
                      <span
                        className={
                          r.status === "Closed"
                            ? "pp-status pp-status--ok"
                            : r.status === "InTreatment"
                              ? "pp-badge pp-badge--accent"
                              : "pp-status pp-status--warn"
                        }
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="mw-nowrap">
                      <div className="mw-row">
                        <button
                          type="button"
                          className="pp-button pp-button--sm pp-button--ghost"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="pp-button pp-button--sm pp-button--ghost"
                          onClick={() => setDeleteTarget(r)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Risk"
        message={`Delete ${deleteTarget?.riskCode} ("${deleteTarget?.title}") from the Risk Register?`}
        confirmLabel="Delete Risk"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
