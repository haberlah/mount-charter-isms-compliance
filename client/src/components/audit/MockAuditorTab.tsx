import type { MockAuditDossier } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { apiRequest, invalidateWorkspaceQueries, postSseStream, showToast } from "@/lib/api";

interface PreScanCheck {
  code: string;
  severity: "MajorNC" | "MinorNC" | "OFI";
  detail: string;
}

export function MockAuditorTab() {
  const [dossier, setDossier] = useState<MockAuditDossier | null>(null);
  const [running, setRunning] = useState<{
    step: number;
    totalSteps: number;
    message: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: preScan, refetch: refetchPreScan } = useQuery<{ checks: PreScanCheck[] }>({
    queryKey: ["audit-prescan"],
    queryFn: () => apiRequest("GET", "/api/agent/audit-prescan"),
  });

  const runMockAudit = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning({ step: 1, totalSteps: 3, message: "Scanning workspace ISMS graph…" });

    try {
      await postSseStream(
        "/api/agent/mock-auditor",
        { stageProposals: true },
        {
          signal: ac.signal,
          onEvent: (event, data) => {
            const payload = (data || {}) as Record<string, unknown>;
            if (event === "progress") {
              setRunning({
                step: Number(payload.step || 1),
                totalSteps: Number(payload.totalSteps || 3),
                message: String(payload.message || "Auditing…"),
              });
            } else if (event === "complete") {
              const result = data as MockAuditDossier;
              setDossier(result);
              setRunning(null);
              void invalidateWorkspaceQueries();
              void refetchPreScan();
              showToast(
                `Mock audit complete: ${result.findings.length} finding(s), ${result.stagedProposalCount} CAPA proposal(s) staged`,
                { tone: "ok" },
              );
            } else if (event === "error") {
              setRunning(null);
              showToast(String(payload.error || "Mock audit failed"), { tone: "err" });
            }
          },
        },
      );
    } catch (err) {
      setRunning(null);
      if (!ac.signal.aborted) {
        showToast(err instanceof Error ? err.message : "Mock audit failed", { tone: "err" });
      }
    }
  };

  const checks = preScan?.checks || [];
  const majorPreCount = checks.filter((c) => c.severity === "MajorNC").length;

  return (
    <div className="mw-stack">
      <div className="pp-card">
        <div className="pp-card__header">
          <div>
            <h2 className="pp-card__title">Hostile Stage 1 / Stage 2 Mock Lead Auditor</h2>
            <div className="mw-faint">
              Hunts cross-register contradictions across your Statement of Applicability, Risks,
              Policies, Vendors, CAPAs, Australian frameworks, and uploaded evidence before a real
              certification auditor does. All CAPAs are staged as uncommitted proposals.
            </div>
          </div>
          <div className="mw-row">
            {running ? (
              <button
                type="button"
                className="pp-button pp-button--sm"
                onClick={() => {
                  abortRef.current?.abort();
                  setRunning(null);
                }}
              >
                Stop Audit
              </button>
            ) : (
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                onClick={() => void runMockAudit()}
              >
                Run Mock Stage 1 / Stage 2 Audit
              </button>
            )}
          </div>
        </div>

        <div className="pp-card__body mw-stack">
          {running && (
            <div className="mw-run-strip" role="status" aria-live="polite">
              <div className="mw-row">
                <span className="mw-run-strip__dot" aria-hidden="true" />
                <strong style={{ fontSize: 13 }}>
                  Step {running.step}/{running.totalSteps}: {running.message}
                </strong>
              </div>
            </div>
          )}

          <div className="mw-stack mw-stack--sm">
            <div className="mw-row mw-row--between">
              <strong style={{ fontSize: 13.5 }}>
                Instant Structural Pre-Scan ({checks.length} item{checks.length === 1 ? "" : "s"} ·
                zero tokens)
              </strong>
              <span
                className={
                  majorPreCount > 0
                    ? "pp-status pp-status--err"
                    : checks.length > 0
                      ? "pp-status pp-status--warn"
                      : "pp-status pp-status--ok"
                }
              >
                {majorPreCount > 0
                  ? `${majorPreCount} Major NC blocker(s)`
                  : checks.length > 0
                    ? `${checks.length} Minor / OFI`
                    : "Structural checks clear"}
              </span>
            </div>

            {checks.length === 0 ? (
              <div className="mw-faint">
                No deterministic ISO 27001 / CPS 230 / cross-framework structural blockers found.
                Run the AI Mock Lead Auditor above to check semantic policy-vs-practice
                contradictions.
              </div>
            ) : (
              checks.map((c) => (
                <div key={c.code} className="mw-check-row">
                  <div className="mw-stack" style={{ gap: 2 }}>
                    <div className="mw-row">
                      <span
                        className={
                          c.severity === "MajorNC"
                            ? "pp-status pp-status--err"
                            : c.severity === "MinorNC"
                              ? "pp-status pp-status--warn"
                              : "pp-badge"
                        }
                      >
                        {c.severity}
                      </span>
                      <span className="mw-mono mw-faint">{c.code}</span>
                    </div>
                    <div className="mw-muted">{c.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {dossier && (
        <div className="pp-card">
          <div className="pp-card__header">
            <div>
              <h2 className="pp-card__title">Mock Lead Auditor Findings Dossier</h2>
              <div className="mw-faint mw-mono">
                Model: {dossier.modelUsed} ({dossier.provider}) ·{" "}
                {dossier.tokensUsed.toLocaleString()} tok
                {dossier.costUsd > 0 ? ` · $${dossier.costUsd.toFixed(4)} USD` : ""}
              </div>
            </div>
            <span
              className={
                dossier.readinessVerdict === "Audit Ready"
                  ? "pp-status pp-status--ok"
                  : dossier.readinessVerdict.startsWith("Conditional")
                    ? "pp-status pp-status--warn"
                    : "pp-status pp-status--err"
              }
            >
              {dossier.readinessVerdict}
            </span>
          </div>

          <div className="pp-card__body mw-stack">
            <p className="pp-prose" style={{ margin: 0 }}>
              {dossier.executiveSummary}
            </p>

            {dossier.stagedProposalCount > 0 && (
              <div className="mw-bulk-bar">
                <span>
                  Staged <strong>{dossier.stagedProposalCount} CAPA proposal(s)</strong> as
                  uncommitted drafts — nothing has been written to your registers yet.
                </span>
                <Link
                  href="/evidence?tab=queue"
                  className="pp-button pp-button--primary pp-button--sm"
                >
                  Review in Proposal Inbox →
                </Link>
              </div>
            )}

            {dossier.findings.map((f, idx) => (
              <article key={`${f.title}-${idx}`} className="mw-proposal-card">
                <div className="mw-row mw-row--between mw-row--wrap">
                  <div className="mw-row mw-row--wrap">
                    <span
                      className={
                        f.severity === "MajorNC"
                          ? "pp-status pp-status--err"
                          : f.severity === "MinorNC"
                            ? "pp-status pp-status--warn"
                            : "pp-badge"
                      }
                    >
                      {f.severity}
                    </span>
                    <span className="pp-badge">{f.stage}</span>
                    <strong>{f.title}</strong>
                  </div>
                  <div className="mw-chip-group">
                    {f.citations.map((c) => (
                      <span key={c} className="pp-badge mw-mono">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mw-muted">
                  <strong>Contradiction:</strong> {f.contradiction}
                </div>
                <div className="pp-prose">
                  <strong>Remediation:</strong> {f.remediation}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
