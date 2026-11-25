import type { AiInteraction } from "@shared/schema";
import { formatDateTime } from "@/components/PaperUi";

interface AiActivityTabProps {
  aiData:
    | {
        interactions: AiInteraction[];
        tokensUsedToday: number;
        dailyBudget: number;
        costUsedTodayUsd?: number;
        dailyCostBudgetUsd?: number;
      }
    | undefined;
}

export function AiActivityTab({ aiData }: AiActivityTabProps) {
  const costToday = aiData?.costUsedTodayUsd ?? 0;
  const costBudget = aiData?.dailyCostBudgetUsd ?? 5.0;

  return (
    <div className="mw-stack">
      {aiData && (
        <div className="mw-two-col">
          <div className="pp-card">
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-row mw-row--between">
                <span style={{ fontWeight: 500 }}>Daily AI Spend (USD)</span>
                <span className="mw-mono mw-faint">
                  ${costToday.toFixed(4)} / ${costBudget.toFixed(2)} USD
                </span>
              </div>
              <progress
                className="pp-progress"
                value={Math.min(costToday, costBudget)}
                max={costBudget}
                aria-label="Daily AI spend in USD"
              />
            </div>
          </div>

          <div className="pp-card">
            <div className="pp-card__body mw-stack mw-stack--sm">
              <div className="mw-row mw-row--between">
                <span style={{ fontWeight: 500 }}>Daily AI Token Usage</span>
                <span className="mw-mono mw-faint">
                  {aiData.tokensUsedToday.toLocaleString()} / {aiData.dailyBudget.toLocaleString()}{" "}
                  tokens
                </span>
              </div>
              <progress
                className="pp-progress"
                value={Math.min(aiData.tokensUsedToday, aiData.dailyBudget)}
                max={aiData.dailyBudget}
                aria-label="Daily AI token usage"
              />
            </div>
          </div>
        </div>
      )}

      <div className="pp-card">
        <div className="pp-table-scroll" tabIndex={0} role="region" aria-label="AI activity log">
          <table className="pp-table pp-table--compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Control</th>
                <th>Provider / Model</th>
                <th>Summary</th>
                <th className="pp-table__num">Tokens</th>
                <th className="pp-table__num">Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {!aiData || aiData.interactions.length === 0 ? (
                <tr className="pp-table__empty">
                  <td colSpan={7}>No AI interactions recorded yet.</td>
                </tr>
              ) : (
                aiData.interactions.map((row) => (
                  <tr key={row.id}>
                    <td className="mw-faint mw-mono mw-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <span className="pp-badge">{row.interactionType}</span>
                    </td>
                    <td className="mw-mono mw-nowrap">{row.controlNumber || "—"}</td>
                    <td className="mw-mono mw-faint mw-nowrap">
                      {row.provider ? `${row.provider} · ` : ""}
                      {row.modelUsed}
                    </td>
                    <td className="mw-muted">{row.outputSummary || row.inputSummary || "—"}</td>
                    <td className="pp-table__num mw-mono">{row.tokensUsed.toLocaleString()}</td>
                    <td className="pp-table__num mw-mono mw-nowrap">
                      {row.costUsd && row.costUsd > 0 ? `$${row.costUsd.toFixed(4)}` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
