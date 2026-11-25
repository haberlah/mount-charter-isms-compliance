import type { ControlDetailResponse } from "@shared/schema";
import { useState } from "react";
import { AiAnalysisCard, formatShortDate, Icon, StatusBadge } from "@/components/PaperUi";

interface TestHistoryTabProps {
  detail: ControlDetailResponse;
  onOpenRecordTest: () => void;
}

export function TestHistoryTab({ detail, onOpenRecordTest }: TestHistoryTabProps) {
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  return (
    <div className="pp-card">
      <div className="pp-card__header">
        <h2 className="pp-card__title">Immutable Test History</h2>
        <button type="button" className="pp-button pp-button--sm" onClick={onOpenRecordTest}>
          <Icon name="plus" />
          <span>Record Test</span>
        </button>
      </div>
      <div className="pp-card__body mw-stack">
        {detail.testRuns.length === 0 ? (
          <div className="pp-state">
            <div className="pp-state__title">No test runs yet</div>
            <div className="pp-state__text">
              Test runs are append-only and enforced immutable at the SQLite layer.
            </div>
          </div>
        ) : (
          detail.testRuns.map((run) => {
            const expanded = expandedRunId === run.id;
            const runLinks = detail.evidenceLinks.filter((l) => l.testRunId === run.id);
            const hasExpandable =
              Boolean(run.aiAnalysis) ||
              Boolean(run.comments && run.comments.length > 180) ||
              runLinks.length > 0;

            return (
              <div key={run.id} className="mw-question-card">
                <div className="mw-row mw-row--between mw-row--wrap">
                  <div className="mw-row">
                    <StatusBadge status={run.status} />
                    <span className="mw-mono mw-faint">{formatShortDate(run.testDate)}</span>
                    {run.aiConfidence != null && (
                      <span className="pp-badge pp-badge--accent">
                        AI {Math.round(run.aiConfidence * 100)}%
                      </span>
                    )}
                  </div>
                  {hasExpandable && (
                    <button
                      type="button"
                      className="pp-button pp-button--ghost pp-button--sm"
                      aria-expanded={expanded}
                      onClick={() => setExpandedRunId(expanded ? null : run.id)}
                    >
                      {expanded ? "Collapse" : "View Full Record"}
                    </button>
                  )}
                </div>

                {run.comments && (
                  <div className="mw-muted pp-prose">
                    {expanded ? run.comments : run.comments.slice(0, 180)}
                  </div>
                )}

                {expanded && runLinks.length > 0 && (
                  <div className="mw-stack mw-stack--sm">
                    <strong style={{ fontSize: "var(--paper-size-secondary)" }}>
                      Test Run Evidence Links
                    </strong>
                    {runLinks.map((rl) => (
                      <div key={rl.id} className="mw-faint">
                        {rl.url ? (
                          <a
                            href={rl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mw-table-link"
                          >
                            {rl.title}
                          </a>
                        ) : (
                          rl.title
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
    </div>
  );
}
