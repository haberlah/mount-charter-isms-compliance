import type { ActionItem, DashboardStats } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import {
  ComplianceRing,
  E8MaturityBadge,
  formatShortDate,
  Icon,
  StatusBadge,
  UrgencyBadge,
} from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

export function OverviewPage() {
  const [newAction, setNewAction] = useState("");
  const [editingActionId, setEditingActionId] = useState<number | null>(null);
  const [editingActionTitle, setEditingActionTitle] = useState("");

  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery<DashboardStats>({
    queryKey: ["dashboard"],
    queryFn: () => apiRequest<DashboardStats>("GET", "/api/dashboard"),
  });

  const { data: actionItems = [] } = useQuery<ActionItem[]>({
    queryKey: ["action-items"],
    queryFn: () => apiRequest<ActionItem[]>("GET", "/api/action-items"),
  });

  const { data: settingsData } = useQuery<{ dataDir: string }>({
    queryKey: ["settings-profile"],
    queryFn: () => apiRequest("GET", "/api/settings/profile"),
  });

  const addAction = useMutation({
    mutationFn: (title: string) => apiRequest("POST", "/api/action-items", { title }),
    onSuccess: () => {
      setNewAction("");
      invalidateWorkspaceQueries();
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const updateAction = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { done?: boolean; title?: string } }) =>
      apiRequest("PATCH", `/api/action-items/${id}`, patch),
    onSuccess: () => {
      setEditingActionId(null);
      setEditingActionTitle("");
      invalidateWorkspaceQueries();
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const deleteAction = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/action-items/${id}`),
    onSuccess: () => invalidateWorkspaceQueries(),
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const dismissOnboarding = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/settings/profile", { onboardingDismissed: true }),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("Onboarding checklist dismissed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  if (isLoading) {
    return (
      <div className="mw-container" aria-busy="true">
        <span className="pp-sr-only">Loading overview…</span>
        <span className="pp-skeleton pp-skeleton--title" aria-hidden="true" />
        <div className="mw-kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="pp-card">
              <div className="pp-card__body">
                <span className="pp-skeleton" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="mw-container">
        <div className="pp-banner pp-banner--err" role="alert">
          <div className="pp-banner__body">
            <div className="pp-banner__title">Unable to load compliance overview</div>
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
    );
  }

  const e8 = stats.frameworks?.find((f) => f.code === "acsc_e8_2023");
  const privacy = stats.frameworks?.find((f) => f.code === "au_privacy_act");
  const cyberAct = stats.frameworks?.find((f) => f.code === "au_cyber_security_act_2024");
  const admDeadline = privacy?.upcomingDeadlines?.find((d) => d.reqCode === "APP-1.7-ADM");
  const totalDriftAlerts = (stats.frameworks || []).reduce(
    (acc, f) => acc + (f.driftCount || 0),
    0,
  );
  const gov = stats.governanceSummary;

  const onboardingSteps = [
    {
      done: stats.onboarding.hasProfile,
      title: "Configure organisation profile & AI provider",
      desc: "Set your industry, active frameworks (ISO 27001, Essential Eight, Privacy Act, APRA), and optional cloud, local OSS, or CLI AI provider.",
      href: "/settings",
      cta: "Open Settings",
    },
    {
      done: stats.onboarding.hasScopedControls,
      title: "Scope your Statement of Applicability",
      desc: "Record inclusion/exclusion justifications (Clause 6.1.3(d)), implementation states, and Now/Next priorities.",
      href: "/audit",
      cta: "Scope SoA",
    },
    {
      done: stats.onboarding.hasDocuments,
      title: "Upload policies & evidence to the local library",
      desc: `Files stay strictly local inside ${settingsData?.dataDir || "your local Mount Charter data folder"}.`,
      href: "/evidence?upload=1",
      cta: "Upload Evidence",
    },
    {
      done: stats.onboarding.hasResponsesOrTests,
      title: "Answer control questions & record your first test",
      desc: "Build an immutable, audit-ready ISO/IEC 27001:2022 (+ Amd 1:2024) assessment trail.",
      href: "/controls",
      cta: "Browse Controls",
    },
  ];
  const showOnboarding = !stats.onboarding.dismissed && onboardingSteps.some((s) => !s.done);

  return (
    <div className="mw-container">
      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <h1 className="pp-page-header__title">Overview</h1>
          <p className="pp-page-header__meta">
            ISO/IEC 27001:2022 (+ Amd 1:2024) readiness across {stats.applicableControls} applicable
            controls
            {stats.excludedControls > 0 ? ` (${stats.excludedControls} excluded)` : ""}.
          </p>
        </div>
        <div className="pp-page-header__actions">
          {stats.documentStats.pendingSuggestions > 0 && (
            <Link href="/evidence?tab=queue" className="pp-button pp-button--primary pp-button--sm">
              <Icon name="sparkles" />
              <span>{stats.documentStats.pendingSuggestions} AI Suggestions to Review</span>
            </Link>
          )}
          <Link href="/evidence?upload=1" className="pp-button pp-button--sm">
            <Icon name="upload" />
            <span>Upload Evidence</span>
          </Link>
          <Link href="/audit" className="pp-button pp-button--sm">
            <Icon name="download" />
            <span>Audit &amp; SoA</span>
          </Link>
        </div>
      </div>

      {/* Band 1: Clickable Readiness KPIs & Rings */}
      <div className="mw-kpi-grid">
        <Link href="/controls?status=Pass" className="pp-card mw-card-link">
          <div className="pp-card__body">
            <ComplianceRing
              percentage={stats.compliancePercentage}
              label="ISO 27001 Compliance"
              sublabel={`${stats.passedControls} of ${stats.applicableControls} passed`}
              tone="ok"
            />
          </div>
        </Link>
        <Link href="/controls" className="pp-card mw-card-link">
          <div className="pp-card__body">
            <ComplianceRing
              percentage={stats.questionnaireProgress.percentage}
              label="Assessment"
              sublabel={`${stats.questionnaireProgress.answeredQuestions} of ${stats.questionnaireProgress.totalQuestions} questions`}
            />
          </div>
        </Link>
        <Link
          href={stats.failedControls > 0 ? "/controls?status=Fail" : "/controls"}
          className="pp-card mw-card-link"
        >
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-row mw-row--between">
              <span className="pp-overline">Applicable Controls</span>
              <Icon name="shield" />
            </div>
            <div className="pp-stat">{stats.applicableControls}</div>
            <div className="mw-muted">
              {stats.failedControls} fail · {stats.blockedControls} blocked ·{" "}
              {stats.notTestedControls} untested
            </div>
          </div>
        </Link>
        <Link
          href={stats.documentStats.controlsWithGaps > 0 ? "/controls?evidence=gaps" : "/evidence"}
          className="pp-card mw-card-link"
        >
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-row mw-row--between">
              <span className="pp-overline">Evidence Library</span>
              <Icon name="file-text" />
            </div>
            <div className="pp-stat">{stats.documentStats.totalDocuments}</div>
            <div className="mw-muted">
              {stats.documentStats.controlsWithEvidence} with evidence ·{" "}
              {stats.documentStats.controlsWithGaps} gaps
            </div>
          </div>
        </Link>
      </div>

      {/* First-Class Australian Frameworks & Amd 1:2024 Snapshot */}
      <div className="mw-kpi-grid">
        {e8 && (
          <Link href="/frameworks?fw=acsc_e8_2023" className="pp-card mw-card-link">
            <div className="pp-card__header">
              <h2 className="pp-card__title">ACSC Essential Eight</h2>
              <E8MaturityBadge level={e8.weakestLinkMaturity || "ML0"} />
            </div>
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-muted">
                Weakest-Link Maturity across 8 strategies · Target {e8.targetLevel || "ML1"}
              </div>
              <div className="mw-faint">
                {e8.metCount}/{e8.totalRequirements} discrete criteria met (Nov 2023)
              </div>
            </div>
          </Link>
        )}
        {privacy && (
          <Link href="/frameworks?fw=au_privacy_act" className="pp-card mw-card-link">
            <div className="pp-card__header">
              <h2 className="pp-card__title">Privacy Act (POLA 2024)</h2>
              <span className="pp-badge">{privacy.readinessPercentage}%</span>
            </div>
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-muted">
                {privacy.metCount}/{privacy.totalRequirements} in-force obligations met
              </div>
              <div className="mw-faint">
                {admDeadline
                  ? `ADM (APP 1.7–1.9) commences 10 Dec 2026 (${admDeadline.daysRemaining > 0 ? `${admDeadline.daysRemaining}d left` : "in force"})`
                  : "APPs 1–13 & Part IIIC NDB scheme"}
              </div>
            </div>
          </Link>
        )}
        {cyberAct && (
          <Link href="/frameworks?fw=au_cyber_security_act_2024" className="pp-card mw-card-link">
            <div className="pp-card__header">
              <h2 className="pp-card__title">Cyber Security Act 2024</h2>
              <span className="pp-badge">{cyberAct.readinessPercentage}%</span>
            </div>
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-muted">
                {cyberAct.metCount}/{cyberAct.totalRequirements} statutory duties met
              </div>
              <div className="mw-faint">
                72h ransomware reporting (May 2025) &amp; IoT Rules (Mar 2026)
              </div>
            </div>
          </Link>
        )}
        <Link href="/audit?tab=soa" className="pp-card mw-card-link">
          <div className="pp-card__header">
            <h2 className="pp-card__title">ISO 27001 Amd 1:2024</h2>
            <span
              className={`pp-status ${stats.climateChangeRelevant === "Undetermined" ? "pp-status--warn" : "pp-status--ok"}`}
            >
              {stats.climateChangeRelevant === "Undetermined"
                ? "Action Needed"
                : stats.climateChangeRelevant}
            </span>
          </div>
          <div className="pp-card__body mw-stack mw-stack--sm">
            <div className="mw-muted">
              Climate change relevance (Clauses 4.1 &amp; 4.2) &amp; Clause 6.3
            </div>
            <div className="mw-faint">Record determination in Audit &amp; SoA or Control RQ4</div>
          </div>
        </Link>
      </div>

      {/* ISMS Governance & Cross-Framework Drift Snapshot */}
      {gov && (
        <div className="mw-kpi-grid">
          <Link href="/governance?tab=risks" className="pp-card mw-card-link">
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-row mw-row--between">
                <span className="pp-overline">Risk Register</span>
                {gov.highOpenRisks > 0 && (
                  <span className="pp-status pp-status--err">{gov.highOpenRisks} high</span>
                )}
              </div>
              <div className="pp-stat">{gov.totalRisks}</div>
              <div className="mw-faint">ISO Clauses 6.1.2 / 6.1.3 &amp; RTP</div>
            </div>
          </Link>
          <Link href="/governance?tab=capa" className="pp-card mw-card-link">
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-row mw-row--between">
                <span className="pp-overline">Open CAPA &amp; Audits</span>
                {gov.overdueCapas > 0 && (
                  <span className="pp-status pp-status--err">{gov.overdueCapas} overdue</span>
                )}
              </div>
              <div className="pp-stat">{gov.openCapas}</div>
              <div className="mw-faint">
                {gov.totalReviews} internal audit / mgmt review records
              </div>
            </div>
          </Link>
          <Link href="/governance?tab=vendors" className="pp-card mw-card-link">
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-row mw-row--between">
                <span className="pp-overline">Vendors &amp; CPS 230</span>
                {gov.mspMissingExitPlan > 0 && (
                  <span className="pp-status pp-status--warn">
                    {gov.mspMissingExitPlan} no exit plan
                  </span>
                )}
              </div>
              <div className="pp-stat">{gov.totalVendors}</div>
              <div className="mw-faint">
                {gov.materialServiceProviders} Material Service Providers · {gov.totalPolicies}{" "}
                policies
              </div>
            </div>
          </Link>
          <Link
            href={totalDriftAlerts > 0 ? "/frameworks" : "/governance?tab=incidents"}
            className="pp-card mw-card-link"
          >
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-row mw-row--between">
                <span className="pp-overline">
                  {totalDriftAlerts > 0 ? "Cross-Framework Drift" : "Incidents & Breach Clocks"}
                </span>
                <span
                  className={
                    totalDriftAlerts > 0 || gov.activeIncidents > 0
                      ? "pp-status pp-status--err"
                      : "pp-status pp-status--ok"
                  }
                >
                  {totalDriftAlerts > 0
                    ? `${totalDriftAlerts} alert${totalDriftAlerts === 1 ? "" : "s"}`
                    : gov.activeIncidents > 0
                      ? `${gov.activeIncidents} active`
                      : "Clear"}
                </span>
              </div>
              <div className="pp-stat">
                {totalDriftAlerts > 0 ? totalDriftAlerts : gov.activeIncidents}
              </div>
              <div className="mw-faint">
                {totalDriftAlerts > 0
                  ? "AU requirements disagree with linked ISO controls"
                  : "72h ASD · 30d NDB · CPS 234/230 · SOCI clocks"}
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* First-Run Guided Onboarding (dismissible) */}
      {showOnboarding && (
        <section className="pp-card" aria-label="Getting started">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Getting Started</h2>
            <div className="mw-row">
              <span className="pp-card__meta">
                {onboardingSteps.filter((s) => s.done).length} of {onboardingSteps.length} complete
              </span>
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={() => dismissOnboarding.mutate()}
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="pp-card__body mw-stack mw-stack--sm">
            {onboardingSteps.map((step) => (
              <div key={step.title} className="mw-check-row">
                <div className="mw-row">
                  <Icon name={step.done ? "circle-check" : "circle-alert"} className="pp-icon" />
                  <div>
                    <div style={{ fontWeight: 500 }}>{step.title}</div>
                    <div className="mw-muted">{step.desc}</div>
                  </div>
                </div>
                {step.done ? (
                  <span className="pp-status pp-status--ok">Done</span>
                ) : (
                  <Link href={step.href} className="pp-button pp-button--sm">
                    {step.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Band 2: Priority Focus & Due Soon + Compliance by Domain */}
      <div className="mw-two-col">
        <section className="pp-card" aria-label="Priority controls">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Priority Focus</h2>
            <Link href="/controls?urgency=now" className="mw-table-link mw-faint">
              Now ({stats.urgencySummary.now.open}) · Next ({stats.urgencySummary.next.open})
            </Link>
          </div>
          <div className="pp-card__body">
            {stats.urgencyBoard.now.length === 0 && stats.urgencyBoard.next.length === 0 ? (
              <div className="pp-state">
                <div className="pp-state__title">No urgent controls flagged</div>
                <div className="pp-state__text">
                  Flag high-priority controls as Now or Next from the Statement of Applicability.
                </div>
                <Link href="/audit" className="pp-button pp-button--sm">
                  Open Statement of Applicability
                </Link>
              </div>
            ) : (
              <div className="mw-stack mw-stack--sm">
                {[...stats.urgencyBoard.now, ...stats.urgencyBoard.next].slice(0, 8).map((item) => (
                  <div key={item.controlNumber} className="mw-action-row">
                    <div className="mw-stack" style={{ gap: 2 }}>
                      <Link
                        href={`/controls/${encodeURIComponent(item.controlNumber)}`}
                        className="mw-table-link"
                      >
                        <span className="mw-mono">{item.controlNumber}</span> {item.controlName}
                      </Link>
                      <span className="mw-faint">
                        {item.questionnaireProgress.answered}/{item.questionnaireProgress.total}{" "}
                        questions
                        {item.dueDate ? ` · Due ${formatShortDate(item.dueDate)}` : ""}
                      </span>
                    </div>
                    <div className="mw-row">
                      <UrgencyBadge urgency={item.selectedUrgency} />
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="pp-card" aria-label="Upcoming and overdue reviews">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Due Soon &amp; Overdue</h2>
            <span className="pp-card__meta">Next 45 days</span>
          </div>
          <div className="pp-card__body">
            {stats.dueSoon.length === 0 ? (
              <div className="pp-state">
                <div className="pp-state__title">No controls due in the next 45 days</div>
                <div className="pp-state__text">
                  Adjust review frequency or Australian financial year start quarters in Settings →
                  Schedule &amp; Display.
                </div>
              </div>
            ) : (
              <div>
                {stats.dueSoon.slice(0, 8).map((item) => (
                  <div key={item.controlNumber} className="mw-action-row">
                    <div className="mw-stack" style={{ gap: 2 }}>
                      <Link
                        href={`/controls/${encodeURIComponent(item.controlNumber)}`}
                        className="mw-table-link"
                      >
                        <span className="mw-mono">{item.controlNumber}</span> {item.controlName}
                      </Link>
                      <span className="mw-faint">
                        Due {formatShortDate(item.dueDate)}
                        {item.lastTested
                          ? ` · Last tested ${formatShortDate(item.lastTested)}`
                          : " · Never tested"}
                      </span>
                    </div>
                    <span
                      className={`pp-status ${item.daysUntilDue < 0 ? "pp-status--err" : "pp-status--warn"}`}
                    >
                      {item.daysUntilDue < 0
                        ? `${Math.abs(item.daysUntilDue)}d overdue`
                        : `${item.daysUntilDue}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Band 3: Compliance by Domain, Action Items & Recent Test Runs */}
      <div className="mw-two-col">
        <section className="pp-card" aria-label="Compliance by domain">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Compliance by Domain</h2>
            <span className="pp-card__meta">ISO 27001:2022</span>
          </div>
          <div className="pp-card__body mw-stack">
            {stats.categoryBreakdown.map((cat) => {
              const pct = cat.total > 0 ? Math.round((cat.passed / cat.total) * 100) : 0;
              return (
                <div key={cat.categoryId} className="mw-cat-row">
                  <div className="mw-row mw-row--between">
                    <Link href={`/controls?category=${cat.categoryId}`} className="mw-table-link">
                      {cat.categoryName}
                    </Link>
                    <span className="mw-faint mw-mono">
                      {cat.passed}/{cat.total} ({pct}%)
                    </span>
                  </div>
                  <progress
                    className="pp-progress"
                    value={pct}
                    max={100}
                    aria-label={`${cat.categoryName} compliance ${pct}%`}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="pp-card" aria-label="Action items">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Action Items</h2>
            <span className="pp-card__meta">
              {actionItems.filter((a) => !a.doneAt).length} open
            </span>
          </div>
          <div className="pp-card__body mw-stack">
            <form
              className="mw-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (newAction.trim()) addAction.mutate(newAction.trim());
              }}
            >
              <input
                type="text"
                className="pp-input pp-input--sm"
                placeholder="Add a follow-up action…"
                aria-label="New action item"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={!newAction.trim() || addAction.isPending}
              >
                <Icon name="plus" />
                <span>Add</span>
              </button>
            </form>

            {actionItems.length === 0 ? (
              <p className="mw-muted">No action items yet.</p>
            ) : (
              <div>
                {actionItems.map((item) => {
                  const isEditing = editingActionId === item.id;
                  return (
                    <div key={item.id} className="mw-action-row">
                      {isEditing ? (
                        <form
                          className="mw-row"
                          style={{ flex: 1 }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (editingActionTitle.trim()) {
                              updateAction.mutate({
                                id: item.id,
                                patch: { title: editingActionTitle.trim() },
                              });
                            }
                          }}
                        >
                          <input
                            type="text"
                            className="pp-input pp-input--sm"
                            aria-label="Edit action item title"
                            value={editingActionTitle}
                            onChange={(e) => setEditingActionTitle(e.target.value)}
                            style={{ flex: 1 }}
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="pp-button pp-button--primary pp-button--sm"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="pp-button pp-button--ghost pp-button--sm"
                            onClick={() => setEditingActionId(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <label className="pp-check">
                            <input
                              type="checkbox"
                              checked={Boolean(item.doneAt)}
                              onChange={(e) =>
                                updateAction.mutate({
                                  id: item.id,
                                  patch: { done: e.target.checked },
                                })
                              }
                            />
                            <span className={item.doneAt ? "mw-action-row__done" : ""}>
                              {item.title}
                            </span>
                          </label>
                          <div className="mw-row">
                            <button
                              type="button"
                              className="pp-icon-button pp-icon-button--compact"
                              aria-label={`Edit action item ${item.title}`}
                              onClick={() => {
                                setEditingActionId(item.id);
                                setEditingActionTitle(item.title);
                              }}
                            >
                              <Icon name="pencil" />
                            </button>
                            <button
                              type="button"
                              className="pp-icon-button pp-icon-button--compact"
                              aria-label={`Delete action item ${item.title}`}
                              onClick={() => deleteAction.mutate(item.id)}
                            >
                              <Icon name="trash-2" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Band 4: Recent Test Runs */}
      <section className="pp-card" aria-label="Recent test runs">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Recent Test Runs</h2>
          <Link href="/audit?tab=runs" className="mw-table-link mw-faint">
            Full Audit Trail
          </Link>
        </div>
        <div className="pp-card__body">
          {stats.recentTestRuns.length === 0 ? (
            <div className="pp-state">
              <div className="pp-state__title">No test runs recorded yet</div>
              <div className="pp-state__text">
                Open any control to record your first immutable compliance test.
              </div>
              <Link href="/controls" className="pp-button pp-button--sm">
                Go to Controls
              </Link>
            </div>
          ) : (
            <div>
              {stats.recentTestRuns.slice(0, 6).map((run) => (
                <div key={run.id} className="mw-action-row">
                  <div className="mw-stack" style={{ gap: 2 }}>
                    <Link
                      href={`/controls/${encodeURIComponent(run.controlNumber)}`}
                      className="mw-table-link"
                    >
                      <span className="mw-mono">{run.controlNumber}</span> {run.controlName}
                    </Link>
                    <span className="mw-faint">{formatShortDate(run.testDate)}</span>
                  </div>
                  <StatusBadge status={run.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
