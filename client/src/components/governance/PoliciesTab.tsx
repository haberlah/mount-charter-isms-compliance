import type { PolicyRecord, PolicyStatus } from "@shared/schema";
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
            <div className="mw-row">
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
                onClick={() => downloadMarkdown({ ...activePolicy, contentMarkdown: editContent })}
              >
                <Icon name="download" />
                Export Markdown
              </button>
            </div>
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
