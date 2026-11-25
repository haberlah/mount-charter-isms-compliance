import type { AiInteraction } from "@shared/schema";
import { formatDateTime } from "@/components/PaperUi";

interface AiActivityTabProps {
  aiData:
    | {
        interactions: AiInteraction[];
        tokensUsedToday: number;
        dailyBudget: number;
      }
    | undefined;
}

export function AiActivityTab({ aiData }: AiActivityTabProps) {
  return (
    <div className="mw-stack">
      {aiData && (
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
      )}

      <div className="pp-card">
        <div className="pp-table-scroll" tabIndex={0} role="region" aria-label="AI activity log">
          <table className="pp-table pp-table--compact">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Control</th>
                <th>Model</th>
                <th>Summary</th>
                <th className="pp-table__num">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {!aiData || aiData.interactions.length === 0 ? (
                <tr className="pp-table__empty">
                  <td colSpan={6}>No AI interactions recorded yet.</td>
                </tr>
              ) : (
                aiData.interactions.map((row) => (
                  <tr key={row.id}>
                    <td className="mw-faint mw-mono mw-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <span className="pp-badge">{row.interactionType}</span>
                    </td>
                    <td className="mw-mono mw-nowrap">{row.controlNumber || "—"}</td>
                    <td className="mw-mono mw-faint mw-nowrap">{row.modelUsed}</td>
                    <td className="mw-muted">{row.outputSummary || row.inputSummary || "—"}</td>
                    <td className="pp-table__num mw-mono">{row.tokensUsed.toLocaleString()}</td>
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
