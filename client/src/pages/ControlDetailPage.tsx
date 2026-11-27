import { parseApraRefs } from "@shared/apra-paragraphs";
import type { ControlDetailResponse, ControlSummary, DocumentRecord } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AssessmentTab } from "@/components/controls/AssessmentTab";
import { ControlEvidenceTab } from "@/components/controls/ControlEvidenceTab";
import { ControlOverviewCard } from "@/components/controls/ControlOverviewCard";
import { ControlPropertiesInspector } from "@/components/controls/ControlPropertiesInspector";
import { RecordTestSheet } from "@/components/controls/RecordTestSheet";
import { TestHistoryTab } from "@/components/controls/TestHistoryTab";
import {
  Icon,
  ImplementationStatusBadge,
  PaperTabs,
  StatusBadge,
  UrgencyBadge,
} from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

export function ControlDetailPage({
  controlNumberProp,
  visibleControls,
  onSelectControl,
}: {
  controlNumberProp?: string;
  visibleControls?: ControlSummary[];
  onSelectControl?: (controlNumber: string) => void;
}) {
  const [, params] = useRoute("/controls/:controlNumber");
  const controlNumber =
    controlNumberProp || (params?.controlNumber ? decodeURIComponent(params.controlNumber) : "");
  const [, navigate] = useLocation();

  const [activeTab, setActiveTab] = useState<"assessment" | "evidence" | "tests">("assessment");
  const [draftResponses, setDraftResponses] = useState<Record<number, string>>({});
  const [dirtyQuestions, setDirtyQuestions] = useState<Set<number>>(new Set());
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const hydratedControlRef = useRef<string>("");
  const testSheetRef = useRef<HTMLDialogElement>(null);

  const { data: fallbackControls = [] } = useQuery<ControlSummary[]>({
    queryKey: ["controls"],
    queryFn: () => apiRequest<ControlSummary[]>("GET", "/api/controls"),
    enabled: !visibleControls,
  });

  const navList = visibleControls || fallbackControls;

  const {
    data: detail,
    isLoading,
    error,
  } = useQuery<ControlDetailResponse>({
    queryKey: ["control", controlNumber],
    queryFn: () =>
      apiRequest<ControlDetailResponse>(
        "GET",
        `/api/controls/${encodeURIComponent(controlNumber)}`,
      ),
    enabled: Boolean(controlNumber),
  });

  const { data: libraryDocs = [] } = useQuery<DocumentRecord[]>({
    queryKey: ["documents"],
    queryFn: () => apiRequest<DocumentRecord[]>("GET", "/api/documents"),
  });

  useEffect(() => {
    if (!detail) return;
    const isNewControl = hydratedControlRef.current !== detail.controlNumber;
    if (isNewControl) {
      hydratedControlRef.current = detail.controlNumber;
      const map: Record<number, string> = {};
      for (const r of detail.responses) map[r.question_id] = r.response_text;
      setDraftResponses(map);
      setDirtyQuestions(new Set());
      return;
    }

    setDraftResponses((prev) => {
      const next = { ...prev };
      for (const r of detail.responses) {
        if (!dirtyQuestions.has(r.question_id)) {
          next[r.question_id] = r.response_text;
        }
      }
      return next;
    });
  }, [detail, dirtyQuestions]);

  const { prevControl, nextControl } = useMemo(() => {
    const idx = navList.findIndex((c) => c.controlNumber === controlNumber);
    return {
      prevControl: idx > 0 ? navList[idx - 1] : null,
      nextControl: idx >= 0 && idx < navList.length - 1 ? navList[idx + 1] : null,
    };
  }, [navList, controlNumber]);

  const goControl = useCallback(
    (num: string) => {
      if (onSelectControl) onSelectControl(num);
      else navigate(`/controls/${encodeURIComponent(num)}`);
    },
    [onSelectControl, navigate],
  );

  const saveAllDirty = useCallback(async () => {
    if (!detail || dirtyQuestions.size === 0 || savingAll) return;
    const items = Array.from(dirtyQuestions).map((qId) => ({
      questionId: qId,
      responseText: draftResponses[qId] ?? "",
    }));
    setSavingAll(true);
    try {
      await apiRequest(
        "POST",
        `/api/controls/${encodeURIComponent(controlNumber)}/responses/bulk`,
        { responses: items },
      );
      setDirtyQuestions(new Set());
      await invalidateWorkspaceQueries(controlNumber);
      setStatusMessage(`Saved ${items.length} response${items.length === 1 ? "" : "s"}`);
      showToast(`Saved ${items.length} response${items.length === 1 ? "" : "s"}`, { tone: "ok" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save responses", { tone: "err" });
    } finally {
      setSavingAll(false);
    }
  }, [detail, dirtyQuestions, savingAll, draftResponses, controlNumber]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (dirtyQuestions.size > 0) {
          e.preventDefault();
          void saveAllDirty();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "[" && prevControl) goControl(prevControl.controlNumber);
      else if (e.key === "]" && nextControl) goControl(nextControl.controlNumber);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevControl, nextControl, dirtyQuestions, goControl, saveAllDirty]);

  const saveResponse = async (questionId: number, text: string) => {
    setSavingQuestionId(questionId);
    try {
      await apiRequest("PATCH", `/api/controls/${encodeURIComponent(controlNumber)}/response`, {
        questionId,
        responseText: text,
      });
      setDirtyQuestions((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
      await invalidateWorkspaceQueries(controlNumber);
      setStatusMessage(`Saved response for Q${questionId}`);
      showToast(`Saved Q${questionId}`, { tone: "ok" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save response", { tone: "err" });
    } finally {
      setSavingQuestionId(null);
    }
  };

  if (isLoading || !detail) {
    return (
      <div className="mw-stack">
        {error ? (
          <div className="pp-banner pp-banner--err" role="alert">
            <div className="pp-banner__body">
              <div className="pp-banner__title">Control not found</div>
              <div className="pp-banner__text">{error instanceof Error ? error.message : ""}</div>
            </div>
          </div>
        ) : (
          <p className="mw-muted">Loading control {controlNumber}…</p>
        )}
      </div>
    );
  }

  const questions = detail.aiQuestionnaire?.questions || [];
  const enabledSet = new Set(detail.enabledFrameworkCodes || []);
  const headerCps234 = enabledSet.has("apra_cps234")
    ? parseApraRefs(detail.cps234Reference, "cps234")
    : [];
  const headerCps230 = enabledSet.has("apra_cps230")
    ? parseApraRefs(detail.cps230Reference, "cps230")
    : [];

  return (
    <div className="mw-stack mw-stack--lg" style={{ maxWidth: 1120 }}>
      <span className="pp-sr-only" aria-live="polite">
        {statusMessage}
      </span>

      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <div className="mw-row mw-row--wrap" style={{ marginBottom: 4 }}>
            <span className="pp-badge">{detail.category.name}</span>
            {detail.ownerRole && <span className="pp-badge">Owner: {detail.ownerRole}</span>}
            {headerCps234.length > 0 && (
              <span
                className="pp-badge pp-badge--accent"
                title={headerCps234.map((g) => `§${g.code} ${g.label}: ${g.summary}`).join("\n")}
              >
                CPS 234 §{headerCps234.map((g) => g.code).join("; ")}
              </span>
            )}
            {headerCps230.length > 0 && (
              <span
                className="pp-badge"
                title={headerCps230.map((g) => `§${g.code} ${g.label}: ${g.summary}`).join("\n")}
              >
                CPS 230 §{headerCps230.map((g) => g.code).join("; ")}
              </span>
            )}
          </div>
          <h1 className="pp-page-header__title">
            <span className="mw-mono">{detail.controlNumber}</span> {detail.name}
          </h1>
          <div className="mw-row mw-row--wrap" style={{ marginTop: 6 }}>
            <StatusBadge status={detail.latestTestRun?.status} />
            <ImplementationStatusBadge status={detail.workspaceControl.implementationStatus} />
            <UrgencyBadge urgency={detail.workspaceControl.selectedUrgency} />
            <span className="mw-muted">
              {detail.questionnaireProgress.answered}/{detail.questionnaireProgress.total} questions
              · {detail.linkedDocuments.length} doc{detail.linkedDocuments.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="pp-page-header__actions">
          {dirtyQuestions.size > 0 && (
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              disabled={savingAll}
              onClick={() => void saveAllDirty()}
              title="Save all unsaved responses (⌘S)"
            >
              {savingAll ? "Saving…" : `Save All (${dirtyQuestions.size})`}
            </button>
          )}
          {prevControl && (
            <button
              type="button"
              className="pp-button pp-button--sm"
              title="Previous control ([)"
              onClick={() => goControl(prevControl.controlNumber)}
            >
              ← {prevControl.controlNumber}
            </button>
          )}
          {nextControl && (
            <button
              type="button"
              className="pp-button pp-button--sm"
              title="Next control (])"
              onClick={() => goControl(nextControl.controlNumber)}
            >
              {nextControl.controlNumber} →
            </button>
          )}
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            onClick={() => testSheetRef.current?.showModal()}
          >
            <Icon name="clipboard-check" />
            <span>Record Test</span>
          </button>
        </div>
      </div>

      <div className="mw-detail-layout">
        <div className="mw-stack">
          <ControlOverviewCard
            key={detail.controlNumber}
            detail={detail}
            controlNumber={controlNumber}
            onGoEvidenceTab={() => setActiveTab("evidence")}
          />

          <PaperTabs
            label="Control sections"
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              {
                id: "assessment",
                label: `Assessment (${detail.questionnaireProgress.answered}/${questions.length})`,
              },
              {
                id: "evidence",
                label: `Evidence (${detail.linkedDocuments.length + detail.evidenceLinks.length})`,
              },
              {
                id: "tests",
                label: `Test History (${detail.testRuns.length})`,
              },
            ]}
          />

          {activeTab === "assessment" && (
            <AssessmentTab
              detail={detail}
              controlNumber={controlNumber}
              draftResponses={draftResponses}
              dirtyQuestions={dirtyQuestions}
              savingQuestionId={savingQuestionId}
              onDraftChange={(questionId, val, savedVal) => {
                setDraftResponses((prev) => ({ ...prev, [questionId]: val }));
                setDirtyQuestions((prev) => {
                  const next = new Set(prev);
                  if (val !== savedVal) next.add(questionId);
                  else next.delete(questionId);
                  return next;
                });
              }}
              onSaveResponse={saveResponse}
              onClearDirty={(questionId) =>
                setDirtyQuestions((prev) => {
                  const next = new Set(prev);
                  next.delete(questionId);
                  return next;
                })
              }
              onGoEvidenceTab={() => setActiveTab("evidence")}
            />
          )}

          {activeTab === "evidence" && (
            <ControlEvidenceTab
              detail={detail}
              controlNumber={controlNumber}
              libraryDocs={libraryDocs}
            />
          )}

          {activeTab === "tests" && (
            <TestHistoryTab
              detail={detail}
              onOpenRecordTest={() => testSheetRef.current?.showModal()}
            />
          )}
        </div>

        <ControlPropertiesInspector detail={detail} controlNumber={controlNumber} />
      </div>

      <RecordTestSheet
        detail={detail}
        controlNumber={controlNumber}
        sheetRef={testSheetRef}
        dirtyQuestionCount={dirtyQuestions.size}
        onSaveAllDirty={saveAllDirty}
        onRecorded={() => setActiveTab("tests")}
      />
    </div>
  );
}
