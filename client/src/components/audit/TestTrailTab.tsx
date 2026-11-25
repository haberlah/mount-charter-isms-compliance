import type { TestRunWithControl } from "@shared/schema";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AiAnalysisCard, formatDateTime, Icon, StatusBadge } from "@/components/PaperUi";

interface TestTrailTabProps {
  testRuns: TestRunWithControl[];
}

export function TestTrailTab({ testRuns }: TestTrailTabProps) {
  const [runSearch, setRunSearch] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState("all");
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const filteredRuns = useMemo(() => {
    const q = runSearch.trim().toLowerCase();
    return testRuns.filter((r) => {
      if (runStatusFilter !== "all" && r.status !== runStatusFilter) return false;
      if (!q) return true;
      return `${r.controlNumber} ${r.controlName} ${r.status} ${r.comments || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [testRuns, runSearch, runStatusFilter]);

  return (
    <div className="mw-stack">
      <div className="pp-filter-bar mw-filter-bar">
        <div className="pp-search">
          <Icon name="search" className="pp-icon pp-search__icon" />
          <input
            type="search"
            className="pp-search__input"
            placeholder="Filter test runs by control, status, or notes…"
            aria-label="Filter test runs"
            value={runSearch}
            onChange={(e) => setRunSearch(e.target.value)}
          />
        </div>
        <select
          className="pp-select pp-select--sm"
          aria-label="Filter test runs by status"
          value={runStatusFilter}
          onChange={(e) => setRunStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="Pass">Pass</option>
          <option value="PassPrevious">Pass (Previous)</option>
          <option value="ContinualImprovement">Improvement</option>
          <option value="Fail">Fail</option>
          <option value="Blocked">Blocked</option>
          <option value="NotAttempted">Not Attempted</option>
        </select>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="pp-state">
          <div className="pp-state__title">No test runs recorded</div>
          <div className="pp-state__text">
            Recorded control tests appear here as an append-only audit trail.
          </div>
        </div>
      ) : (
        filteredRuns.map((run) => {
          const expanded = expandedRunId === run.id;
          const hasExpandable =
            Boolean(run.aiAnalysis) ||
            Boolean(run.comments && run.comments.length > 180) ||
            Boolean(run.evidenceLinks && run.evidenceLinks.length > 0);
          return (
            <div key={run.id} className="mw-question-card">
              <div className="mw-row mw-row--between mw-row--wrap">
                <div className="mw-row mw-row--wrap">
                  <Link
                    href={`/controls/${encodeURIComponent(run.controlNumber)}`}
                    className="mw-table-link mw-mono"
                  >
                    {run.controlNumber}
                  </Link>
                  <span>{run.controlName}</span>
                  <StatusBadge status={run.status} />
                </div>
                <div className="mw-row">
                  <span className="mw-faint mw-mono">{formatDateTime(run.testDate)}</span>
                  {hasExpandable && (
                    <button
                      type="button"
                      className="pp-button pp-button--ghost pp-button--sm"
                      aria-expanded={expanded}
                      onClick={() => setExpandedRunId(expanded ? null : run.id)}
                    >
                      {expanded ? "Hide Details" : "Inspect"}
                    </button>
                  )}
                </div>
              </div>
              {run.comments && (
                <div className="mw-muted pp-prose">
                  {expanded ? run.comments : run.comments.slice(0, 180)}
                </div>
              )}
              {expanded && run.evidenceLinks && run.evidenceLinks.length > 0 && (
                <div className="mw-stack mw-stack--sm">
                  <strong style={{ fontSize: "var(--paper-size-secondary)" }}>
                    Attached Evidence
                  </strong>
                  {run.evidenceLinks.map((el) => (
                    <div key={el.id} className="mw-faint">
                      {el.url ? (
                        <a
                          href={el.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mw-table-link"
                        >
                          {el.title}
                        </a>
                      ) : (
                        el.title
                      )}
                    </div>
                  ))}
                </div>
              )}
              {expanded && run.aiAnalysis && <AiAnalysisCard raw={run.aiAnalysis} />}
            </div>
          );
        })
      )}
    </div>
  );
}
