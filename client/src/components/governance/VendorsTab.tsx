import type {
  DocumentRecord,
  ExitPlanStatus,
  VendorAssuranceResult,
  VendorCriticality,
  VendorRecord,
} from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
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
  const [assureVendorId, setAssureVendorId] = useState<string>("");
  const [assureDocId, setAssureDocId] = useState<string>("");
  const [analysingPack, setAnalysingPack] = useState(false);
  const [assuranceResult, setAssuranceResult] = useState<VendorAssuranceResult | null>(null);

  const { data: documents = [] } = useQuery<DocumentRecord[]>({
    queryKey: ["documents"],
    queryFn: () => apiRequest<DocumentRecord[]>("GET", "/api/documents"),
  });

  const runVendorAssurance = async () => {
    if (!assureVendorId || !assureDocId) {
      showToast("Select both a vendor and an uploaded SOC 2 / contract document.", {
        tone: "warn",
      });
      return;
    }
    setAnalysingPack(true);
    try {
      const res = await apiRequest<VendorAssuranceResult>(
        "POST",
        `/api/agent/vendors/${encodeURIComponent(assureVendorId)}/analyse-document`,
        { documentId: Number(assureDocId) },
      );
      setAssuranceResult(res);
      await invalidateWorkspaceQueries();
      showToast(
        `Vendor assurance complete: ${res.cuecs.length} CUEC(s), ${res.stagedProposalCount} CAPA proposal(s) staged`,
        { tone: "ok" },
      );
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setAnalysingPack(false);
    }
  };

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

      {vendors.length > 0 && (
        <div className="pp-card">
          <div className="pp-card__header">
            <div>
              <div className="pp-title">
                Vendor &amp; MSP Assurance Pack Analyser (SOC 2 Type II · CPS 230 · APP 8)
              </div>
              <div className="mw-faint">
                Inspect an uploaded vendor SOC 2 report, ISO certificate, or MSA/DPA to extract
                CUECs, sub-processors, overseas residency (APP 8), and APRA CPS 230 mandatory
                clauses.
              </div>
            </div>
          </div>
          <div className="pp-card__body mw-stack">
            <div className="mw-row mw-row--wrap">
              <select
                className="pp-select pp-select--sm"
                style={{ width: "auto", minWidth: 200 }}
                aria-label="Select vendor to analyse"
                value={assureVendorId}
                onChange={(e) => setAssureVendorId(e.target.value)}
              >
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.name} {v.isMaterialServiceProvider ? "(MSP)" : ""}
                  </option>
                ))}
              </select>
              <select
                className="pp-select pp-select--sm"
                style={{ width: "auto", minWidth: 240 }}
                aria-label="Select vendor SOC 2 or contract document"
                value={assureDocId}
                onChange={(e) => setAssureDocId(e.target.value)}
              >
                <option value="">Select uploaded SOC 2 / contract…</option>
                {documents
                  .filter((d) => !d.mimeType.startsWith("image/") && d.extractionStatus !== "error")
                  .map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.title} ({d.originalFilename})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={analysingPack || !assureVendorId || !assureDocId}
                onClick={() => void runVendorAssurance()}
              >
                {analysingPack ? "Analysing Pack…" : "Analyse Vendor Pack (AI)"}
              </button>
            </div>

            {assuranceResult && (
              <div className="mw-proposal-card">
                <div className="mw-row mw-row--between mw-row--wrap">
                  <div className="mw-row mw-row--wrap">
                    <strong>
                      {assuranceResult.vendorName} — {assuranceResult.documentTitle}
                    </strong>
                    <span
                      className={
                        assuranceResult.app8CrossBorderRisk === "High"
                          ? "pp-status pp-status--err"
                          : assuranceResult.app8CrossBorderRisk === "Medium"
                            ? "pp-status pp-status--warn"
                            : "pp-status pp-status--ok"
                      }
                    >
                      APP 8 Risk: {assuranceResult.app8CrossBorderRisk}
                    </span>
                    {assuranceResult.bridgeLetterNeeded && (
                      <span className="pp-status pp-status--warn">Bridge Letter Needed</span>
                    )}
                  </div>
                  <span className="mw-faint mw-mono">
                    Window: {assuranceResult.auditWindow} · {assuranceResult.modelUsed}
                  </span>
                </div>

                <div className="pp-prose">{assuranceResult.summary}</div>

                <div className="mw-row mw-row--wrap">
                  <span className="pp-badge">
                    APRA Access: {assuranceResult.cps230Clauses.apraAccessRights}
                  </span>
                  <span className="pp-badge">
                    24h/72h Notice: {assuranceResult.cps230Clauses.incidentNotice24h72h}
                  </span>
                  <span className="pp-badge">
                    Exit Support: {assuranceResult.cps230Clauses.exitAndTransitionSupport}
                  </span>
                  <span className="mw-faint">
                    Residency: {assuranceResult.dataResidencyFindings}
                  </span>
                </div>

                {assuranceResult.cuecs.length > 0 && (
                  <div className="mw-stack mw-stack--sm">
                    <strong style={{ fontSize: 13 }}>
                      Complementary User Entity Controls ({assuranceResult.cuecs.length})
                    </strong>
                    {assuranceResult.cuecs.slice(0, 6).map((c, idx) => (
                      <div key={`${c.cuec}-${idx}`} className="mw-faint">
                        {c.mappedIsoControl && (
                          <span className="pp-badge mw-mono" style={{ marginRight: 6 }}>
                            ISO {c.mappedIsoControl}
                          </span>
                        )}
                        <strong>{c.cuec}</strong> — {c.statusNote}
                      </div>
                    ))}
                  </div>
                )}

                {assuranceResult.stagedProposalCount > 0 && (
                  <div className="mw-row">
                    <Link
                      href="/evidence?tab=queue"
                      className="pp-button pp-button--primary pp-button--sm"
                    >
                      Review {assuranceResult.stagedProposalCount} Staged CAPA Proposal(s) →
                    </Link>
                  </div>
                )}
              </div>
            )}
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
