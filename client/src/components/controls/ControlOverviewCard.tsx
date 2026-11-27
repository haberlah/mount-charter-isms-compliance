import { parseApraRefs } from "@shared/apra-paragraphs";
import type { ControlDetailResponse, ControlOrgGuide } from "@shared/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { formatShortDate, Icon } from "@/components/PaperUi";
import { invalidateWorkspaceQueries, postSseStream, showToast } from "@/lib/api";

const STORAGE_KEY = "mount-charter.controlOverviewOpen";

interface ControlOverviewCardProps {
  detail: ControlDetailResponse;
  controlNumber: string;
  onGoEvidenceTab: () => void;
}

function readStoredOpen(): boolean {
  try {
    const val = window.localStorage.getItem(STORAGE_KEY);
    return val === null ? true : val === "1";
  } catch {
    return true;
  }
}

export function ControlOverviewCard({
  detail,
  controlNumber,
  onGoEvidenceTab,
}: ControlOverviewCardProps) {
  const [isOpen, setIsOpen] = useState<boolean>(readStoredOpen);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [localGuide, setLocalGuide] = useState<ControlOrgGuide | null>(detail.orgGuide ?? null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setAiStreaming(false);
    setStreamedText("");
    setLocalGuide(detail.orgGuide ?? null);
  }, [detail.orgGuide]);

  const enabledSet = useMemo(
    () => new Set(detail.enabledFrameworkCodes || []),
    [detail.enabledFrameworkCodes],
  );
  const showCps234 = enabledSet.has("apra_cps234");
  const showCps230 = enabledSet.has("apra_cps230");

  const cps234Glosses = useMemo(
    () => (showCps234 ? parseApraRefs(detail.cps234Reference, "cps234") : []),
    [showCps234, detail.cps234Reference],
  );
  const cps230Glosses = useMemo(
    () => (showCps230 ? parseApraRefs(detail.cps230Reference, "cps230") : []),
    [showCps230, detail.cps230Reference],
  );

  const attrs = detail.iso27002Attributes;
  const ciaShort = attrs?.infoSecProperties.map((p) => p[0]).join(" · ") || "";
  const isMandatoryClause = detail.controlNumber.toUpperCase().startsWith("RQ");

  const activeGuideText = aiStreaming ? streamedText : localGuide?.contentMarkdown || "";

  const runOrgExplainer = async (force = false) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setAiStreaming(true);
    setStreamedText("");
    try {
      await postSseStream(
        `/api/controls/${encodeURIComponent(controlNumber)}/explain-stream`,
        { force },
        {
          signal: controller.signal,
          onEvent: (event, data) => {
            const payload = data as {
              text?: string;
              error?: string;
              guide?: ControlOrgGuide;
            };
            if (event === "token" && payload.text) {
              setStreamedText((prev) => prev + payload.text);
            } else if (event === "complete" && payload.guide) {
              setLocalGuide(payload.guide);
            } else if (event === "error") {
              throw new Error(payload.error || "Failed to explain control");
            }
          },
        },
      );
      await invalidateWorkspaceQueries(controlNumber);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        showToast(err instanceof Error ? err.message : "Could not generate explanation", {
          tone: "err",
        });
      }
    } finally {
      abortRef.current = null;
      setAiStreaming(false);
    }
  };

  const hasOverviewContent = Boolean(
    detail.plainEnglishSummary ||
      detail.whyItMatters ||
      detail.keyDeliverables.length > 0 ||
      detail.auditFocusSummary,
  );
  if (!hasOverviewContent) return null;

  const hasAuContext =
    detail.activeFrameworkContext.length > 0 ||
    cps234Glosses.length > 0 ||
    cps230Glosses.length > 0;

  return (
    <details
      className="pp-disclosure mw-overview-card"
      open={isOpen}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setIsOpen(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
          // Ignore storage quota errors
        }
      }}
    >
      <summary className="mw-overview-card__summary">
        <span className="mw-overview-card__title">Control Overview</span>
        <span className="mw-overview-card__attrs">
          {isMandatoryClause ? (
            <span className="pp-badge">Management System Clause</span>
          ) : (
            attrs && (
              <>
                {attrs.controlTypes.map((ct) => (
                  <span key={ct} className="pp-badge" title="ISO/IEC 27002:2022 Control Type">
                    {ct}
                  </span>
                ))}
                {ciaShort && (
                  <span
                    className="pp-badge mw-mono"
                    title={`Information security properties: ${attrs.infoSecProperties.join(", ")}`}
                  >
                    {ciaShort}
                  </span>
                )}
                {attrs.cybersecurityConcepts.slice(0, 2).map((cc) => (
                  <span
                    key={cc}
                    className="pp-badge"
                    title="ISO/IEC 27002:2022 Cybersecurity Concept"
                  >
                    {cc}
                  </span>
                ))}
              </>
            )
          )}
        </span>
      </summary>

      <div className="pp-disclosure__body mw-stack mw-stack--sm">
        {detail.plainEnglishSummary && (
          <p className="pp-prose mw-overview-card__lead">{detail.plainEnglishSummary}</p>
        )}

        {detail.whyItMatters && (
          <p className="mw-muted pp-prose" style={{ margin: 0 }}>
            <strong>Why it matters:</strong> {detail.whyItMatters}
          </p>
        )}

        {detail.keyDeliverables.length > 0 && (
          <div className="mw-row mw-row--wrap" style={{ gap: 6 }}>
            <span className="mw-faint">Expected evidence:</span>
            {detail.keyDeliverables.map((item) => (
              <button
                key={item}
                type="button"
                className="mw-overview-chip"
                onClick={onGoEvidenceTab}
                title="Jump to Evidence tab to upload or link this artefact"
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {detail.auditFocusSummary && (
          <div className="mw-overview-trap" role="note">
            <strong>Auditor focus:</strong> {detail.auditFocusSummary}
          </div>
        )}

        {hasAuContext && (
          <div className="mw-overview-au">
            <span className="mw-faint" style={{ fontWeight: 500 }}>
              Active AU framework intersections:
            </span>
            <div className="mw-row mw-row--wrap" style={{ gap: 6 }}>
              {detail.activeFrameworkContext.slice(0, 6).map((ctx) => {
                const isConflict = ctx.coverage === "rubric_conflict";
                return (
                  <Link
                    key={`${ctx.frameworkCode}-${ctx.reqCode}`}
                    href={`/frameworks?fw=${encodeURIComponent(ctx.frameworkCode)}`}
                    className={isConflict ? "pp-status pp-status--warn" : "pp-badge"}
                    style={{ textDecoration: "none" }}
                    title={`${ctx.frameworkShortName} ${ctx.reqCode} — ${ctx.title}${ctx.mappingNotes ? ` (${ctx.mappingNotes})` : ""}`}
                  >
                    {isConflict ? "SLA Override · " : ""}
                    {ctx.frameworkShortName} {ctx.reqCode}
                  </Link>
                );
              })}
              {cps234Glosses.slice(0, 4).map((g) => (
                <span
                  key={`cps234-${g.code}`}
                  className="pp-badge pp-badge--accent"
                  title={g.summary}
                >
                  CPS 234 §{g.code} · {g.label}
                </span>
              ))}
              {cps230Glosses.slice(0, 4).map((g) => (
                <span key={`cps230-${g.code}`} className="pp-badge" title={g.summary}>
                  CPS 230 §{g.code} · {g.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mw-row mw-row--between mw-row--wrap" style={{ paddingTop: 2 }}>
          <div className="mw-row mw-row--wrap">
            {!activeGuideText && !aiStreaming ? (
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={() => void runOrgExplainer(false)}
                title="Generate a tailored plain-English explanation grounded in your organisation profile and tech stack (cached locally)"
              >
                <Icon name="sparkles" />
                <span>Explain for my organisation (AI)</span>
              </button>
            ) : aiStreaming ? (
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={() => abortRef.current?.abort()}
              >
                Cancel explanation
              </button>
            ) : (
              <button
                type="button"
                className="pp-button pp-button--ghost pp-button--sm"
                onClick={() => void runOrgExplainer(true)}
                title="Refresh organisation-tailored guidance using current profile"
              >
                <Icon name="sparkles" />
                <span>Refresh organisation guide</span>
              </button>
            )}
          </div>
          {detail.legacyResponsesCount > 0 && (
            <span className="mw-faint">
              {detail.legacyResponsesCount} archived v2.1 answer
              {detail.legacyResponsesCount === 1 ? "" : "s"} preserved
            </span>
          )}
        </div>

        {(activeGuideText || aiStreaming) && (
          <div className="mw-org-guide">
            <div className="mw-row mw-row--between mw-row--wrap" style={{ marginBottom: 6 }}>
              <strong style={{ fontSize: "var(--paper-size-secondary)" }}>
                Tailored for Your Organisation
              </strong>
              {localGuide && !aiStreaming && (
                <span className="mw-faint">
                  {localGuide.modelUsed} · {formatShortDate(localGuide.generatedAt)}
                </span>
              )}
              {aiStreaming && <span className="mw-faint">Drafting…</span>}
            </div>
            <div className="mw-org-guide__body pp-prose">{activeGuideText}</div>
          </div>
        )}
      </div>
    </details>
  );
}
