import type {
  AgentProposal,
  ControlSummary,
  DocumentQuestionMatch,
  DocumentRecord,
  EvidenceFanOutEstimate,
  EvidenceLink,
} from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AiReviewQueueTab } from "@/components/evidence/AiReviewQueueTab";
import { CollectorsTab } from "@/components/evidence/CollectorsTab";
import { DocumentsTab } from "@/components/evidence/DocumentsTab";
import { EvidenceDialogs } from "@/components/evidence/EvidenceDialogs";
import { ExternalLinksTab } from "@/components/evidence/ExternalLinksTab";
import { ConfirmDialog, Icon, PaperTabs } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, postSseStream, showToast } from "@/lib/api";

type Tab = "uploads" | "links" | "queue" | "collectors";

interface ActiveFanOutRun {
  docId: number;
  docTitle: string;
  step: number;
  totalSteps: number;
  message: string;
  stagedCount: number;
  tokensUsed: number;
  costUsd: number;
}

export function EvidencePage() {
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const urlParams = new URLSearchParams(searchStr);
  const urlTab = urlParams.get("tab") as Tab | null;
  const wantsUpload = urlParams.get("upload") === "1";
  const deepDocId = urlParams.get("doc");

  const [tab, setTab] = useState<Tab>(
    urlTab === "links" || urlTab === "queue" || urlTab === "collectors" ? urlTab : "uploads",
  );
  const [search, setSearch] = useState("");
  const uploadSheetRef = useRef<HTMLDialogElement>(null);
  const fanOutAbortRef = useRef<AbortController | null>(null);

  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [linkingDoc, setLinkingDoc] = useState<DocumentRecord | null>(null);
  const [inspectDoc, setInspectDoc] = useState<DocumentRecord | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<EvidenceLink | null>(null);
  const [fanOutPreview, setFanOutPreview] = useState<EvidenceFanOutEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [activeRun, setActiveRun] = useState<ActiveFanOutRun | null>(null);

  const { data: documents = [], isLoading: docsLoading } = useQuery<DocumentRecord[]>({
    queryKey: ["documents"],
    queryFn: () => apiRequest<DocumentRecord[]>("GET", "/api/documents"),
  });

  const { data: evidenceLinks = [] } = useQuery<EvidenceLink[]>({
    queryKey: ["evidence-links"],
    queryFn: () => apiRequest<EvidenceLink[]>("GET", "/api/evidence-links"),
  });

  const { data: pendingMatches = [] } = useQuery<DocumentQuestionMatch[]>({
    queryKey: ["pending-matches"],
    queryFn: () => apiRequest<DocumentQuestionMatch[]>("GET", "/api/matches/pending"),
  });

  const { data: pendingProposals = [] } = useQuery<AgentProposal[]>({
    queryKey: ["agent-proposals"],
    queryFn: () => apiRequest<AgentProposal[]>("GET", "/api/agent/proposals"),
  });

  const { data: controls = [] } = useQuery<ControlSummary[]>({
    queryKey: ["controls"],
    queryFn: () => apiRequest<ControlSummary[]>("GET", "/api/controls"),
  });

  useEffect(() => {
    if (
      urlTab === "uploads" ||
      urlTab === "links" ||
      urlTab === "queue" ||
      urlTab === "collectors"
    ) {
      setTab(urlTab);
    }
  }, [urlTab]);

  useEffect(() => {
    if (wantsUpload && uploadSheetRef.current && !uploadSheetRef.current.open) {
      uploadSheetRef.current.showModal();
      const next = new URLSearchParams(searchStr);
      next.delete("upload");
      const qs = next.toString();
      navigate(qs ? `/evidence?${qs}` : "/evidence", { replace: true });
    }
  }, [wantsUpload, searchStr, navigate]);

  useEffect(() => {
    if (deepDocId && documents.length > 0) {
      const target = documents.find((d) => String(d.id) === deepDocId);
      if (target) {
        setTab("uploads");
        setSearch(target.title);
      }
    }
  }, [deepDocId, documents]);

  const handleTabChange = (next: Tab) => {
    setTab(next);
    navigate(`/evidence?tab=${next}`, { replace: true });
  };

  const openFanOutPreview = async (doc: DocumentRecord) => {
    setLoadingEstimate(true);
    try {
      const est = await apiRequest<EvidenceFanOutEstimate>(
        "GET",
        `/api/documents/${doc.id}/fan-out-estimate`,
      );
      setFanOutPreview(est);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not estimate fan-out", { tone: "err" });
    } finally {
      setLoadingEstimate(false);
    }
  };

  const startFanOut = async (est: EvidenceFanOutEstimate) => {
    setFanOutPreview(null);
    fanOutAbortRef.current?.abort();
    const ac = new AbortController();
    fanOutAbortRef.current = ac;

    setActiveRun({
      docId: est.documentId,
      docTitle: est.documentTitle,
      step: 1,
      totalSteps: Math.max(
        1,
        1 +
          Math.ceil(est.candidateControlCount / 4) +
          Math.ceil(est.candidateFrameworkReqCount / 6),
      ),
      message: `Starting evidence fan-out for "${est.documentTitle}"…`,
      stagedCount: 0,
      tokensUsed: 0,
      costUsd: 0,
    });

    try {
      await postSseStream(
        `/api/documents/${est.documentId}/fan-out`,
        {},
        {
          signal: ac.signal,
          onEvent: (event, data) => {
            const payload = (data || {}) as Record<string, unknown>;
            if (event === "progress") {
              setActiveRun({
                docId: est.documentId,
                docTitle: est.documentTitle,
                step: Number(payload.step || 1),
                totalSteps: Number(payload.totalSteps || 1),
                message: String(payload.message || "Working…"),
                stagedCount: Number(payload.stagedCount || 0),
                tokensUsed: Number(payload.tokensUsed || 0),
                costUsd: Number(payload.costUsd || 0),
              });
            } else if (event === "complete") {
              const iso = Number(payload.savedIsoCount || 0);
              const fw = Number(payload.stagedFrameworkCount || 0);
              const cost = Number(payload.totalCostUsd || 0);
              setActiveRun(null);
              void invalidateWorkspaceQueries();
              showToast(
                `Staged ${iso} ISO answer(s) & ${fw} AU framework proposal(s)${cost > 0 ? ` ($${cost.toFixed(4)})` : ""}`,
                { tone: "ok" },
              );
              if (iso + fw > 0) handleTabChange("queue");
            } else if (event === "error") {
              setActiveRun(null);
              showToast(String(payload.error || "Evidence fan-out failed"), { tone: "err" });
            }
          },
        },
      );
    } catch (err) {
      setActiveRun(null);
      if (!ac.signal.aborted) {
        showToast(err instanceof Error ? err.message : "Evidence fan-out failed", { tone: "err" });
      }
    }
  };

  const deleteDoc = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      setDocToDelete(null);
      void invalidateWorkspaceQueries();
      showToast("Document removed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const deleteExternalLink = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/evidence-links/${id}`),
    onSuccess: () => {
      setLinkToDelete(null);
      void invalidateWorkspaceQueries();
      showToast("Link removed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const totalInboxCount = pendingMatches.length + pendingProposals.length;

  return (
    <div className="mw-container">
      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <h1 className="pp-page-header__title">Evidence Library</h1>
          <p className="pp-page-header__meta">
            All uploaded documents are stored locally with content-addressed deduplication and{" "}
            <span className="mw-mono">0600</span> permissions — never committed to Git.
          </p>
        </div>
        <div className="pp-page-header__actions">
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            onClick={() => uploadSheetRef.current?.showModal()}
          >
            <Icon name="upload" />
            <span>Upload Documents</span>
          </button>
        </div>
      </div>

      {activeRun && (
        <div className="mw-run-strip" role="status" aria-live="polite">
          <div className="mw-row mw-row--wrap">
            <span className="mw-run-strip__dot" aria-hidden="true" />
            <strong style={{ fontSize: 13 }}>
              Step {activeRun.step}/{activeRun.totalSteps}: {activeRun.message}
            </strong>
            <span className="mw-faint mw-mono">
              {activeRun.stagedCount} staged · {activeRun.tokensUsed.toLocaleString()} tok
              {activeRun.costUsd > 0 ? ` (~$${activeRun.costUsd.toFixed(4)})` : ""}
            </span>
          </div>
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() => {
              fanOutAbortRef.current?.abort();
              setActiveRun(null);
              void invalidateWorkspaceQueries();
              showToast("Stopped fan-out run; any already-staged proposals were kept.", {
                tone: "info",
              });
            }}
          >
            Stop Run
          </button>
        </div>
      )}

      {fanOutPreview && (
        <div className="mw-proposal-card" role="region" aria-label="Evidence fan-out preview">
          <div className="mw-row mw-row--between mw-row--wrap">
            <div>
              <strong style={{ fontSize: 14 }}>
                Collect Once, Map Everywhere — {fanOutPreview.documentTitle}
              </strong>
              <div className="mw-faint">
                Local pre-filter selected{" "}
                <strong>{fanOutPreview.candidateControlCount} ISO 27001 control(s)</strong>
                {fanOutPreview.candidateControlNumbers.length > 0
                  ? ` (${fanOutPreview.candidateControlNumbers.join(", ")})`
                  : ""}{" "}
                and{" "}
                <strong>
                  {fanOutPreview.candidateFrameworkReqCount} Australian framework obligation(s)
                </strong>
                {fanOutPreview.candidateFrameworks.length > 0
                  ? ` (${fanOutPreview.candidateFrameworks.join(", ")})`
                  : ""}
                . All outputs are staged as uncommitted proposals for your approval.
              </div>
            </div>
            <span className="pp-badge mw-mono">
              Est. ~{fanOutPreview.estimatedTokens.toLocaleString()} tok
              {fanOutPreview.estimatedCostUsd > 0
                ? ` · ~$${fanOutPreview.estimatedCostUsd.toFixed(4)} USD`
                : ""}
            </span>
          </div>
          {fanOutPreview.isStaleDocument && (
            <div className="mw-faint">
              <strong>Stale evidence notice:</strong> This document is older than 12 months. The
              agent will flag operating-effectiveness limits on statutory requirements.
            </div>
          )}
          <div className="mw-row mw-row--wrap">
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              disabled={
                !fanOutPreview.provider ||
                (fanOutPreview.candidateControlCount === 0 &&
                  fanOutPreview.candidateFrameworkReqCount === 0)
              }
              onClick={() => void startFanOut(fanOutPreview)}
            >
              {fanOutPreview.provider
                ? `Start Fan-Out (${fanOutPreview.provider})`
                : "Connect an AI provider in Settings first"}
            </button>
            <button
              type="button"
              className="pp-button pp-button--ghost pp-button--sm"
              onClick={() => setFanOutPreview(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <PaperTabs
        label="Evidence sections"
        value={tab}
        onChange={handleTabChange}
        tabs={[
          { id: "uploads", label: `Uploaded Documents (${documents.length})` },
          { id: "links", label: `External Links (${evidenceLinks.length})` },
          { id: "queue", label: `AI Proposal Inbox (${totalInboxCount})` },
          { id: "collectors", label: "Local Collectors" },
        ]}
      />

      {tab === "uploads" && (
        <DocumentsTab
          documents={documents}
          isLoading={docsLoading || loadingEstimate}
          search={search}
          onSearchChange={setSearch}
          onLinkControls={setLinkingDoc}
          onMapEverywhere={(doc) => void openFanOutPreview(doc)}
          onInspectChunks={setInspectDoc}
          onEditDoc={setEditingDoc}
          onDeleteDoc={setDocToDelete}
        />
      )}

      {tab === "links" && (
        <ExternalLinksTab
          evidenceLinks={evidenceLinks}
          controls={controls}
          onDeleteLink={setLinkToDelete}
        />
      )}

      {tab === "queue" && (
        <AiReviewQueueTab
          pendingMatches={pendingMatches}
          pendingProposals={pendingProposals}
          controls={controls}
        />
      )}

      {tab === "collectors" && (
        <CollectorsTab onCaptured={() => void invalidateWorkspaceQueries()} />
      )}

      <EvidenceDialogs
        controls={controls}
        uploadSheetRef={uploadSheetRef}
        onUploadComplete={() => setTab("uploads")}
        editingDoc={editingDoc}
        onCloseEditDoc={() => setEditingDoc(null)}
        linkingDoc={linkingDoc}
        onCloseLinkingDoc={() => setLinkingDoc(null)}
        inspectDoc={inspectDoc}
        onCloseInspectDoc={() => setInspectDoc(null)}
      />

      <ConfirmDialog
        open={Boolean(docToDelete)}
        title="Remove Document?"
        message={
          docToDelete
            ? `Remove "${docToDelete.title}" from this workspace? If referenced by the immutable response change log, it will be soft-archived to preserve audit integrity.`
            : ""
        }
        confirmLabel="Remove Document"
        danger
        busy={deleteDoc.isPending}
        onConfirm={() => {
          if (docToDelete) deleteDoc.mutate(docToDelete.id);
        }}
        onClose={() => setDocToDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(linkToDelete)}
        title="Remove External Link?"
        message={linkToDelete ? `Remove "${linkToDelete.title}" from external evidence links?` : ""}
        confirmLabel="Remove Link"
        danger
        busy={deleteExternalLink.isPending}
        onConfirm={() => {
          if (linkToDelete) deleteExternalLink.mutate(linkToDelete.id);
        }}
        onClose={() => setLinkToDelete(null)}
      />
    </div>
  );
}
