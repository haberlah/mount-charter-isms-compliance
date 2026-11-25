import type {
  DocumentRecord,
  E8TargetLevel,
  FrameworkDetailResponse,
  FrameworkSummary,
} from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { FrameworkOverviewTab } from "@/components/frameworks/FrameworkOverviewTab";
import { RequirementCard } from "@/components/frameworks/RequirementCard";
import { E8MaturityBadge, formatShortDate, Icon, PaperTabs } from "@/components/PaperUi";
import { apiRequest, downloadFile, invalidateWorkspaceQueries, showToast } from "@/lib/api";

export function FrameworksPage() {
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const urlFw = new URLSearchParams(searchStr).get("fw");

  const [tab, setTab] = useState<string>(urlFw || "acsc_e8_2023");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDrafts, setShowDrafts] = useState<boolean>(true);
  const [showStrategyNaForm, setShowStrategyNaForm] = useState<boolean>(false);
  const [strategyNaReason, setStrategyNaReason] = useState<string>("");

  const { data: frameworks = [], isLoading } = useQuery<FrameworkSummary[]>({
    queryKey: ["frameworks"],
    queryFn: () => apiRequest<FrameworkSummary[]>("GET", "/api/frameworks"),
  });

  const { data: documents = [] } = useQuery<DocumentRecord[]>({
    queryKey: ["documents"],
    queryFn: () => apiRequest<DocumentRecord[]>("GET", "/api/documents"),
  });

  const moduleFrameworks = useMemo(
    () =>
      frameworks.filter((f) => f.supportTier === "full" && f.code !== "iso27001_2022" && f.enabled),
    [frameworks],
  );

  useEffect(() => {
    if (urlFw) {
      setTab(urlFw);
    }
  }, [urlFw]);

  useEffect(() => {
    if (
      tab !== "overview" &&
      frameworks.length > 0 &&
      !frameworks.some(
        (f) => f.code === tab && f.supportTier === "full" && f.code !== "iso27001_2022",
      )
    ) {
      setTab(moduleFrameworks[0]?.code || "overview");
    }
  }, [tab, frameworks, moduleFrameworks]);

  const handleTabChange = (next: string) => {
    setTab(next);
    setDomainFilter("all");
    setLevelFilter("all");
    setStatusFilter("all");
    navigate(`/frameworks?fw=${encodeURIComponent(next)}`, { replace: true });
  };

  const activeCode = tab === "overview" ? null : tab;
  const { data: detail } = useQuery<FrameworkDetailResponse>({
    queryKey: ["framework", activeCode],
    queryFn: () =>
      apiRequest<FrameworkDetailResponse>(
        "GET",
        `/api/frameworks/${encodeURIComponent(activeCode!)}`,
      ),
    enabled: Boolean(activeCode),
  });

  const updateConfig = useMutation({
    mutationFn: ({
      code,
      patch,
    }: {
      code: string;
      patch: { enabled?: boolean; targetLevel?: E8TargetLevel | null };
    }) => apiRequest("PUT", `/api/frameworks/${encodeURIComponent(code)}/config`, patch),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("Framework settings updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const markStrategyStatus = useMutation({
    mutationFn: async ({
      code,
      reqCodes,
      status,
      notes,
    }: {
      code: string;
      reqCodes: string[];
      status: "NotApplicable" | "NotMet";
      notes: string | null;
    }) => {
      for (const reqCode of reqCodes) {
        await apiRequest(
          "PATCH",
          `/api/frameworks/${encodeURIComponent(code)}/requirements/${encodeURIComponent(reqCode)}`,
          { status, notes },
        );
      }
      return { count: reqCodes.length, status };
    },
    onSuccess: (res) => {
      setShowStrategyNaForm(false);
      setStrategyNaReason("");
      invalidateWorkspaceQueries();
      showToast(
        res.status === "NotApplicable"
          ? `Marked ${res.count} strategy criteria Not Applicable`
          : `Reset ${res.count} strategy criteria to Not Met`,
        { tone: "ok" },
      );
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const handleExport = async (code: string) => {
    const filename =
      code === "acsc_e8_2023"
        ? "mount-charter-essential-eight-maturity.csv"
        : code === "au_privacy_act"
          ? "mount-charter-privacy-act-readiness.csv"
          : `mount-charter-${code}-readiness.csv`;
    try {
      const res = await downloadFile(
        `/api/exports/framework/${encodeURIComponent(code)}.csv`,
        filename,
      );
      if (res.cancelled) return;
      showToast(`Exported ${res.filename}`, { tone: "ok" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed", { tone: "err" });
    }
  };

  const domains = useMemo(() => {
    if (!detail) return [];
    return Array.from(new Set(detail.requirements.map((r) => r.domain)));
  }, [detail]);

  const filteredReqs = useMemo(() => {
    if (!detail) return [];
    return detail.requirements.filter((r) => {
      if (!showDrafts && r.isDraft) return false;
      if (domainFilter !== "all" && r.domain !== domainFilter) return false;
      if (levelFilter !== "all" && r.levelOrCategory !== levelFilter) return false;
      if (statusFilter !== "all" && r.assessment.status !== statusFilter) return false;
      return true;
    });
  }, [detail, domainFilter, levelFilter, statusFilter, showDrafts]);

  const tabItems = useMemo(() => {
    const items = moduleFrameworks.map((f) => ({
      id: f.code,
      label:
        f.code === "acsc_e8_2023"
          ? `${f.shortName} (${f.weakestLinkMaturity || "ML0"})`
          : `${f.shortName} (${f.readinessPercentage}%)`,
    }));
    // If user deep-linked to a currently disabled full framework, keep its tab reachable
    if (
      activeCode &&
      !items.some((i) => i.id === activeCode) &&
      frameworks.some((f) => f.code === activeCode && f.supportTier === "full")
    ) {
      const found = frameworks.find((f) => f.code === activeCode)!;
      items.push({ id: found.code, label: `${found.shortName} (Off)` });
    }
    items.push({ id: "overview", label: "Scope & Coverage" });
    return items;
  }, [moduleFrameworks, activeCode, frameworks]);

  return (
    <div className="mw-container">
      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <h1 className="pp-page-header__title">Frameworks</h1>
          <p className="pp-page-header__meta">
            First-class Australian assurance modules cross-mapped to ISO/IEC 27001:2022 (+ Amd
            1:2024) with immutable assessment history &amp; direct evidence links.
          </p>
        </div>
        <div className="pp-page-header__actions">
          {detail && (
            <button
              type="button"
              className="pp-button pp-button--sm"
              title={`Export ${detail.shortName} CSV`}
              aria-label={`Export ${detail.shortName} CSV`}
              onClick={() => handleExport(detail.code)}
            >
              <Icon name="download" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      <PaperTabs
        label="Compliance frameworks"
        value={tab}
        onChange={handleTabChange}
        tabs={tabItems}
      />

      {isLoading && <p className="mw-muted">Loading frameworks…</p>}

      {tab === "overview" ? (
        <FrameworkOverviewTab
          frameworks={frameworks}
          onToggleFramework={(code, enabled) => updateConfig.mutate({ code, patch: { enabled } })}
          onSelectFramework={(code) => handleTabChange(code)}
        />
      ) : (
        detail && (
          <div className="mw-stack">
            {/* Legislative Provenance & Transition Notice */}
            {detail.transitionNote && (
              <div className="pp-banner pp-banner--info" role="note">
                <div className="pp-banner__body">
                  <div className="pp-banner__title">
                    {detail.instrumentId || detail.name}
                    {detail.effectiveDate
                      ? ` · Effective ${formatShortDate(detail.effectiveDate)}`
                      : ""}
                  </div>
                  <div className="pp-banner__text">
                    {detail.transitionNote}{" "}
                    {detail.sourceUrl && (
                      <a
                        href={detail.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mw-table-link"
                      >
                        Official instrument ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming Statutory Deadlines */}
            {detail.upcomingDeadlines && detail.upcomingDeadlines.length > 0 && (
              <div className="pp-banner pp-banner--warn" role="status">
                <div className="pp-banner__body">
                  <div className="pp-banner__title">Statutory Dates &amp; Deadlines</div>
                  <div className="pp-banner__text">
                    {detail.upcomingDeadlines.map((d) => (
                      <span key={d.reqCode} style={{ marginRight: 14 }}>
                        <strong>{d.reqCode}</strong> ({formatShortDate(d.deadlineDate)}
                        {d.daysRemaining > 0 ? `, ${d.daysRemaining}d remaining` : ", in force"}):{" "}
                        {d.status}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* KPI Band */}
            <div className="mw-kpi-grid">
              {detail.code === "acsc_e8_2023" ? (
                <>
                  <div className="pp-card">
                    <div className="pp-card__body mw-stack mw-stack--sm">
                      <span className="pp-overline">Weakest-Link Maturity</span>
                      <div className="mw-row">
                        <span className="pp-stat">{detail.weakestLinkMaturity || "ML0"}</span>
                        <E8MaturityBadge level={detail.weakestLinkMaturity || "ML0"} />
                      </div>
                      <span className="mw-faint">MIN across all 8 ASD strategies</span>
                    </div>
                  </div>
                  <div className="pp-card">
                    <div className="pp-card__body mw-stack mw-stack--sm">
                      <span className="pp-overline">Target Maturity</span>
                      <select
                        className="pp-select pp-select--sm"
                        aria-label="Essential Eight target maturity level"
                        value={detail.targetLevel || "ML1"}
                        onChange={(e) =>
                          updateConfig.mutate({
                            code: "acsc_e8_2023",
                            patch: { targetLevel: e.target.value as E8TargetLevel },
                          })
                        }
                      >
                        <option value="ML1">Maturity Level 1 (ML1)</option>
                        <option value="ML2">Maturity Level 2 (ML2)</option>
                        <option value="ML3">Maturity Level 3 (ML3)</option>
                      </select>
                      <span className="mw-faint">ASD Nov 2023 (72 criteria)</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="pp-card">
                    <div className="pp-card__body mw-stack mw-stack--sm">
                      <span className="pp-overline">In-Force Readiness</span>
                      <div className="pp-stat">{detail.readinessPercentage}%</div>
                      <span className="mw-faint">
                        {detail.jurisdiction} · {detail.version}
                      </span>
                    </div>
                  </div>
                  <div className="pp-card">
                    <div className="pp-card__body mw-stack mw-stack--sm">
                      <span className="pp-overline">Authoritative Instrument</span>
                      <div style={{ fontWeight: 600, fontSize: "var(--paper-size-secondary)" }}>
                        {detail.instrumentId || detail.shortName}
                      </div>
                      <span className="mw-faint">
                        {detail.draftCount > 0
                          ? `${detail.draftCount} draft watch items excluded from score`
                          : "All criteria currently in force"}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="pp-card">
                <div className="pp-card__body mw-stack mw-stack--sm">
                  <span className="pp-overline">In-Force Criteria Met</span>
                  <div className="pp-stat">
                    {detail.metCount}/{detail.totalRequirements}
                  </div>
                  <span className="mw-faint">
                    {detail.partiallyMetCount} partial · {detail.notMetCount} not met
                    {detail.notApplicableCount > 0 ? ` · ${detail.notApplicableCount} N/A` : ""}
                  </span>
                </div>
              </div>

              <div className="pp-card">
                <div className="pp-card__body mw-stack mw-stack--sm">
                  <span className="pp-overline">Cross-Framework Drift</span>
                  <div className="mw-row">
                    <span className="pp-stat">{detail.driftCount}</span>
                    <span
                      className={
                        detail.driftCount > 0
                          ? "pp-status pp-status--err"
                          : "pp-status pp-status--ok"
                      }
                    >
                      {detail.driftCount > 0 ? "Action needed" : "In sync"}
                    </span>
                  </div>
                  <span className="mw-faint">Checks linked ISO 27001 test runs &amp; SoA</span>
                </div>
              </div>
            </div>

            {/* 8-Strategy Weakest-Link Rollup for Essential Eight */}
            {detail.code === "acsc_e8_2023" && detail.e8Strategies && (
              <section className="pp-card" aria-label="Essential Eight strategy matrix">
                <div className="pp-card__header">
                  <h2 className="pp-card__title">8 Mitigation Strategies — Weakest-Link Rollup</h2>
                  <span className="pp-card__meta">
                    Click a strategy to filter the 72 discrete criteria
                  </span>
                </div>
                <div className="pp-card__body">
                  <div className="mw-e8-grid">
                    {detail.e8Strategies.map((s) => {
                      const selected = domainFilter === s.strategy;
                      return (
                        <button
                          key={s.strategy}
                          type="button"
                          className="mw-question-card"
                          style={{
                            textAlign: "left",
                            cursor: "pointer",
                            borderColor: selected ? "var(--paper-accent)" : undefined,
                            background: selected ? "var(--paper-accent-soft)" : undefined,
                          }}
                          onClick={() => setDomainFilter(selected ? "all" : s.strategy)}
                        >
                          <div className="mw-row mw-row--between">
                            <E8MaturityBadge level={s.achievedLevel} />
                            {s.hasRubricConflict && <span className="pp-badge">48h SLA</span>}
                          </div>
                          <div style={{ fontWeight: 500, fontSize: "var(--paper-size-secondary)" }}>
                            {s.strategy}
                          </div>
                          <div className="mw-faint mw-mono">
                            ML1 {s.ml1Met}/{s.ml1Total} · ML2 {s.ml2Met}/{s.ml2Total} · ML3{" "}
                            {s.ml3Met}/{s.ml3Total}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Filter Bar */}
            <div className="pp-filter-bar mw-filter-bar">
              <select
                className="pp-select pp-select--sm"
                aria-label="Filter requirement domain"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
              >
                <option value="all">All domains ({detail.requirements.length})</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {detail.code === "acsc_e8_2023" && (
                <select
                  className="pp-select pp-select--sm"
                  aria-label="Filter Maturity Level"
                  value={levelFilter}
                  onChange={(e) => setLevelFilter(e.target.value)}
                >
                  <option value="all">All levels (ML1–ML3)</option>
                  <option value="ML1">Maturity Level 1 (ML1)</option>
                  <option value="ML2">Maturity Level 2 (ML2)</option>
                  <option value="ML3">Maturity Level 3 (ML3)</option>
                </select>
              )}

              <select
                className="pp-select pp-select--sm"
                aria-label="Filter status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="NotMet">Not Met</option>
                <option value="PartiallyMet">Partially Met</option>
                <option value="Met">Met</option>
                <option value="NotApplicable">Not Applicable</option>
              </select>

              {detail.draftCount > 0 && (
                <label className="pp-check">
                  <input
                    type="checkbox"
                    checked={showDrafts}
                    onChange={(e) => setShowDrafts(e.target.checked)}
                  />
                  <span>Show draft / exposure-draft watch items ({detail.draftCount})</span>
                </label>
              )}

              {(domainFilter !== "all" || levelFilter !== "all" || statusFilter !== "all") && (
                <button
                  type="button"
                  className="pp-button pp-button--ghost pp-button--sm"
                  onClick={() => {
                    setDomainFilter("all");
                    setLevelFilter("all");
                    setStatusFilter("all");
                    setShowStrategyNaForm(false);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {detail.code === "acsc_e8_2023" &&
              domainFilter !== "all" &&
              (() => {
                const strategyReqs = detail.requirements.filter((r) => r.domain === domainFilter);
                const allNa =
                  strategyReqs.length > 0 &&
                  strategyReqs.every((r) => r.assessment.status === "NotApplicable");
                return (
                  <div
                    className="mw-bulk-bar"
                    role="region"
                    aria-label="Essential Eight strategy scope"
                  >
                    <div className="mw-stack" style={{ gap: 2 }}>
                      <strong style={{ fontSize: 13.5 }}>
                        {domainFilter} ({strategyReqs.length} criteria)
                      </strong>
                      <span className="mw-faint">
                        {allNa
                          ? "All criteria in this ASD Essential Eight strategy are marked Not Applicable."
                          : "Verbatim ASD Essential Eight strategy. If this technology is absent from your environment, mark all criteria Not Applicable with justification."}
                      </span>
                    </div>
                    <div className="mw-row">
                      {allNa ? (
                        <button
                          type="button"
                          className="pp-button pp-button--sm"
                          disabled={markStrategyStatus.isPending}
                          onClick={() =>
                            markStrategyStatus.mutate({
                              code: detail.code,
                              reqCodes: strategyReqs.map((r) => r.reqCode),
                              status: "NotMet",
                              notes: null,
                            })
                          }
                        >
                          Restore Strategy to In-Scope
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="pp-button pp-button--sm"
                          onClick={() => setShowStrategyNaForm((v) => !v)}
                        >
                          {showStrategyNaForm ? "Cancel" : "Mark Strategy Not Applicable…"}
                        </button>
                      )}
                    </div>
                    {showStrategyNaForm && !allNa && (
                      <div className="mw-row mw-row--wrap" style={{ width: "100%" }}>
                        <input
                          type="text"
                          className="pp-input pp-input--sm"
                          style={{ flex: 1, minWidth: 260 }}
                          aria-label="Strategy exclusion justification"
                          placeholder="e.g. Microsoft Office is not installed or permitted (macOS / Google Workspace environment)"
                          value={strategyNaReason}
                          onChange={(e) => setStrategyNaReason(e.target.value)}
                        />
                        <button
                          type="button"
                          className="pp-button pp-button--primary pp-button--sm"
                          disabled={
                            strategyNaReason.trim().length < 5 || markStrategyStatus.isPending
                          }
                          onClick={() =>
                            markStrategyStatus.mutate({
                              code: detail.code,
                              reqCodes: strategyReqs.map((r) => r.reqCode),
                              status: "NotApplicable",
                              notes: strategyNaReason.trim(),
                            })
                          }
                        >
                          {markStrategyStatus.isPending
                            ? "Updating…"
                            : `Apply N/A to ${strategyReqs.length} Criteria`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

            <div className="mw-stack">
              {filteredReqs.map((r) => (
                <RequirementCard
                  key={r.reqCode}
                  frameworkCode={detail.code}
                  req={r}
                  documents={documents}
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
