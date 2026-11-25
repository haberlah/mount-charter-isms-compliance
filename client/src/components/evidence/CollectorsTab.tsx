import type { CollectorInfo, CollectorRunResult } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

export function CollectorsTab({ onCaptured }: { onCaptured: () => void }) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CollectorRunResult | null>(null);

  const { data: collectors = [], isLoading } = useQuery<CollectorInfo[]>({
    queryKey: ["collectors"],
    queryFn: () => apiRequest<CollectorInfo[]>("GET", "/api/collectors"),
  });

  const run = async (c: CollectorInfo) => {
    setRunningId(c.id);
    try {
      const res = await apiRequest<CollectorRunResult>(
        "POST",
        `/api/collectors/${encodeURIComponent(c.id)}/run`,
      );
      setLastResult(res);
      await invalidateWorkspaceQueries();
      showToast(
        `Captured "${res.title}" → linked to ${res.linkedControls.length} ISO controls & ${res.linkedRequirements.length} AU requirements`,
        { tone: "ok" },
      );
      onCaptured();
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="mw-stack">
      <div className="pp-banner pp-banner--info" role="note">
        <div className="pp-banner__body">
          <div className="pp-banner__title">Opt-In Local Read-Only CLI Evidence Collectors</div>
          <div className="pp-banner__text">
            Collectors run strictly allowlisted, read-only local diagnostic commands on your Mac
            using your existing signed-in CLI sessions (never modifying infrastructure or storing
            cloud credentials). Captured Markdown snapshots are SHA-256 hashed, saved to the
            Evidence Library, and automatically linked to ISO 27001 controls and Australian
            framework requirements.
          </div>
        </div>
      </div>

      {lastResult && (
        <div className="mw-match-card">
          <div className="mw-row mw-row--between mw-row--wrap">
            <strong>Last Capture: {lastResult.title}</strong>
            <span className="pp-status pp-status--ok">Saved &amp; Linked</span>
          </div>
          <div className="mw-faint">
            Linked ISO Controls: {lastResult.linkedControls.join(", ") || "—"} · Linked AU
            Requirements: {lastResult.linkedRequirements.join(", ") || "—"}
          </div>
          <div className="pp-prose">{lastResult.summary}</div>
        </div>
      )}

      {isLoading ? (
        <p className="mw-muted">Probing local CLI availability…</p>
      ) : (
        <div className="mw-form-grid">
          {collectors.map((c) => (
            <div
              key={c.id}
              className="pp-card"
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div className="pp-card__header">
                <div style={{ minWidth: 0 }}>
                  <div className="pp-card__title">{c.name}</div>
                  <div className="mw-faint">{c.category}</div>
                </div>
                <span
                  className={`mw-nowrap ${c.available ? "pp-status pp-status--ok" : "pp-badge"}`}
                  title={c.statusNote}
                >
                  {c.available ? "Ready" : "Unavailable"}
                </span>
              </div>
              <div className="pp-card__body mw-stack mw-stack--sm" style={{ flex: 1 }}>
                <p className="mw-muted" style={{ margin: 0 }}>
                  {c.description}
                </p>
                <div className="mw-chip-group">
                  {c.mappedControls.map((cn) => (
                    <span key={cn} className="pp-badge mw-mono">
                      ISO {cn}
                    </span>
                  ))}
                  {c.mappedFrameworks.map((req) => (
                    <span key={req.reqCode} className="pp-badge pp-badge--accent mw-mono">
                      {req.reqCode}
                    </span>
                  ))}
                </div>
                <div className="mw-faint">{c.statusNote}</div>
                <div>
                  <button
                    type="button"
                    className="pp-button pp-button--primary pp-button--sm"
                    disabled={!c.available || runningId !== null}
                    onClick={() => void run(c)}
                  >
                    <Icon name="clipboard-check" />
                    <span>
                      {runningId === c.id ? "Collecting Evidence…" : "Capture Evidence Snapshot"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
