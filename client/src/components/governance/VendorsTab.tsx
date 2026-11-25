import type { ExitPlanStatus, VendorCriticality, VendorRecord } from "@shared/schema";
import { useState } from "react";
import { ConfirmDialog, formatShortDate, Icon } from "@/components/PaperUi";
import { apiRequest, downloadFile, invalidateWorkspaceQueries, showToast } from "@/lib/api";

export function VendorsTab({
  vendors,
  onRefresh,
}: {
  vendors: VendorRecord[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<VendorRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [isMsp, setIsMsp] = useState(false);
  const [criticality, setCriticality] = useState<VendorCriticality>("Medium");
  const [dataResidency, setDataResidency] = useState("Australia (Sydney)");
  const [dataTypesShared, setDataTypesShared] = useState("");
  const [exitPlanStatus, setExitPlanStatus] = useState<ExitPlanStatus>("Missing");
  const [owner, setOwner] = useState("");
  const [contractExpiryDate, setContractExpiryDate] = useState("");

  const reset = () => {
    setEditing(null);
    setName("");
    setServiceDescription("");
    setIsMsp(false);
    setCriticality("Medium");
    setDataResidency("Australia (Sydney)");
    setDataTypesShared("");
    setExitPlanStatus("Missing");
    setOwner("");
    setContractExpiryDate("");
  };

  const openEdit = (v: VendorRecord) => {
    setEditing(v);
    setName(v.name);
    setServiceDescription(v.serviceDescription || "");
    setIsMsp(v.isMaterialServiceProvider);
    setCriticality(v.criticality);
    setDataResidency(v.dataResidency || "");
    setDataTypesShared(v.dataTypesShared || "");
    setExitPlanStatus(v.exitPlanStatus);
    setOwner(v.owner || "");
    setContractExpiryDate(v.contractExpiryDate || "");
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) {
      showToast("Vendor name is required", { tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        serviceDescription: serviceDescription.trim() || null,
        isMaterialServiceProvider: isMsp,
        criticality,
        riskRating: criticality,
        dataResidency: dataResidency.trim() || null,
        dataTypesShared: dataTypesShared.trim() || null,
        exitPlanStatus,
        owner: owner.trim() || null,
        contractExpiryDate: contractExpiryDate || null,
      };
      if (editing) {
        await apiRequest("PATCH", `/api/governance/vendors/${editing.id}`, payload);
        showToast(`Updated ${name}`, { tone: "ok" });
      } else {
        await apiRequest("POST", "/api/governance/vendors", payload);
        showToast(`Added ${name} to register`, { tone: "ok" });
      }
      reset();
      setShowForm(false);
      await invalidateWorkspaceQueries();
      onRefresh();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setBusy(false);
    }
  };

  const mspCount = vendors.filter((v) => v.isMaterialServiceProvider).length;
  const missingExit = vendors.filter(
    (v) => v.isMaterialServiceProvider && v.exitPlanStatus === "Missing",
  ).length;

  return (
    <div className="mw-stack">
      <div className="mw-row mw-row--between mw-row--wrap">
        <div className="mw-muted">
          ISO 27001 A.5.19–5.22 &amp; APRA CPS 230 Material Service Provider register ({mspCount}{" "}
          MSP{mspCount === 1 ? "" : "s"}
          {missingExit > 0 ? ` · ${missingExit} missing exit plan` : ""}).
        </div>
        <div className="mw-row">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              downloadFile("/api/exports/vendors.csv", "mount-charter-vendors-cps230.csv")
            }
          >
            <Icon name="download" />
            Export CSV
          </button>
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            onClick={() => {
              reset();
              setShowForm((v) => !v);
            }}
          >
            <Icon name="plus" />
            {showForm && !editing ? "Close Form" : "Add Vendor"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="pp-card">
          <div className="pp-card__body mw-stack">
            <div className="mw-form-grid">
              <div className="pp-field">
                <label htmlFor="v-name">Supplier / Service Provider Name *</label>
                <input
                  id="v-name"
                  className="pp-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Amazon Web Services (ap-southeast-2)"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="v-svc">Service Description</label>
                <input
                  id="v-svc"
                  className="pp-input"
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  placeholder="e.g. Core cloud hosting & managed PostgreSQL"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="v-crit">Criticality</label>
                <select
                  id="v-crit"
                  className="pp-select"
                  value={criticality}
                  onChange={(e) => setCriticality(e.target.value as VendorCriticality)}
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="v-exit">Exit Plan Status (CPS 230)</label>
                <select
                  id="v-exit"
                  className="pp-select"
                  value={exitPlanStatus}
                  onChange={(e) => setExitPlanStatus(e.target.value as ExitPlanStatus)}
                >
                  <option value="Missing">Missing</option>
                  <option value="Documented">Documented</option>
                  <option value="Tested">Tested</option>
                </select>
              </div>
              <div className="pp-field">
                <label htmlFor="v-res">Data Residency / APP 8 Country</label>
                <input
                  id="v-res"
                  className="pp-input"
                  value={dataResidency}
                  onChange={(e) => setDataResidency(e.target.value)}
                />
              </div>
              <div className="pp-field">
                <label htmlFor="v-data">Data Types Shared</label>
                <input
                  id="v-data"
                  className="pp-input"
                  value={dataTypesShared}
                  onChange={(e) => setDataTypesShared(e.target.value)}
                  placeholder="e.g. Customer PII, billing records"
                />
              </div>
              <div className="pp-field">
                <label htmlFor="v-owner">Relationship Owner</label>
                <input
                  id="v-owner"
                  className="pp-input"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </div>
              <div className="pp-field">
                <label htmlFor="v-exp">Contract Expiry Date</label>
                <input
                  id="v-exp"
                  type="date"
                  className="pp-input"
                  value={contractExpiryDate}
                  onChange={(e) => setContractExpiryDate(e.target.value)}
                />
              </div>
            </div>
            <label className="mw-row" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={isMsp} onChange={(e) => setIsMsp(e.target.checked)} />
              <span>
                <strong>APRA CPS 230 Material Service Provider</strong> (requires documented &amp;
                tested exit plan and board notification register)
              </span>
            </label>
            <div className="mw-row">
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={busy}
                onClick={save}
              >
                {editing ? "Save Vendor" : "Add Vendor"}
              </button>
              <button
                type="button"
                className="pp-button pp-button--sm"
                onClick={() => {
                  reset();
                  setShowForm(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="pp-card">
          <div className="pp-state">
            <div className="pp-state__title">No suppliers registered yet</div>
            <div className="mw-muted">
              Track cloud providers, SaaS processors (APP 8 overseas disclosures), and CPS 230
              Material Service Providers with exit-plan verification.
            </div>
          </div>
        </div>
      ) : (
        <div className="pp-card">
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Criticality &amp; MSP</th>
                  <th>Data Residency</th>
                  <th>Exit Plan</th>
                  <th>Contract Expiry</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {vendors.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{v.name}</div>
                      {v.serviceDescription && (
                        <div className="mw-faint">{v.serviceDescription}</div>
                      )}
                      {v.dataTypesShared && (
                        <div className="mw-faint">Data: {v.dataTypesShared}</div>
                      )}
                    </td>
                    <td className="mw-nowrap">
                      <div className="mw-row">
                        <span
                          className={
                            v.criticality === "Critical"
                              ? "pp-status pp-status--err"
                              : v.criticality === "High"
                                ? "pp-status pp-status--warn"
                                : "pp-badge"
                          }
                        >
                          {v.criticality}
                        </span>
                        {v.isMaterialServiceProvider && (
                          <span className="pp-badge pp-badge--accent">CPS 230 MSP</span>
                        )}
                      </div>
                    </td>
                    <td>{v.dataResidency || "—"}</td>
                    <td className="mw-nowrap">
                      <span
                        className={
                          v.exitPlanStatus === "Tested"
                            ? "pp-status pp-status--ok"
                            : v.exitPlanStatus === "Documented"
                              ? "pp-badge pp-badge--accent"
                              : v.isMaterialServiceProvider
                                ? "pp-status pp-status--err"
                                : "pp-badge"
                        }
                      >
                        {v.exitPlanStatus}
                      </span>
                    </td>
                    <td className="mw-nowrap">
                      <div>{formatShortDate(v.contractExpiryDate)}</div>
                      {v.owner && <div className="mw-faint">{v.owner}</div>}
                    </td>
                    <td className="mw-nowrap">
                      <div className="mw-row">
                        <button
                          type="button"
                          className="pp-button pp-button--sm pp-button--ghost"
                          onClick={() => openEdit(v)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="pp-button pp-button--sm pp-button--ghost"
                          onClick={() => setDeleteTarget(v)}
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
        title="Delete Vendor"
        message={`Remove "${deleteTarget?.name}" from the Vendor Register?`}
        confirmLabel="Remove"
        danger
        busy={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await apiRequest("DELETE", `/api/governance/vendors/${deleteTarget.id}`);
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
