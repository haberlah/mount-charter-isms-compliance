import type { ControlCategory, ControlSummary, WorkspaceProfile } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute, useSearch } from "wouter";
import { Icon, StatusBadge, UrgencyBadge } from "@/components/PaperUi";
import { apiRequest } from "@/lib/api";
import { ControlDetailPage } from "@/pages/ControlDetailPage";

type Segment = "all" | "clauses" | "annex";

export function ControlsPage() {
  const [, routeParams] = useRoute("/controls/:controlNumber");
  const routeControlNumber = routeParams?.controlNumber
    ? decodeURIComponent(routeParams.controlNumber)
    : "";
  const searchString = useSearch();
  const [, navigate] = useLocation();

  const [segment, setSegment] = useState<Segment>(() => {
    const s = new URLSearchParams(searchString).get("segment");
    return s === "clauses" || s === "annex" ? s : "all";
  });
  const [search, setSearch] = useState(() => new URLSearchParams(searchString).get("q") || "");
  const [categoryId, setCategoryId] = useState(
    () => new URLSearchParams(searchString).get("category") || "all",
  );
  const [urgency, setUrgency] = useState(
    () => new URLSearchParams(searchString).get("urgency") || "all",
  );
  const [statusFilter, setStatusFilter] = useState(
    () => new URLSearchParams(searchString).get("status") || "all",
  );
  const [evidenceFilter, setEvidenceFilter] = useState(
    () => new URLSearchParams(searchString).get("evidence") || "all",
  );
  const [showExcludedOverride, setShowExcludedOverride] = useState(false);

  // Sync in-place URL query changes (e.g. clicking Overview drilldown while already on /controls)
  useEffect(() => {
    const p = new URLSearchParams(searchString);
    const s = p.get("segment");
    if (s === "all" || s === "clauses" || s === "annex") setSegment(s);
    if (p.has("q")) setSearch(p.get("q") || "");
    if (p.has("category")) setCategoryId(p.get("category") || "all");
    if (p.has("urgency")) setUrgency(p.get("urgency") || "all");
    if (p.has("status")) setStatusFilter(p.get("status") || "all");
    if (p.has("evidence")) setEvidenceFilter(p.get("evidence") || "all");
  }, [searchString]);

  const {
    data: controls = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ControlSummary[]>({
    queryKey: ["controls"],
    queryFn: () => apiRequest<ControlSummary[]>("GET", "/api/controls"),
  });

  const { data: categories = [] } = useQuery<ControlCategory[]>({
    queryKey: ["categories"],
    queryFn: () => apiRequest<ControlCategory[]>("GET", "/api/categories"),
  });

  const { data: settingsData } = useQuery<{ profile: WorkspaceProfile }>({
    queryKey: ["settings-profile"],
    queryFn: () => apiRequest<{ profile: WorkspaceProfile }>("GET", "/api/settings/profile"),
  });

  const hideNonApplicable =
    Boolean(settingsData?.profile?.hideNonApplicableControls) && !showExcludedOverride;
  const hiddenExcludedCount = useMemo(
    () => (hideNonApplicable ? controls.filter((c) => !c.workspaceControl.isApplicable).length : 0),
    [controls, hideNonApplicable],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return controls.filter((c) => {
      if (hideNonApplicable && !c.workspaceControl.isApplicable) return false;
      if (segment === "clauses" && !c.controlNumber.startsWith("RQ")) return false;
      if (segment === "annex" && c.controlNumber.startsWith("RQ")) return false;
      if (categoryId !== "all" && String(c.categoryId) !== categoryId) return false;
      if (urgency !== "all" && c.workspaceControl.selectedUrgency !== urgency) return false;

      const latestStatus = c.latestTestRun?.status || "NotAttempted";
      if (statusFilter !== "all" && latestStatus !== statusFilter) return false;

      if (evidenceFilter === "gaps" && (c.linkedDocumentCount > 0 || c.evidenceLinkCount > 0)) {
        return false;
      }
      if (evidenceFilter === "pending_ai" && c.pendingMatchCount === 0) return false;
      if (evidenceFilter === "apra" && !c.cps234Reference && !c.cps230Reference) return false;

      if (q) {
        const hay =
          `${c.controlNumber} ${c.name} ${c.shortSummary || ""} ${c.plainEnglishSummary || ""} ${c.category.name} ${c.cps234Reference || ""} ${c.cps230Reference || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    controls,
    hideNonApplicable,
    segment,
    categoryId,
    urgency,
    statusFilter,
    evidenceFilter,
    search,
  ]);

  const activeControlNumber =
    routeControlNumber || filtered[0]?.controlNumber || controls[0]?.controlNumber || "";

  const hasActiveFilters =
    segment !== "all" ||
    search.trim() !== "" ||
    categoryId !== "all" ||
    urgency !== "all" ||
    statusFilter !== "all" ||
    evidenceFilter !== "all";

  const clearFilters = () => {
    setSegment("all");
    setSearch("");
    setCategoryId("all");
    setUrgency("all");
    setStatusFilter("all");
    setEvidenceFilter("all");
  };

  const buildQuerySuffix = () => {
    const p = new URLSearchParams();
    if (segment !== "all") p.set("segment", segment);
    if (search.trim()) p.set("q", search.trim());
    if (categoryId !== "all") p.set("category", categoryId);
    if (urgency !== "all") p.set("urgency", urgency);
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (evidenceFilter !== "all") p.set("evidence", evidenceFilter);
    const str = p.toString();
    return str ? `?${str}` : "";
  };

  const selectControl = (num: string) => {
    navigate(`/controls/${encodeURIComponent(num)}${buildQuerySuffix()}`);
  };

  if (error) {
    return (
      <div className="mw-scroll-area">
        <div className="mw-container">
          <div className="pp-banner pp-banner--err" role="alert">
            <div className="pp-banner__body">
              <div className="pp-banner__title">Failed to load controls</div>
              <div className="pp-banner__text">
                {error instanceof Error ? error.message : "Unknown error"}
              </div>
            </div>
            <div className="pp-banner__actions">
              <button type="button" className="pp-button pp-button--sm" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <paper-split
      class="pp-split mw-controls-split"
      default="340"
      min="260"
      max="480"
      min-second="420"
      responsive="stack"
      collapse-at="840"
      storage-key="mount-charter.controlsSplit"
    >
      {/* Master Pane: Filterable Controls List */}
      <aside className="mw-split-pane mw-split-pane--list" aria-label="Controls list">
        <div className="mw-split-pane__header">
          <div className="mw-row mw-row--between">
            <strong style={{ fontSize: "var(--paper-size-title)" }}>
              Controls ({filtered.length}/{controls.length})
            </strong>
            {hasActiveFilters && (
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={clearFilters}
              >
                Clear
              </button>
            )}
          </div>

          <div className="pp-segmented" role="group" aria-label="Standard section">
            {(
              [
                ["all", "All"],
                ["clauses", "Clauses 4–10"],
                ["annex", "Annex A"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                className="pp-segmented__item"
                aria-pressed={segment === val}
                onClick={() => setSegment(val)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pp-search">
            <Icon name="search" className="pp-icon pp-search__icon" />
            <input
              type="search"
              className="pp-search__input"
              placeholder="Filter number, name, APRA…"
              aria-label="Filter controls"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="mw-row mw-row--wrap" style={{ gap: 6 }}>
            <select
              className="pp-select pp-select--sm"
              aria-label="Filter by domain"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ flex: "1 1 130px" }}
            >
              <option value="all">All domains</option>
              {categories.map((cat) => (
                <option key={cat.id} value={String(cat.id)}>
                  {cat.name}
                </option>
              ))}
            </select>
            <select
              className="pp-select pp-select--sm"
              aria-label="Filter by priority"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value)}
              style={{ flex: "1 1 95px" }}
            >
              <option value="all">Priority</option>
              <option value="now">Now</option>
              <option value="next">Next</option>
              <option value="later">Later</option>
            </select>
            <select
              className="pp-select pp-select--sm"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ flex: "1 1 110px" }}
            >
              <option value="all">All statuses</option>
              <option value="Pass">Pass</option>
              <option value="PassPrevious">Pass (Prev)</option>
              <option value="ContinualImprovement">Improvement</option>
              <option value="Fail">Fail</option>
              <option value="Blocked">Blocked</option>
              <option value="NotAttempted">Not Tested</option>
            </select>
            <select
              className="pp-select pp-select--sm"
              aria-label="Filter by evidence or APRA"
              value={evidenceFilter}
              onChange={(e) => setEvidenceFilter(e.target.value)}
              style={{ flex: "1 1 110px" }}
            >
              <option value="all">All evidence</option>
              <option value="gaps">No evidence</option>
              <option value="pending_ai">Pending AI</option>
              <option value="apra">APRA mapped</option>
            </select>
          </div>

          {hiddenExcludedCount > 0 && (
            <div className="mw-row mw-row--between">
              <span className="mw-faint">{hiddenExcludedCount} excluded hidden</span>
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={() => setShowExcludedOverride(true)}
              >
                Show
              </button>
            </div>
          )}
        </div>

        <div className="mw-split-pane__scroll">
          {isLoading ? (
            <div className="mw-muted" style={{ padding: 16 }}>
              Loading controls…
            </div>
          ) : filtered.length === 0 ? (
            <div className="pp-state" style={{ padding: 20 }}>
              <div className="pp-state__title">No matching controls</div>
              <button type="button" className="pp-button pp-button--sm" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          ) : (
            filtered.map((c) => {
              const selected = c.controlNumber === activeControlNumber;
              return (
                <button
                  key={c.controlNumber}
                  type="button"
                  className="mw-control-list-item"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => selectControl(c.controlNumber)}
                >
                  <div className="mw-row mw-row--between">
                    <span className="mw-mono" style={{ fontWeight: 600 }}>
                      {c.controlNumber}
                    </span>
                    <div className="mw-row" style={{ gap: 4 }}>
                      {c.pendingMatchCount > 0 && (
                        <span className="pp-badge pp-badge--accent">{c.pendingMatchCount} AI</span>
                      )}
                      {c.workspaceControl.isApplicable ? (
                        <UrgencyBadge urgency={c.workspaceControl.selectedUrgency} />
                      ) : (
                        <span className="pp-badge">N/A</span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: "var(--paper-size-secondary)",
                      fontWeight: 500,
                      lineHeight: 1.35,
                    }}
                  >
                    {c.name}
                  </div>
                  {c.shortSummary && <div className="mw-control-tagline">{c.shortSummary}</div>}
                  <div className="mw-row mw-row--between">
                    <span className="mw-faint">
                      {c.questionnaireProgress.answered}/{c.questionnaireProgress.total} Qs ·{" "}
                      {c.linkedDocumentCount + c.evidenceLinkCount} ev
                    </span>
                    <StatusBadge status={c.latestTestRun?.status} />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Resizer handle required by <paper-split> as 2nd child (column 2) */}
      <div
        role="separator"
        className="pp-split__resizer"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize controls list"
        aria-valuenow={340}
      />

      {/* Detail Pane: Full Control Workbench */}
      <section className="mw-split-pane" aria-label="Control detail">
        <div className="mw-split-pane__detail-scroll">
          {activeControlNumber ? (
            <ControlDetailPage
              controlNumberProp={activeControlNumber}
              visibleControls={filtered}
              onSelectControl={selectControl}
            />
          ) : (
            <div className="pp-state">
              <div className="pp-state__title">Select a control</div>
              <div className="pp-state__text">
                Choose any ISO/IEC 27001:2022 clause or Annex A control from the list.
              </div>
            </div>
          )}
        </div>
      </section>
    </paper-split>
  );
}
