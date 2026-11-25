import type {
  AiContextScope,
  ControlDetailResponse,
  EvidenceType,
  Persona,
  TestStatus,
} from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AiAnalysisCard, Icon, type ParsedAiAnalysis } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, postSseStream, showToast } from "@/lib/api";

interface RecordTestSheetProps {
  detail: ControlDetailResponse;
  controlNumber: string;
  sheetRef: React.RefObject<HTMLDialogElement>;
  dirtyQuestionCount: number;
  onSaveAllDirty: () => Promise<void>;
  onRecorded: () => void;
}

export function RecordTestSheet({
  detail,
  controlNumber,
  sheetRef,
  dirtyQuestionCount,
  onSaveAllDirty,
  onRecorded,
}: RecordTestSheetProps) {
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  const [testPersona, setTestPersona] = useState<Persona>(detail.workspaceControl.selectedPersona);
  const [testContextScope, setTestContextScope] = useState<AiContextScope>("last_3");
  const [testStatus, setTestStatus] = useState<TestStatus>("Pass");
  const [testComments, setTestComments] = useState("");
  const [testEvTitle, setTestEvTitle] = useState("");
  const [testEvUrl, setTestEvUrl] = useState("");
  const [testAttachedLinks, setTestAttachedLinks] = useState<
    Array<{ title: string; url: string | null; evidenceType: EvidenceType }>
  >([]);
  const [aiPhase, setAiPhase] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiResult, setAiResult] = useState<ParsedAiAnalysis | null>(null);

  useEffect(() => {
    setTestPersona(detail.workspaceControl.selectedPersona);
  }, [detail.workspaceControl.selectedPersona]);

  const runAiTestReview = async () => {
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiRunning(true);
    setAiPhase(`Preparing ${testPersona} assessment…`);
    setAiResult(null);
    try {
      await postSseStream(
        `/api/controls/${encodeURIComponent(controlNumber)}/analyse-stream`,
        {
          persona: testPersona,
          comments: testComments,
          aiContextScope: testContextScope,
        },
        {
          signal: controller.signal,
          onEvent: (event, data) => {
            const payload = data as {
              message?: string;
              error?: string;
              analysis?: ParsedAiAnalysis;
            };
            if (event === "phase" && payload.message) setAiPhase(payload.message);
            if (event === "complete" && payload.analysis) {
              setAiResult(payload.analysis);
              if (payload.analysis.suggested_status) {
                setTestStatus(payload.analysis.suggested_status);
              }
            }
            if (event === "error") {
              throw new Error(payload.error || "AI review failed");
            }
          },
        },
      );
      setAiPhase("Assessment complete");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setAiPhase("Cancelled");
        showToast("AI review cancelled", { tone: "info" });
      } else {
        setAiPhase("");
        showToast(err instanceof Error ? err.message : "AI review failed", { tone: "err" });
      }
    } finally {
      aiAbortRef.current = null;
      setAiRunning(false);
    }
  };

  const submitTestRun = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/test-runs", {
        controlNumber,
        status: testStatus,
        comments: testComments || null,
        aiAnalysis: aiResult ? JSON.stringify(aiResult) : null,
        aiSuggestedStatus: aiResult?.suggested_status ?? null,
        aiConfidence: aiResult?.confidence ?? null,
        aiContextScope: testContextScope,
        evidenceLinks: testAttachedLinks,
      }),
    onSuccess: () => {
      confirmDialogRef.current?.close();
      sheetRef.current?.close();
      setTestComments("");
      setTestAttachedLinks([]);
      setAiResult(null);
      setAiPhase("");
      onRecorded();
      invalidateWorkspaceQueries(controlNumber);
      showToast("Immutable test run recorded", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  return (
    <>
      <dialog
        ref={sheetRef}
        className="pp-sheet"
        closedby="any"
        aria-labelledby="record-test-title"
      >
        <div className="pp-sheet__header">
          <h2 id="record-test-title" className="pp-sheet__title">
            Record Test — {detail.controlNumber}
          </h2>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--compact"
            aria-label="Close record test drawer"
            onClick={() => {
              aiAbortRef.current?.abort();
              sheetRef.current?.close();
            }}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="pp-sheet__body mw-stack">
          {dirtyQuestionCount > 0 && (
            <div className="pp-banner pp-banner--warn" role="status">
              <div className="pp-banner__body">
                <div className="pp-banner__text">
                  You have {dirtyQuestionCount} unsaved question draft(s). Save them first so Claude
                  sees your latest answers.
                </div>
              </div>
              <div className="pp-banner__actions">
                <button
                  type="button"
                  className="pp-button pp-button--sm"
                  onClick={() => void onSaveAllDirty()}
                >
                  Save All
                </button>
              </div>
            </div>
          )}

          <div className="mw-muted">
            {detail.questionnaireProgress.answered}/{detail.questionnaireProgress.total} questions
            answered · {detail.linkedDocuments.length} linked document
            {detail.linkedDocuments.length === 1 ? "" : "s"}
          </div>

          <div className="mw-form-grid">
            <div className="pp-field">
              <span className="pp-field__label">AI Review Persona</span>
              <div className="pp-segmented" role="group" aria-label="AI persona">
                {(["Auditor", "Advisor", "Analyst"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="pp-segmented__item"
                    aria-pressed={testPersona === p}
                    onClick={() => setTestPersona(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="pp-field">
              <label className="pp-field__label" htmlFor="test-ctx-scope">
                Prior Test History Context
              </label>
              <select
                id="test-ctx-scope"
                className="pp-select pp-select--sm"
                value={testContextScope}
                onChange={(e) => setTestContextScope(e.target.value as AiContextScope)}
              >
                <option value="current_only">Current responses only</option>
                <option value="last_3">Include last 3 test runs</option>
                <option value="all_history">Include full test history</option>
              </select>
            </div>
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="test-comments">
              Tester Notes &amp; Evidence Observations
            </label>
            <textarea
              id="test-comments"
              className="pp-textarea"
              rows={4}
              placeholder="Summarise testing procedures performed, sampling observed, and any findings…"
              value={testComments}
              onChange={(e) => setTestComments(e.target.value)}
            />
          </div>

          <div className="pp-field">
            <span className="pp-field__label">
              Attach Evidence Links to this Test Run (optional)
            </span>
            <div className="mw-row mw-row--wrap">
              <input
                type="text"
                className="pp-input pp-input--sm"
                placeholder="Evidence title"
                value={testEvTitle}
                onChange={(e) => setTestEvTitle(e.target.value)}
                style={{ flex: 1, minWidth: 140 }}
              />
              <input
                type="url"
                className="pp-input pp-input--sm"
                placeholder="https://…"
                value={testEvUrl}
                onChange={(e) => setTestEvUrl(e.target.value)}
                style={{ flex: 1, minWidth: 140 }}
              />
              <button
                type="button"
                className="pp-button pp-button--sm"
                disabled={!testEvTitle.trim()}
                onClick={() => {
                  setTestAttachedLinks((prev) => [
                    ...prev,
                    {
                      title: testEvTitle.trim(),
                      url: testEvUrl.trim() || null,
                      evidenceType: "RECORD",
                    },
                  ]);
                  setTestEvTitle("");
                  setTestEvUrl("");
                }}
              >
                Attach
              </button>
            </div>
            {testAttachedLinks.length > 0 && (
              <div className="mw-stack mw-stack--sm" style={{ marginTop: 6 }}>
                {testAttachedLinks.map((l, idx) => (
                  <div key={idx} className="mw-action-row">
                    <span className="mw-faint">
                      {l.title} {l.url ? `(${l.url})` : ""}
                    </span>
                    <button
                      type="button"
                      className="pp-icon-button pp-icon-button--compact"
                      aria-label={`Remove ${l.title}`}
                      onClick={() =>
                        setTestAttachedLinks((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mw-row mw-row--wrap">
            <button
              type="button"
              className="pp-button pp-button--sm"
              disabled={aiRunning}
              aria-busy={aiRunning}
              onClick={() => void runAiTestReview()}
            >
              <Icon name="sparkles" />
              <span>{aiRunning ? "Running AI Review…" : `Run ${testPersona} AI Review`}</span>
            </button>
            {aiRunning && (
              <button
                type="button"
                className="pp-button pp-button--danger pp-button--sm"
                onClick={() => aiAbortRef.current?.abort()}
              >
                Cancel
              </button>
            )}
            {aiPhase && <span className="mw-faint">{aiPhase}</span>}
          </div>

          {aiResult && <AiAnalysisCard analysis={aiResult} />}

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="test-status">
              Final Test Outcome
            </label>
            <select
              id="test-status"
              className="pp-select"
              value={testStatus}
              onChange={(e) => setTestStatus(e.target.value as TestStatus)}
            >
              <option value="Pass">Pass</option>
              <option value="PassPrevious">Pass (Previous Evidence)</option>
              <option value="ContinualImprovement">Continual Improvement</option>
              <option value="Blocked">Blocked</option>
              <option value="Fail">Fail</option>
              <option value="NotAttempted">Not Attempted</option>
            </select>
          </div>

          <div className="mw-row mw-row--between">
            <span className="mw-faint">Appended to immutable ISO 27001 audit log</span>
            <button
              type="button"
              className="pp-button pp-button--primary"
              onClick={() => confirmDialogRef.current?.showModal()}
            >
              Record Immutable Test Run
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={confirmDialogRef}
        className="pp-dialog pp-dialog--confirm"
        closedby="any"
        aria-labelledby="confirm-test-title"
      >
        <form method="dialog">
          <div className="pp-dialog__header">
            <h2 id="confirm-test-title" className="pp-dialog__title">
              Confirm Immutable Test Run
            </h2>
            <button
              type="button"
              className="pp-icon-button pp-icon-button--compact"
              aria-label="Close confirmation"
              onClick={() => confirmDialogRef.current?.close()}
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="pp-dialog__body">
            <p className="pp-prose" style={{ margin: 0 }}>
              Record <strong>{testStatus}</strong> for{" "}
              <span className="mw-mono">{detail.controlNumber}</span>? Test runs are enforced
              append-only at the database layer and cannot be edited or deleted once saved.
            </p>
          </div>
          <div className="pp-dialog__footer">
            <button type="submit" className="pp-button" autoFocus>
              Cancel
            </button>
            <button
              type="button"
              className="pp-button pp-button--primary"
              disabled={submitTestRun.isPending}
              onClick={() => submitTestRun.mutate()}
            >
              {submitTestRun.isPending ? "Recording…" : "Confirm & Record"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
