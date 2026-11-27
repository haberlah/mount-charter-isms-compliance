import type {
  ClimateChangeRelevance,
  ControlFrequency,
  ControlSummary,
  ControlUrgency,
  ImplementationStatus,
  WorkspaceProfile,
} from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface SoaTabProps {
  controls: ControlSummary[];
  profile: WorkspaceProfile | undefined;
}

function ImplementationGlyph({ status }: { status: ImplementationStatus }) {
  if (status === "Implemented") {
    return (
      <svg className="mw-cell-select__glyph" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="5" fill="currentColor" />
        <path
          d="M3.6 6.2L5.2 7.8L8.6 4.4"
          fill="none"
          stroke="var(--paper-surface)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === "PartiallyImplemented") {
    return (
      <svg className="mw-cell-select__glyph" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 1.4A4.6 4.6 0 0 1 6 10.6Z" fill="currentColor" />
      </svg>
    );
  }
  if (status === "Planned") {
    return (
      <svg className="mw-cell-select__glyph" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.35" />
        <circle cx="6" cy="6" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="mw-cell-select__glyph" viewBox="0 0 12 12" aria-hidden="true">
      <circle
        cx="6"
        cy="6"
        r="4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="2.2 1.8"
      />
    </svg>
  );
}

function PriorityGlyph({ urgency }: { urgency: ControlUrgency }) {
  const filled = urgency === "now" ? 3 : urgency === "next" ? 2 : 1;
  return (
    <svg className="mw-cell-select__glyph" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.5" y="7.5" width="2" height="3" rx="0.6" fill="currentColor" />
      <rect
        x="5"
        y="4.8"
        width="2"
        height="5.7"
        rx="0.6"
        fill="currentColor"
        opacity={filled >= 2 ? 1 : 0.25}
      />
      <rect
        x="8.5"
        y="2"
        width="2"
        height="8.5"
        rx="0.6"
        fill="currentColor"
        opacity={filled >= 3 ? 1 : 0.25}
      />
    </svg>
  );
}

function implToneClass(status: ImplementationStatus): string {
  if (status === "Implemented") return "mw-cell-select--ok";
  if (status === "PartiallyImplemented") return "mw-cell-select--warn";
  if (status === "Planned") return "mw-cell-select--accent";
  return "mw-cell-select--muted";
}

function priorityToneClass(urgency: ControlUrgency): string {
  if (urgency === "now") return "mw-cell-select--err";
  if (urgency === "next") return "mw-cell-select--warn";
  return "mw-cell-select--muted";
}

export function SoaTab({ controls, profile }: SoaTabProps) {
  const [soaSearch, setSoaSearch] = useState("");
  const [soaVersion, setSoaVersion] = useState("1.0");
  const [soaApprovedBy, setSoaApprovedBy] = useState("");
  const [soaApprovedAt, setSoaApprovedAt] = useState("");
  const [climateRelevant, setClimateRelevant] = useState<ClimateChangeRelevance>("Undetermined");
  const [climateRationale, setClimateRationale] = useState("");

  const [selectedControls, setSelectedControls] = useState<Set<string>>(new Set());
  const [bulkUrgency, setBulkUrgency] = useState<ControlUrgency>("next");
  const [bulkImplStatus, setBulkImplStatus] = useState<ImplementationStatus>("Implemented");

  const justificationDialogRef = useRef<HTMLDialogElement>(null);
  const [justMode, setJustMode] = useState<"exclude" | "include" | "bulk_exclude">("exclude");
  const [targetControl, setTargetControl] = useState<ControlSummary | null>(null);
  const [justificationText, setJustificationText] = useState("");

  useEffect(() => {
    if (!profile) return;
    setSoaVersion(profile.soaVersion || "1.0");
    setSoaApprovedBy(profile.soaApprovedBy || "");
    setSoaApprovedAt(profile.soaApprovedAt || "");
    setClimateRelevant(profile.climateChangeRelevant || "Undetermined");
    setClimateRationale(profile.climateChangeRationale || "");
  }, [profile]);

  const saveSoaMeta = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings/profile", {
        soaVersion: soaVersion.trim() || "1.0",
        soaApprovedBy: soaApprovedBy.trim() || null,
        soaApprovedAt: soaApprovedAt || null,
        climateChangeRelevant: climateRelevant,
        climateChangeRationale: climateRationale.trim() || null,
      }),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("SoA metadata & Amd 1:2024 Climate Change determination saved", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const updateControl = useMutation({
    mutationFn: ({
      controlNumber,
      patch,
    }: {
      controlNumber: string;
      patch: Record<string, unknown>;
    }) => apiRequest("PATCH", `/api/controls/${encodeURIComponent(controlNumber)}`, patch),
    onSuccess: () => {
      justificationDialogRef.current?.close();
      setTargetControl(null);
      setJustificationText("");
      invalidateWorkspaceQueries();
      showToast("Statement of Applicability updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const bulkUpdate = useMutation({
    mutationFn: (updates: Array<Record<string, unknown>>) =>
      apiRequest<{ updatedCount: number }>("POST", "/api/controls/soa/bulk", { updates }),
    onSuccess: (res) => {
      justificationDialogRef.current?.close();
      setSelectedControls(new Set());
      setJustificationText("");
      invalidateWorkspaceQueries();
      showToast(`Updated ${res.updatedCount} controls in SoA`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const draftSoaAi = useMutation({
    mutationFn: (controlNumbers?: string[]) =>
      apiRequest<{ stagedProposals: unknown[]; costUsd: number; modelUsed: string }>(
        "POST",
        "/api/agent/soa-justifications",
        controlNumbers && controlNumbers.length > 0 ? { controlNumbers } : {},
      ),
    onSuccess: (res) => {
      void invalidateWorkspaceQueries();
      if (res.stagedProposals.length === 0) {
        showToast("All applicable Annex A controls already have justifications recorded.", {
          tone: "info",
        });
      } else {
        showToast(
          `Staged ${res.stagedProposals.length} Clause 6.1.3(d) justification proposal(s) in AI Proposal Inbox`,
          { tone: "ok" },
        );
      }
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const filteredSoa = useMemo(() => {
    const q = soaSearch.trim().toLowerCase();
    if (!q) return controls;
    return controls.filter((c) =>
      `${c.controlNumber} ${c.name} ${c.shortSummary || ""} ${c.category.name} ${c.cps234Reference || ""} ${c.cps230Reference || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [controls, soaSearch]);

  const selectedAnnexControls = Array.from(selectedControls).filter(
    (num) => !num.toUpperCase().startsWith("RQ"),
  );

  return (
    <div className="mw-stack">
      <details className="pp-disclosure">
        <summary>
          SoA Document Control (v{soaVersion}) &amp; Amd 1:2024 Climate Change Determination (
          {climateRelevant})
        </summary>
        <div className="pp-disclosure__body mw-stack">
          <div className="mw-form-grid">
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="soa-ver">
                SoA Version (Clause 7.5)
              </label>
              <input
                id="soa-ver"
                className="pp-input pp-input--sm"
                value={soaVersion}
                onChange={(e) => setSoaVersion(e.target.value)}
              />
            </div>
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="soa-approver">
                Approved By
              </label>
              <input
                id="soa-approver"
                className="pp-input pp-input--sm"
                placeholder="e.g. CISO / Board Audit & Risk Committee"
                value={soaApprovedBy}
                onChange={(e) => setSoaApprovedBy(e.target.value)}
              />
            </div>
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="soa-date">
                Approval Date
              </label>
              <input
                id="soa-date"
                type="date"
                className="pp-input pp-input--sm"
                value={soaApprovedAt}
                onChange={(e) => setSoaApprovedAt(e.target.value)}
              />
            </div>
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="soa-climate">
                Amd 1:2024 Climate Change Relevance (Clauses 4.1 &amp; 4.2)
              </label>
              <select
                id="soa-climate"
                className="pp-select pp-select--sm"
                value={climateRelevant}
                onChange={(e) => setClimateRelevant(e.target.value as ClimateChangeRelevance)}
              >
                <option value="Undetermined">Undetermined (Must assess for audit)</option>
                <option value="Relevant">Relevant to ISMS context / interested parties</option>
                <option value="NotRelevant">Assessed — Not Relevant (rationale recorded)</option>
              </select>
            </div>
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="soa-climate-rat">
              Climate Change Determination Rationale
            </label>
            <textarea
              id="soa-climate-rat"
              className="pp-textarea"
              rows={2}
              placeholder="Document how climate-related weather, power/cooling, cloud region availability, or interested-party obligations were assessed…"
              value={climateRationale}
              onChange={(e) => setClimateRationale(e.target.value)}
            />
          </div>
          <div>
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              disabled={saveSoaMeta.isPending}
              onClick={() => saveSoaMeta.mutate()}
            >
              {saveSoaMeta.isPending ? "Saving…" : "Save SoA Control & Climate Determination"}
            </button>
          </div>
        </div>
      </details>

      <div className="pp-filter-bar mw-filter-bar">
        <div className="pp-search">
          <Icon name="search" className="pp-icon pp-search__icon" />
          <input
            type="search"
            className="pp-search__input"
            placeholder="Search controls in SoA (number, name, CPS 234/230)…"
            aria-label="Search Statement of Applicability"
            value={soaSearch}
            onChange={(e) => setSoaSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="pp-button pp-button--sm"
          disabled={draftSoaAi.isPending}
          onClick={() =>
            draftSoaAi.mutate(selectedAnnexControls.length > 0 ? selectedAnnexControls : undefined)
          }
          title="Draft Clause 6.1.3(d) inclusion justifications grounded in your Risk Register and enabled Australian frameworks (staged in AI Proposal Inbox)"
        >
          {draftSoaAi.isPending
            ? "Drafting Justifications…"
            : selectedAnnexControls.length > 0
              ? `Draft Justifications (${selectedAnnexControls.length} selected)`
              : "Draft Missing Justifications (AI)"}
        </button>
      </div>

      {selectedControls.size > 0 && (
        <div className="mw-bulk-bar" role="region" aria-label="Bulk SoA actions">
          <strong>{selectedControls.size} control(s) selected</strong>
          <div className="mw-row mw-row--wrap">
            <select
              className="pp-select pp-select--sm"
              aria-label="Bulk priority"
              value={bulkUrgency}
              onChange={(e) => setBulkUrgency(e.target.value as ControlUrgency)}
            >
              <option value="now">Priority: Now</option>
              <option value="next">Priority: Next</option>
              <option value="later">Priority: Later</option>
            </select>
            <button
              type="button"
              className="pp-button pp-button--sm"
              onClick={() =>
                bulkUpdate.mutate(
                  Array.from(selectedControls).map((controlNumber) => ({
                    controlNumber,
                    selectedUrgency: bulkUrgency,
                  })),
                )
              }
            >
              Apply Priority
            </button>

            <select
              className="pp-select pp-select--sm"
              aria-label="Bulk implementation status"
              value={bulkImplStatus}
              onChange={(e) => setBulkImplStatus(e.target.value as ImplementationStatus)}
            >
              <option value="Implemented">Impl: Implemented</option>
              <option value="PartiallyImplemented">Impl: Partial</option>
              <option value="Planned">Impl: Planned</option>
              <option value="NotImplemented">Impl: Not Implemented</option>
            </select>
            <button
              type="button"
              className="pp-button pp-button--sm"
              onClick={() =>
                bulkUpdate.mutate(
                  Array.from(selectedControls).map((controlNumber) => ({
                    controlNumber,
                    implementationStatus: bulkImplStatus,
                  })),
                )
              }
            >
              Apply Impl Status
            </button>

            {selectedAnnexControls.length > 0 && (
              <button
                type="button"
                className="pp-button pp-button--danger pp-button--sm"
                onClick={() => {
                  setJustMode("bulk_exclude");
                  setTargetControl(null);
                  setJustificationText("");
                  justificationDialogRef.current?.showModal();
                }}
              >
                Exclude {selectedAnnexControls.length} Annex A
              </button>
            )}

            <button
              type="button"
              className="pp-button pp-button--ghost pp-button--sm"
              onClick={() => setSelectedControls(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="pp-card">
        <div
          className="pp-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Statement of Applicability table"
        >
          <table className="pp-table pp-table--compact">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible controls"
                    checked={
                      filteredSoa.length > 0 &&
                      filteredSoa.every((c) => selectedControls.has(c.controlNumber))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedControls(new Set(filteredSoa.map((c) => c.controlNumber)));
                      } else {
                        setSelectedControls(new Set());
                      }
                    }}
                  />
                </th>
                <th>Control</th>
                <th>Name</th>
                <th>Applicable</th>
                <th>Implementation</th>
                <th>Priority</th>
                <th>Frequency</th>
                <th>Justification (6.1.3(d))</th>
              </tr>
            </thead>
            <tbody>
              {filteredSoa.length === 0 ? (
                <tr className="pp-table__empty">
                  <td colSpan={8}>No controls match your search.</td>
                </tr>
              ) : (
                filteredSoa.map((c) => {
                  const isClause = c.controlNumber.toUpperCase().startsWith("RQ");
                  const checked = selectedControls.has(c.controlNumber);
                  return (
                    <tr
                      key={c.controlNumber}
                      className={
                        c.workspaceControl.isApplicable ? undefined : "mw-soa-row--excluded"
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.controlNumber}`}
                          checked={checked}
                          onChange={(e) => {
                            setSelectedControls((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.controlNumber);
                              else next.delete(c.controlNumber);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="mw-mono mw-nowrap">
                        <Link
                          href={`/controls/${encodeURIComponent(c.controlNumber)}`}
                          className="mw-table-link"
                        >
                          {c.controlNumber}
                        </Link>
                      </td>
                      <td>
                        <div className="mw-stack" style={{ gap: 2 }}>
                          <span>{c.name}</span>
                          {c.shortSummary && (
                            <span className="mw-faint" style={{ lineHeight: 1.35 }}>
                              {c.shortSummary}
                            </span>
                          )}
                          <div className="mw-row mw-row--wrap" style={{ gap: 4 }}>
                            <span className="mw-faint">{c.category.name}</span>
                            {(c.linkedRiskCodes || []).map((rc) => (
                              <Link
                                key={rc}
                                href="/governance?tab=risks"
                                className="pp-badge mw-mono"
                                style={{ textDecoration: "none", fontSize: 11 }}
                                title={`Treats ${rc} in Risk Register`}
                              >
                                {rc}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td>
                        {isClause ? (
                          <span
                            className="pp-badge"
                            title="ISO/IEC 27001:2022 Clauses 4–10 are mandatory and cannot be excluded"
                          >
                            Mandatory
                          </span>
                        ) : (
                          <label className="pp-check">
                            <input
                              type="checkbox"
                              className="pp-switch"
                              role="switch"
                              aria-checked={c.workspaceControl.isApplicable}
                              aria-label={`Mark ${c.controlNumber} applicable`}
                              checked={c.workspaceControl.isApplicable}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateControl.mutate({
                                    controlNumber: c.controlNumber,
                                    patch: { isApplicable: true, exclusionJustification: null },
                                  });
                                } else {
                                  setJustMode("exclude");
                                  setTargetControl(c);
                                  setJustificationText(
                                    c.workspaceControl.exclusionJustification || "",
                                  );
                                  justificationDialogRef.current?.showModal();
                                }
                              }}
                            />
                          </label>
                        )}
                      </td>
                      <td className="mw-nowrap">
                        <span
                          className={`mw-cell-select mw-cell-select--with-glyph ${implToneClass(c.workspaceControl.implementationStatus)}`}
                        >
                          <ImplementationGlyph status={c.workspaceControl.implementationStatus} />
                          <select
                            className="pp-select pp-select--sm pp-select--ghost"
                            aria-label={`Implementation status for ${c.controlNumber}`}
                            disabled={!c.workspaceControl.isApplicable}
                            value={c.workspaceControl.implementationStatus}
                            onChange={(e) =>
                              updateControl.mutate({
                                controlNumber: c.controlNumber,
                                patch: {
                                  implementationStatus: e.target.value as ImplementationStatus,
                                },
                              })
                            }
                          >
                            <option value="NotImplemented">Not Impl.</option>
                            <option value="Planned">Planned</option>
                            <option value="PartiallyImplemented">Partial</option>
                            <option value="Implemented">Implemented</option>
                          </select>
                        </span>
                      </td>
                      <td className="mw-nowrap">
                        <span
                          className={`mw-cell-select mw-cell-select--with-glyph ${priorityToneClass(c.workspaceControl.selectedUrgency)}`}
                        >
                          <PriorityGlyph urgency={c.workspaceControl.selectedUrgency} />
                          <select
                            className="pp-select pp-select--sm pp-select--ghost"
                            aria-label={`Priority for ${c.controlNumber}`}
                            disabled={!c.workspaceControl.isApplicable}
                            value={c.workspaceControl.selectedUrgency}
                            onChange={(e) =>
                              updateControl.mutate({
                                controlNumber: c.controlNumber,
                                patch: { selectedUrgency: e.target.value as ControlUrgency },
                              })
                            }
                          >
                            <option value="now">Now</option>
                            <option value="next">Next</option>
                            <option value="later">Later</option>
                          </select>
                        </span>
                      </td>
                      <td className="mw-nowrap">
                        <span className="mw-cell-select mw-cell-select--plain">
                          <select
                            className="pp-select pp-select--sm pp-select--ghost"
                            aria-label={`Frequency for ${c.controlNumber}`}
                            disabled={!c.workspaceControl.isApplicable}
                            value={c.workspaceControl.frequency || "Annual"}
                            onChange={(e) =>
                              updateControl.mutate({
                                controlNumber: c.controlNumber,
                                patch: { frequency: e.target.value as ControlFrequency },
                              })
                            }
                          >
                            <option value="Annual">Annual</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="Monthly">Monthly</option>
                          </select>
                        </span>
                      </td>
                      <td>
                        {c.workspaceControl.isApplicable ? (
                          <div className="mw-row mw-row--between" style={{ gap: 6 }}>
                            <span className="mw-faint">
                              {c.workspaceControl.inclusionJustification || "Not recorded"}
                            </span>
                            <button
                              type="button"
                              className="pp-icon-button pp-icon-button--compact"
                              aria-label={`Edit inclusion justification for ${c.controlNumber}`}
                              title="Edit inclusion justification"
                              onClick={() => {
                                setJustMode("include");
                                setTargetControl(c);
                                setJustificationText(
                                  c.workspaceControl.inclusionJustification || "",
                                );
                                justificationDialogRef.current?.showModal();
                              }}
                            >
                              <Icon name="pencil" />
                            </button>
                          </div>
                        ) : (
                          <div className="mw-row mw-row--between" style={{ gap: 6 }}>
                            <span className="mw-faint">
                              Excluded: {c.workspaceControl.exclusionJustification || "—"}
                            </span>
                            <button
                              type="button"
                              className="pp-icon-button pp-icon-button--compact"
                              aria-label={`Edit exclusion justification for ${c.controlNumber}`}
                              title="Edit exclusion justification"
                              onClick={() => {
                                setJustMode("exclude");
                                setTargetControl(c);
                                setJustificationText(
                                  c.workspaceControl.exclusionJustification || "",
                                );
                                justificationDialogRef.current?.showModal();
                              }}
                            >
                              <Icon name="pencil" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <dialog
        ref={justificationDialogRef}
        className="pp-dialog pp-dialog--confirm"
        closedby="any"
        aria-labelledby="just-dialog-title"
        onClose={() => {
          setTargetControl(null);
          setJustificationText("");
        }}
      >
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            const text = justificationText.trim();
            if (justMode === "bulk_exclude") {
              bulkUpdate.mutate(
                selectedAnnexControls.map((controlNumber) => ({
                  controlNumber,
                  isApplicable: false,
                  exclusionJustification: text,
                })),
              );
            } else if (justMode === "exclude" && targetControl) {
              updateControl.mutate({
                controlNumber: targetControl.controlNumber,
                patch: { isApplicable: false, exclusionJustification: text },
              });
            } else if (justMode === "include" && targetControl) {
              updateControl.mutate({
                controlNumber: targetControl.controlNumber,
                patch: { inclusionJustification: text || null },
              });
            }
          }}
        >
          <div className="pp-dialog__header">
            <h2 id="just-dialog-title" className="pp-dialog__title">
              {justMode === "bulk_exclude"
                ? `Exclude ${selectedAnnexControls.length} Annex A Controls`
                : justMode === "exclude"
                  ? `Exclusion Justification — ${targetControl?.controlNumber}`
                  : `Inclusion Justification — ${targetControl?.controlNumber}`}
            </h2>
            <button
              type="button"
              className="pp-icon-button pp-icon-button--compact"
              aria-label="Close dialog"
              onClick={() => justificationDialogRef.current?.close()}
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="pp-dialog__body mw-stack">
            {targetControl && (targetControl.plainEnglishSummary || targetControl.shortSummary) && (
              <div className="mw-quote" style={{ fontSize: "var(--paper-size-secondary)" }}>
                <strong>
                  {targetControl.controlNumber} — {targetControl.name}:
                </strong>{" "}
                {targetControl.plainEnglishSummary || targetControl.shortSummary}
              </div>
            )}
            <p className="mw-muted">
              ISO/IEC 27001:2022 Clause 6.1.3(d) requires documented justification for both
              inclusions and exclusions in your Statement of Applicability.
            </p>
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="soa-just-reason">
                {justMode === "include"
                  ? "Inclusion justification (risk treatment, legal/regulatory, or contractual basis)"
                  : "Exclusion justification (minimum 5 characters)"}
              </label>
              <textarea
                id="soa-just-reason"
                className="pp-textarea"
                rows={3}
                required={justMode !== "include"}
                minLength={justMode !== "include" ? 5 : undefined}
                placeholder={
                  justMode === "include"
                    ? "e.g. Required to treat cloud credential risk and satisfy APRA CPS 234 / Essential Eight."
                    : "e.g. Organisation operates 100% cloud-native with no on-premises data centres…"
                }
                value={justificationText}
                onChange={(e) => setJustificationText(e.target.value)}
              />
            </div>
          </div>
          <div className="pp-dialog__footer">
            <button
              type="button"
              className="pp-button"
              onClick={() => justificationDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pp-button pp-button--primary"
              disabled={
                (justMode !== "include" && justificationText.trim().length < 5) ||
                updateControl.isPending ||
                bulkUpdate.isPending
              }
            >
              {justMode === "include" ? "Save Justification" : "Confirm Exclusion"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
