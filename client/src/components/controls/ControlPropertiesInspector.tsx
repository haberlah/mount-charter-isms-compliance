import type {
  ControlDetailResponse,
  ControlFrequency,
  ControlStartQuarter,
  ControlUrgency,
  ImplementationStatus,
  Persona,
} from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { formatShortDate } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface ControlPropertiesInspectorProps {
  detail: ControlDetailResponse;
  controlNumber: string;
}

export function ControlPropertiesInspector({
  detail,
  controlNumber,
}: ControlPropertiesInspectorProps) {
  const hydratedRef = useRef<string>("");
  const [propsDirty, setPropsDirty] = useState(false);
  const [isApplicable, setIsApplicable] = useState(true);
  const [inclusionJustification, setInclusionJustification] = useState("");
  const [exclusionJustification, setExclusionJustification] = useState("");
  const [implementationStatus, setImplementationStatus] =
    useState<ImplementationStatus>("NotImplemented");
  const [urgency, setUrgency] = useState<ControlUrgency>("later");
  const [frequency, setFrequency] = useState<ControlFrequency>("Annual");
  const [startQuarter, setStartQuarter] = useState<ControlStartQuarter>("Q1");
  const [persona, setPersona] = useState<Persona>("Auditor");
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  useEffect(() => {
    const isNewControl = hydratedRef.current !== detail.controlNumber;
    if (isNewControl || !propsDirty) {
      hydratedRef.current = detail.controlNumber;
      if (isNewControl) setPropsDirty(false);
      setIsApplicable(detail.workspaceControl.isApplicable);
      setInclusionJustification(detail.workspaceControl.inclusionJustification || "");
      setExclusionJustification(detail.workspaceControl.exclusionJustification || "");
      setImplementationStatus(detail.workspaceControl.implementationStatus);
      setUrgency(detail.workspaceControl.selectedUrgency);
      setFrequency(detail.workspaceControl.frequency || "Annual");
      setStartQuarter(detail.workspaceControl.startQuarter || "Q1");
      setPersona(detail.workspaceControl.selectedPersona);
    }
  }, [detail, propsDirty]);

  const saveProperties = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/controls/${encodeURIComponent(controlNumber)}`, {
        isApplicable,
        inclusionJustification: inclusionJustification.trim() || null,
        exclusionJustification: isApplicable ? null : exclusionJustification.trim(),
        implementationStatus,
        selectedUrgency: urgency,
        frequency,
        startQuarter,
        selectedPersona: persona,
      }),
    onSuccess: () => {
      setPropsDirty(false);
      invalidateWorkspaceQueries(controlNumber);
      showToast("Control properties saved", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const isMandatoryClause = detail.controlNumber.toUpperCase().startsWith("RQ");
  const exclusionInvalid = !isApplicable && exclusionJustification.trim().length < 5;

  return (
    <aside className="mw-inspector" aria-label="Control properties">
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Control Properties</h2>
        </div>
        <div className="pp-card__body mw-stack">
          <label className="pp-check">
            <input
              type="checkbox"
              className="pp-switch"
              role="switch"
              aria-checked={isMandatoryClause ? true : isApplicable}
              disabled={isMandatoryClause}
              checked={isMandatoryClause ? true : isApplicable}
              onChange={(e) => {
                setIsApplicable(e.target.checked);
                setPropsDirty(true);
              }}
            />
            <span>{isMandatoryClause ? "Mandatory ISO Clause (4–10)" : "Applicable in SoA"}</span>
          </label>

          {isApplicable ? (
            <>
              <div className="pp-field">
                <label className="pp-field__label" htmlFor="prop-impl-status">
                  Implementation status (Clause 6.1.3(d))
                </label>
                <select
                  id="prop-impl-status"
                  className="pp-select pp-select--sm"
                  value={implementationStatus}
                  onChange={(e) => {
                    setImplementationStatus(e.target.value as ImplementationStatus);
                    setPropsDirty(true);
                  }}
                >
                  <option value="NotImplemented">Not Implemented</option>
                  <option value="Planned">Planned</option>
                  <option value="PartiallyImplemented">Partially Implemented</option>
                  <option value="Implemented">Implemented</option>
                </select>
              </div>

              <div className="pp-field">
                <label className="pp-field__label" htmlFor="prop-inclusion">
                  Inclusion justification (Clause 6.1.3(d))
                </label>
                <textarea
                  id="prop-inclusion"
                  className="pp-textarea"
                  rows={2}
                  placeholder="e.g. Risk treatment, legal/regulatory (APRA/Privacy Act), or contractual requirement…"
                  value={inclusionJustification}
                  onChange={(e) => {
                    setInclusionJustification(e.target.value);
                    setPropsDirty(true);
                  }}
                />
              </div>
            </>
          ) : (
            <div className="pp-field">
              <label className="pp-field__label" htmlFor="prop-exclusion">
                Exclusion justification (min 5 chars)
              </label>
              <textarea
                id="prop-exclusion"
                className="pp-textarea"
                rows={3}
                placeholder="Explain why this Annex A control is excluded from ISMS scope…"
                value={exclusionJustification}
                onChange={(e) => {
                  setExclusionJustification(e.target.value);
                  setPropsDirty(true);
                }}
              />
            </div>
          )}

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prop-urgency">
              Priority
            </label>
            <select
              id="prop-urgency"
              className="pp-select pp-select--sm"
              value={urgency}
              onChange={(e) => {
                setUrgency(e.target.value as ControlUrgency);
                setPropsDirty(true);
              }}
            >
              <option value="now">Now (Immediate)</option>
              <option value="next">Next (Upcoming)</option>
              <option value="later">Later (Backlog)</option>
            </select>
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prop-frequency">
              Review frequency
            </label>
            <select
              id="prop-frequency"
              className="pp-select pp-select--sm"
              value={frequency}
              onChange={(e) => {
                setFrequency(e.target.value as ControlFrequency);
                setPropsDirty(true);
              }}
            >
              <option value="Annual">Annual</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prop-quarter">
              AU FY Start Quarter
            </label>
            <select
              id="prop-quarter"
              className="pp-select pp-select--sm"
              value={startQuarter}
              onChange={(e) => {
                setStartQuarter(e.target.value as ControlStartQuarter);
                setPropsDirty(true);
              }}
            >
              <option value="Q1">Q1 (Jul–Sep)</option>
              <option value="Q2">Q2 (Oct–Dec)</option>
              <option value="Q3">Q3 (Jan–Mar)</option>
              <option value="Q4">Q4 (Apr–Jun)</option>
            </select>
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prop-persona">
              Default AI Persona
            </label>
            <select
              id="prop-persona"
              className="pp-select pp-select--sm"
              value={persona}
              onChange={(e) => {
                setPersona(e.target.value as Persona);
                setPropsDirty(true);
              }}
            >
              <option value="Auditor">Auditor (Evidence &amp; NC risk)</option>
              <option value="Advisor">Advisor (Maturity &amp; guidance)</option>
              <option value="Analyst">Analyst (Scoring &amp; KPIs)</option>
            </select>
          </div>

          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            disabled={!propsDirty || exclusionInvalid || saveProperties.isPending}
            onClick={() => saveProperties.mutate()}
          >
            {saveProperties.isPending ? "Saving…" : "Save Properties"}
          </button>
        </div>
      </div>

      {detail.changeLog.length > 0 && (
        <details className="pp-disclosure">
          <summary>Response Change Log ({detail.changeLog.length})</summary>
          <div className="pp-disclosure__body mw-stack mw-stack--sm">
            {detail.changeLog.slice(0, 10).map((entry) => {
              const open = expandedLogId === entry.id;
              return (
                <div key={entry.id} className="mw-stack" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="pp-button pp-button--ghost pp-button--sm"
                    style={{ justifyContent: "space-between", width: "100%" }}
                    onClick={() => setExpandedLogId(open ? null : entry.id)}
                  >
                    <span className="mw-faint">
                      <span className="mw-mono">Q{entry.questionId}</span> · {entry.changeSource}
                    </span>
                    <span className="mw-faint mw-mono">{formatShortDate(entry.createdAt)}</span>
                  </button>
                  {open && (
                    <div className="mw-quote" style={{ fontSize: "var(--paper-size-caption)" }}>
                      {entry.previousResponse && (
                        <div style={{ marginBottom: 4 }}>
                          <strong>Before:</strong> {entry.previousResponse.slice(0, 240)}
                        </div>
                      )}
                      <div>
                        <strong>After:</strong> {entry.newResponse.slice(0, 320)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </aside>
  );
}
