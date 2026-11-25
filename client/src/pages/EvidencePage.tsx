import type {
  ControlSummary,
  DocumentQuestionMatch,
  DocumentRecord,
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
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

type Tab = "uploads" | "links" | "queue" | "collectors";

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

  const [editingDoc, setEditingDoc] = useState<DocumentRecord | null>(null);
  const [linkingDoc, setLinkingDoc] = useState<DocumentRecord | null>(null);
  const [inspectDoc, setInspectDoc] = useState<DocumentRecord | null>(null);
  const [docToDelete, setDocToDelete] = useState<DocumentRecord | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<EvidenceLink | null>(null);

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

  const deleteDoc = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      setDocToDelete(null);
      invalidateWorkspaceQueries();
      showToast("Document removed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const deleteExternalLink = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/evidence-links/${id}`),
    onSuccess: () => {
      setLinkToDelete(null);
      invalidateWorkspaceQueries();
      showToast("Link removed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

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

      <PaperTabs
        label="Evidence sections"
        value={tab}
        onChange={handleTabChange}
        tabs={[
          { id: "uploads", label: `Uploaded Documents (${documents.length})` },
          { id: "links", label: `External Links (${evidenceLinks.length})` },
          { id: "queue", label: `AI Review Queue (${pendingMatches.length})` },
          { id: "collectors", label: "Local Collectors" },
        ]}
      />

      {tab === "uploads" && (
        <DocumentsTab
          documents={documents}
          isLoading={docsLoading}
          search={search}
          onSearchChange={setSearch}
          onLinkControls={setLinkingDoc}
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

      {tab === "queue" && <AiReviewQueueTab pendingMatches={pendingMatches} controls={controls} />}

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
