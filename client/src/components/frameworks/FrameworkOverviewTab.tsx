import type { FrameworkSummary } from "@shared/schema";
import { Link } from "wouter";
import { formatShortDate } from "@/components/PaperUi";

interface FrameworkOverviewTabProps {
  frameworks: FrameworkSummary[];
  onToggleFramework: (code: string, enabled: boolean) => void;
  onSelectFramework: (code: string) => void;
}

export function FrameworkOverviewTab({
  frameworks,
  onToggleFramework,
  onSelectFramework,
}: FrameworkOverviewTabProps) {
  return (
    <div className="mw-stack">
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Honest Framework Support Tiers &amp; Provenance</h2>
          <span className="pp-card__meta">
            All Australian &amp; international instruments verified Nov 2026
          </span>
        </div>
        <div className="pp-table-scroll">
          <table className="pp-table pp-table--compact">
            <thead>
              <tr>
                <th>Framework &amp; Instrument</th>
                <th>Jurisdiction</th>
                <th>Support Tier</th>
                <th>Enabled</th>
                <th>Coverage / Progress</th>
              </tr>
            </thead>
            <tbody>
              {frameworks.map((f) => (
                <tr key={f.code}>
                  <td>
                    <div className="mw-stack" style={{ gap: 2 }}>
                      <span style={{ fontWeight: 500 }}>{f.name}</span>
                      <span className="mw-faint">{f.description}</span>
                      <div className="mw-row mw-row--wrap" style={{ gap: 8 }}>
                        {f.instrumentId && (
                          <span className="mw-faint mw-mono">{f.instrumentId}</span>
                        )}
                        {f.effectiveDate && (
                          <span className="mw-faint">
                            Effective {formatShortDate(f.effectiveDate)}
                          </span>
                        )}
                        {f.sourceUrl && (
                          <a
                            href={f.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mw-table-link mw-faint"
                          >
                            Official source ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="mw-nowrap mw-faint">{f.jurisdiction}</td>
                  <td className="mw-nowrap">
                    {f.supportTier === "full" ? (
                      <span className="pp-status pp-status--ok">First-Class Engine</span>
                    ) : f.supportTier === "cross_mapped" ? (
                      <span className="pp-badge pp-badge--accent">ISO Cross-Mapped</span>
                    ) : (
                      <span className="pp-badge">AI Prompt Context Only</span>
                    )}
                  </td>
                  <td>
                    <label className="pp-check">
                      <input
                        type="checkbox"
                        className="pp-switch"
                        role="switch"
                        aria-checked={f.enabled}
                        aria-label={`Toggle ${f.name}`}
                        disabled={f.code === "iso27001_2022"}
                        checked={f.enabled}
                        onChange={(e) => onToggleFramework(f.code, e.target.checked)}
                      />
                    </label>
                  </td>
                  <td className="mw-nowrap">
                    {f.code === "iso27001_2022" ? (
                      <Link href="/controls" className="mw-table-link">
                        100 controls · 506 Qs
                      </Link>
                    ) : f.supportTier === "full" ? (
                      <>
                        <button
                          type="button"
                          className="pp-button pp-button--ghost pp-button--sm"
                          onClick={() => onSelectFramework(f.code)}
                        >
                          {f.code === "acsc_e8_2023"
                            ? `${f.weakestLinkMaturity || "ML0"} (${f.metCount}/${f.totalRequirements})`
                            : `${f.readinessPercentage}% (${f.metCount}/${f.totalRequirements}${f.draftCount > 0 ? ` + ${f.draftCount} draft` : ""})`}
                        </button>
                        {f.driftCount > 0 && (
                          <span
                            className="pp-status pp-status--err"
                            style={{ marginLeft: 6 }}
                            title="Cross-framework drift against linked ISO 27001 controls"
                          >
                            {f.driftCount} drift
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="mw-faint">Advisory AI prompt tag only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
