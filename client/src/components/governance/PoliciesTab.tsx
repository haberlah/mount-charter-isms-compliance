import type { PolicyRecord, PolicyRedlineResult, PolicyStatus } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog, formatShortDate, Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface PolicyTemplateMeta {
  id: string;
  title: string;
  version: string;
  linkedControls: string[];
  summary: string;
}

export function PoliciesTab({
  policies,
  onRefresh,
}: {
  policies: PolicyRecord[];
  onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editStatus, setEditStatus] = useState<PolicyStatus>("Draft");
  const [editApprover, setEditApprover] = useState("");
  const [editVersion, setEditVersion] = useState("1.0");
  const [deleteTarget, setDeleteTarget] = useState<PolicyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [redlining, setRedlining] = useState(false);
  const [redline, setRedline] = useState<PolicyRedlineResult | null>(null);

  const { data: templates = [] } = useQuery<PolicyTemplateMeta[]>({
    queryKey: ["policy-templates"],
    queryFn: () => apiRequest<PolicyTemplateMeta[]>("GET", "/api/governance/policy-templates"),
  });

  const activePolicy = policies.find((p) => p.id === selectedId) || null;

  const openPolicy = (p: PolicyRecord) => {
    setSelectedId(p.id);
    setEditContent(p.contentMarkdown);
    setEditStatus(p.status);
    setEditApprover(p.approver || "");
    setEditVersion(p.version);
    setRedline(null);
  };

  const runPolicyRedline = async () => {
    if (!activePolicy) return;
    setRedlining(true);
    try {
      const res = await apiRequest<PolicyRedlineResult>(
        "POST",
        `/api/agent/policies/${activePolicy.id}/redline`,
      );
      setRedline(res);
      showToast(`Redline ready: ${res.overPromises.length} over-promised SLA(s) flagged`, {
        tone: "ok",
      });
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setRedlining(false);
    }
  };

  const generateFromTemplate = async (tplId: string) => {
    setBusy(true);
    try {
      const created = await apiRequest<PolicyRecord>(
        "POST",
        `/api/governance/policies/from-template/${encodeURIComponent(tplId)}`,
      );
      showToast(`Generated ${created.policyCode}: ${created.title}`, { tone: "ok" });
      await invalidateWorkspaceQueries();
      onRefresh();
      openPolicy(created);
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    if (!activePolicy) return;
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/governance/policies/${activePolicy.id}`, {
        version: editVersion,
        status: editStatus,
        approver: editApprover.trim() || null,
        approvedAt:
          editStatus === "Approved"
            ? activePolicy.approvedAt || new Date().toISOString().slice(0, 10)
            : activePolicy.approvedAt,
        contentMarkdown: editContent,
      });
      showToast(`Saved ${activePolicy.policyCode}`, { tone: "ok" });
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const downloadMarkdown = (p: PolicyRecord) => {
    const blob = new Blob([p.contentMarkdown || `# ${p.title}\n`], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.policyCode}-${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mw-stack mw-stack--lg">
      {/* 1-Click AU Starter Policy Templates */}
      <div className="pp-card">
        <div className="pp-card__header">
          <div>
            <div className="pp-title">
              Australian ISMS Starter Policy Templates (ISO Clause 7.5 &amp; A.5.1)
            </div>
            <div className="mw-muted">
              Pre-filled with your organisation name, regulatory scope, and linked ISO 27001
              controls. Included automatically in your Auditor Evidence Bundle ZIP.
            </div>
          </div>
        </div>
        <div className="pp-card__body">
          <div className="mw-export-grid">
            {templates.map((t) => (
              <div key={t.id} className="mw-question-card">
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                <div className="mw-muted" style={{ flex: 1 }}>
                  {t.summary}
                </div>
                <div className="mw-chip-group">
                  {t.linkedControls.map((cn) => (
                    <span key={cn} className="pp-badge mw-mono">
                      {cn}
                    </span>
                  ))}
                </div>
                <div>
                  <button
                    type="button"
                    className="pp-button pp-button--sm"
                    disabled={busy}
                    onClick={() => generateFromTemplate(t.id)}
                  >
                    <Icon name="plus" />
                    Generate Draft
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Policy Register Table */}
      {policies.length > 0 && (
        <div className="pp-card">
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Policy</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Next Review</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td className="mw-mono mw-nowrap">{p.policyCode}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.title}</div>
                      <div className="mw-faint">
                        {p.linkedControls.length > 0
                          ? `Controls: ${p.linkedControls.join(", ")}`
                          : "General ISMS Policy"}
                      </div>
                    </td>
                    <td className="mw-mono">v{p.version}</td>
                    <td className="mw-nowrap">
                      <span
                        className={
                          p.status === "Approved"
                            ? "pp-status pp-status--ok"
                            : p.status === "ReviewDue"
                              ? "pp-status pp-status--warn"
                              : "pp-badge"
                        }
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="mw-nowrap">{formatShortDate(p.nextReviewDate)}</td>
                    <td className="mw-nowrap">
                      <div className="mw-row">
                        <button
                          type="button"
                          className="pp-button pp-button--sm"
                          onClick={() => openPolicy(p)}
                        >
                          {selectedId === p.id ? "Editing" : "Open Editor"}
                        </button>
                        <button
                          type="button"
                          className="pp-button pp-button--sm pp-button--ghost"
                          onClick={() => downloadMarkdown(p)}
                        >
                          .md
                        </button>
                        <button
                          type="button"
                          className="pp-button pp-button--sm pp-button--ghost"
                          onClick={() => setDeleteTarget(p)}
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

      {/* Markdown Policy Editor */}
      {activePolicy && (
        <div className="pp-card">
          <div className="pp-card__header">
            <div className="mw-row mw-row--between mw-row--wrap" style={{ width: "100%" }}>
              <div>
                <div className="pp-title">
                  {activePolicy.policyCode} — {activePolicy.title}
                </div>
                <div className="mw-faint">Edit policy Markdown and record management approval.</div>
              </div>
              <button
                type="button"
                className="pp-button pp-button--sm pp-button--ghost"
                onClick={() => setSelectedId(null)}
              >
                Close Editor
              </button>
            </div>
          </div>
          <div className="pp-card__body mw-stack">
            <div className="mw-form-grid">
              <div className="pp-field">
                <label htmlFor="pol-ver">Version</label>
                <input
                  id="pol-ver"
                  className="pp-input mw-mono"
                  value={editVersion}
                  onChange={(e) => setEditVersion(e.target.value)}
                />
              </div>
              <div className="pp-field">
                <label htmlFor="pol-status">Approval Status</label>
                <select
                  id="pol-status"
                  className="pp-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as PolicyStatus)}
                >
                  <option value="Draft">Draft</option>
                  <option value="Approved">Approved</option>
                  <option value="ReviewDue">Review Due</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="pol-approver">Approver (e.g. CEO / Board / CISO)</label>
                <input
                  id="pol-approver"
                  className="pp-input"
                  value={editApprover}
                  onChange={(e) => setEditApprover(e.target.value)}
                />
              </div>
            </div>
            <div className="pp-field">
              <label htmlFor="pol-md">Policy Markdown Content</label>
              <textarea
                id="pol-md"
                className="pp-textarea mw-mono"
                rows={14}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            </div>
            <div className="mw-row mw-row--wrap">
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={busy}
                onClick={savePolicy}
              >
                {busy ? "Saving…" : "Save Policy"}
              </button>
              <button
                type="button"
                className="pp-button pp-button--sm"
                disabled={redlining}
                onClick={() => void runPolicyRedline()}
                title="Compare this policy against your real ISO controls, Essential Eight maturity, and vendors to flag over-promised SLAs"
              >
                {redlining ? "Redlining…" : "Redline Against Reality (AI)"}
              </button>
              <button
                type="button"
                className="pp-button pp-button--sm"
                onClick={() => downloadMarkdown({ ...activePolicy, contentMarkdown: editContent })}
              >
                <Icon name="download" />
                Export Markdown
              </button>
            </div>

            {redline && redline.policyId === activePolicy.id && (
              <div className="mw-proposal-card">
                <div className="mw-row mw-row--between mw-row--wrap">
                  <div className="mw-row">
                    <span className="pp-badge pp-badge--accent">AI Proposal · Uncommitted</span>
                    <strong>Living Policy Redline</strong>
                  </div>
                  <span className="mw-faint mw-mono">
                    {redline.modelUsed}
                    {redline.costUsd > 0 ? ` · $${redline.costUsd.toFixed(4)}` : ""}
                  </span>
                </div>
                <div className="pp-prose">{redline.summary}</div>
                {redline.overPromises.length > 0 && (
                  <div className="mw-stack mw-stack--sm">
                    <strong style={{ fontSize: 13 }}>
                      Over-Promised SLAs / Stage 2 Audit Traps ({redline.overPromises.length})
                    </strong>
                    {redline.overPromises.map((o, idx) => (
                      <div key={`${o.clause}-${idx}`} className="mw-check-row">
                        <div className="mw-stack" style={{ gap: 2 }}>
                          <div className="mw-row">
                            <span
                              className={
                                o.riskLevel === "High"
                                  ? "pp-status pp-status--err"
                                  : o.riskLevel === "Medium"
                                    ? "pp-status pp-status--warn"
                                    : "pp-badge"
                              }
                            >
                              {o.riskLevel} Risk
                            </span>
                            <strong>{o.clause}</strong>
                          </div>
                          <div className="mw-faint">
                            <strong>Policy claims:</strong> {o.policyClaim}
                          </div>
                          <div className="mw-muted">
                            <strong>Workspace reality:</strong> {o.operationalReality}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mw-row mw-row--wrap">
                  <button
                    type="button"
                    className="pp-button pp-button--primary pp-button--sm"
                    onClick={() => {
                      setEditContent(redline.redlinedMarkdown);
                      setEditStatus("Draft");
                      setRedline(null);
                      showToast(
                        "Applied redline to editor as Draft — review and click Save Policy.",
                        { tone: "info" },
                      );
                    }}
                  >
                    Apply Redline to Editor (as Draft)
                  </button>
                  <button
                    type="button"
                    className="pp-button pp-button--ghost pp-button--sm"
                    onClick={() => setRedline(null)}
                  >
                    Dismiss Redline
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Policy"
        message={`Delete ${deleteTarget?.policyCode} ("${deleteTarget?.title}")?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await apiRequest("DELETE", `/api/governance/policies/${deleteTarget.id}`);
            if (selectedId === deleteTarget.id) setSelectedId(null);
            setDeleteTarget(null);
            await invalidateWorkspaceQueries();
            onRefresh();
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
