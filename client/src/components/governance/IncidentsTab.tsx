import type { IncidentRecord, IncidentStatus, IncidentType, Severity } from "@shared/schema";
import { useState } from "react";
import { ConfirmDialog, formatDateTime, Icon, SeverityBadge } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  RansomwareExtortion: "Ransomware / Cyber Extortion (72h ASD)",
  DataBreachNDB: "Eligible Data Breach (30d OAIC NDB)",
  CyberIncident: "Cyber Security Incident (CPS 234 / SOCI)",
  OperationalDisruption: "Operational Disruption (24h CPS 230)",
  Other: "Other Information Security Event",
};

function formatHoursLeft(hours: number): string {
  if (hours < 0) return `${Math.abs(hours).toFixed(1)}h OVERDUE`;
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d left`;
  return `${hours.toFixed(1)}h left`;
}

export function IncidentsTab({
  incidents,
  onRefresh,
}: {
  incidents: IncidentRecord[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IncidentRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [incidentType, setIncidentType] = useState<IncidentType>("CyberIncident");
  const [severity, setSeverity] = useState<Severity>("High");
  const [detectedAt, setDetectedAt] = useState(new Date().toISOString().slice(0, 16));
  const [ransomPaymentAt, setRansomPaymentAt] = useState("");
  const [affectedSystems, setAffectedSystems] = useState("");
  const [summary, setSummary] = useState("");

  const createIncident = async () => {
    if (!title.trim()) {
      showToast("Incident title is required", { tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/governance/incidents", {
        title: title.trim(),
        incidentType,
        severity,
        detectedAt: new Date(detectedAt).toISOString(),
        ransomPaymentAt: ransomPaymentAt ? new Date(ransomPaymentAt).toISOString() : null,
        affectedSystems: affectedSystems.trim() || null,
        summary: summary.trim() || null,
      });
      setTitle("");
      setAffectedSystems("");
      setSummary("");
      setRansomPaymentAt("");
      setShowForm(false);
      showToast("Incident logged — statutory breach clocks active", { tone: "ok" });
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const markNotified = async (inc: IncidentRecord) => {
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/governance/incidents/${inc.id}`, {
        regulatorNotified: !inc.regulatorNotified,
        regulatorNotifiedAt: !inc.regulatorNotified ? new Date().toISOString() : null,
      });
      showToast(
        !inc.regulatorNotified
          ? `${inc.incidentCode} marked regulator-notified`
          : `${inc.incidentCode} notification flag cleared`,
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

  const updateStatus = async (inc: IncidentRecord, next: IncidentStatus) => {
    setBusy(true);
    try {
      await apiRequest("PATCH", `/api/governance/incidents/${inc.id}`, { status: next });
      await invalidateWorkspaceQueries();
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mw-stack">
      <div className="mw-row mw-row--between mw-row--wrap">
        <div className="mw-muted">
          Automatically calculates live Australian statutory notification deadlines (Cyber Security
          Act 2024 72h, Privacy Act Part IIIC 30d NDB, APRA CPS 234 72h / CPS 230 24h, SOCI 12h).
        </div>
        <button
          type="button"
          className="pp-button pp-button--primary pp-button--sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <Icon name="plus" />
          {showForm ? "Close Form" : "Log Security Incident"}
        </button>
      </div>

      {showForm && (
        <div className="pp-card">
          <div className="pp-card__body mw-stack">
            <div className="mw-form-grid">
              <div className="pp-field">
                <label htmlFor="inc-title">Incident Title *</label>
                <input
                  id="inc-title"
                  className="pp-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Unauthorised S3 export of customer contact list"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="inc-type">Incident Category (drives statutory clocks)</label>
                <select
                  id="inc-type"
                  className="pp-select"
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value as IncidentType)}
                >
                  {Object.entries(INCIDENT_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="inc-sev">Severity</label>
                <select
                  id="inc-sev"
                  className="pp-select"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="inc-det">Detected / Became Aware At</label>
                <input
                  id="inc-det"
                  type="datetime-local"
                  className="pp-input"
                  value={detectedAt}
                  onChange={(e) => setDetectedAt(e.target.value)}
                />
              </div>
              {incidentType === "RansomwareExtortion" && (
                <div className="pp-field">
                  <label htmlFor="inc-ransom">
                    Ransom Payment Made At (optional — starts 72h clock)
                  </label>
                  <input
                    id="inc-ransom"
                    type="datetime-local"
                    className="pp-input"
                    value={ransomPaymentAt}
                    onChange={(e) => setRansomPaymentAt(e.target.value)}
                  />
                </div>
              )}
              <div className="pp-field">
                <label htmlFor="inc-sys">Affected Systems / Data</label>
                <input
                  id="inc-sys"
                  className="pp-input"
                  value={affectedSystems}
                  onChange={(e) => setAffectedSystems(e.target.value)}
                />
              </div>
            </div>
            <div className="pp-field">
              <label htmlFor="inc-sum">Summary &amp; Containment Actions</label>
              <textarea
                id="inc-sum"
                className="pp-textarea"
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <div className="mw-row">
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={busy}
                onClick={createIncident}
              >
                Log Incident
              </button>
              <button
                type="button"
                className="pp-button pp-button--sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="pp-card">
          <div className="pp-state">
            <div className="pp-state__title">No security incidents logged</div>
            <div className="mw-muted">
              Log real incidents or tabletop exercises here to track ISO A.5.24–5.26 response and
              Australian statutory notification clocks.
            </div>
          </div>
        </div>
      ) : (
        <div className="mw-stack">
          {incidents.map((inc) => (
            <div key={inc.id} className="pp-card">
              <div className="pp-card__body mw-stack mw-stack--sm">
                <div className="mw-row mw-row--between mw-row--wrap">
                  <div className="mw-row mw-row--wrap">
                    <span className="pp-badge mw-mono">{inc.incidentCode}</span>
                    <SeverityBadge severity={inc.severity} />
                    <strong>{inc.title}</strong>
                  </div>
                  <div className="mw-row mw-row--wrap">
                    <select
                      className="pp-select pp-select--sm"
                      style={{ width: "auto" }}
                      aria-label={`Status for ${inc.incidentCode}`}
                      value={inc.status}
                      disabled={busy}
                      onChange={(e) => updateStatus(inc, e.target.value as IncidentStatus)}
                    >
                      <option value="Investigating">Investigating</option>
                      <option value="Contained">Contained</option>
                      <option value="Notified">Notified</option>
                      <option value="Closed">Closed</option>
                    </select>
                    <button
                      type="button"
                      className={`pp-button pp-button--sm ${inc.regulatorNotified ? "" : "pp-button--primary"}`}
                      disabled={busy}
                      onClick={() => markNotified(inc)}
                    >
                      {inc.regulatorNotified ? "Regulator Notified ✓" : "Mark Regulator Notified"}
                    </button>
                    <button
                      type="button"
                      className="pp-button pp-button--sm pp-button--ghost"
                      onClick={() => setDeleteTarget(inc)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mw-faint">
                  {INCIDENT_TYPE_LABELS[inc.incidentType]} · Detected{" "}
                  {formatDateTime(inc.detectedAt)}
                  {inc.affectedSystems ? ` · Systems: ${inc.affectedSystems}` : ""}
                </div>
                {inc.summary && <div className="pp-prose">{inc.summary}</div>}

                {inc.statutoryClocks.length > 0 && (
                  <div className="mw-stack mw-stack--sm" style={{ marginTop: 4 }}>
                    <div className="mw-faint" style={{ fontWeight: 600 }}>
                      Australian Statutory Notification Clocks
                    </div>
                    <div className="mw-row mw-row--wrap">
                      {inc.statutoryClocks.map((clk) => (
                        <div
                          key={`${clk.regime}-${clk.label}`}
                          className="mw-check-row"
                          style={{ flex: "1 1 280px" }}
                        >
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{clk.label}</div>
                            <div className="mw-faint">
                              {clk.regime} · Due {formatDateTime(clk.deadlineAt)}
                            </div>
                          </div>
                          <span
                            className={
                              clk.notified
                                ? "pp-status pp-status--ok"
                                : clk.overdue
                                  ? "pp-status pp-status--err"
                                  : clk.hoursRemaining <= 24
                                    ? "pp-status pp-status--warn"
                                    : "pp-badge pp-badge--accent"
                            }
                          >
                            {clk.notified ? "Notified" : formatHoursLeft(clk.hoursRemaining)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Incident"
        message={`Delete ${deleteTarget?.incidentCode} ("${deleteTarget?.title}")?`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await apiRequest("DELETE", `/api/governance/incidents/${deleteTarget.id}`);
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
