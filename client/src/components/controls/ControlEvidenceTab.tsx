import type { ControlDetailResponse, DocumentRecord, EvidenceType } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { formatBytes, formatShortDate, Icon } from "@/components/PaperUi";
import {
  apiRequest,
  downloadFile,
  invalidateWorkspaceQueries,
  postSseStream,
  showToast,
} from "@/lib/api";

interface ControlEvidenceTabProps {
  detail: ControlDetailResponse;
  controlNumber: string;
  libraryDocs: DocumentRecord[];
}

export function ControlEvidenceTab({
  detail,
  controlNumber,
  libraryDocs,
}: ControlEvidenceTabProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [linkDocId, setLinkDocId] = useState("");
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkType, setNewLinkType] = useState<EvidenceType>("POLICY");
  const [analysingDocId, setAnalysingDocId] = useState<number | null>(null);
  const [analysisProgressMsg, setAnalysisProgressMsg] = useState("");

  const linkedIds = new Set(detail.linkedDocuments.map((d) => d.id));
  const linkableDocs = libraryDocs.filter((d) => !linkedIds.has(d.id));

  const linkDocument = useMutation({
    mutationFn: (documentId: number) =>
      apiRequest("POST", `/api/controls/${encodeURIComponent(controlNumber)}/documents/link`, {
        documentId,
      }),
    onSuccess: () => {
      setLinkDocId("");
      invalidateWorkspaceQueries(controlNumber);
      showToast("Document linked to control", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const unlinkDocument = useMutation({
    mutationFn: (documentId: number) =>
      apiRequest(
        "DELETE",
        `/api/controls/${encodeURIComponent(controlNumber)}/documents/${documentId}`,
      ),
    onSuccess: () => {
      invalidateWorkspaceQueries(controlNumber);
      showToast("Document unlinked", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const addEvidenceLink = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/evidence-links", {
        controlNumber,
        title: newLinkTitle,
        url: newLinkUrl || null,
        evidenceType: newLinkType,
      }),
    onSuccess: () => {
      setNewLinkTitle("");
      setNewLinkUrl("");
      invalidateWorkspaceQueries(controlNumber);
      showToast("Evidence link added", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const deleteEvidenceLink = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/evidence-links/${id}`),
    onSuccess: () => {
      invalidateWorkspaceQueries(controlNumber);
      showToast("Evidence link removed", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const handleUploadDirect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    for (const f of Array.from(files)) {
      fd.append("files", f);
    }
    fd.append("controlNumber", controlNumber);
    try {
      const res = await apiRequest<{
        documents: Array<{ deduplicated?: boolean }>;
        errors?: Array<{ filename: string; error: string }>;
      }>("POST", "/api/documents/upload", fd);
      await invalidateWorkspaceQueries(controlNumber);
      const count = res.documents?.length ?? 0;
      const errCount = res.errors?.length ?? 0;
      if (errCount > 0) {
        showToast(
          `Uploaded ${count} file(s); ${errCount} failed (${res.errors![0].filename}: ${res.errors![0].error})`,
          { tone: "warn" },
        );
      } else {
        showToast(`Uploaded and linked ${count} document${count === 1 ? "" : "s"}`, { tone: "ok" });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", { tone: "err" });
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const handleAnalyseDocument = async (documentId: number) => {
    setAnalysingDocId(documentId);
    setAnalysisProgressMsg("Starting document analysis…");
    let truncated = 0;
    try {
      await postSseStream(
        `/api/controls/${encodeURIComponent(controlNumber)}/documents/${documentId}/analyse`,
        {},
        {
          onEvent: (event, data) => {
            const payload = data as {
              message?: string;
              error?: string;
              truncatedChunks?: number;
            };
            if (event === "progress" && payload.message) {
              setAnalysisProgressMsg(payload.message);
            } else if (event === "complete" && payload.truncatedChunks) {
              truncated = payload.truncatedChunks;
            } else if (event === "error") {
              throw new Error(payload.error || "Analysis failed");
            }
          },
        },
      );
      await invalidateWorkspaceQueries(controlNumber);
      showToast(
        truncated > 0
          ? `Analysis complete (${truncated} chunks skipped by Max Chunks budget) — review suggestions under Assessment`
          : "Document analysis complete — review AI suggestions under Assessment",
        { tone: truncated > 0 ? "warn" : "ok" },
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Document analysis failed", { tone: "err" });
    } finally {
      setAnalysingDocId(null);
      setAnalysisProgressMsg("");
    }
  };

  return (
    <div className="mw-stack">
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Linked Documents</h2>
          <div className="mw-row">
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg"
              style={{ display: "none" }}
              onChange={(e) => void handleUploadDirect(e.target.files)}
            />
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              onClick={() => uploadInputRef.current?.click()}
            >
              <Icon name="upload" />
              <span>Upload &amp; Link</span>
            </button>
          </div>
        </div>
        <div className="pp-card__body mw-stack">
          {linkableDocs.length > 0 && (
            <div className="mw-row">
              <select
                className="pp-select pp-select--sm"
                aria-label="Link existing library document"
                value={linkDocId}
                onChange={(e) => setLinkDocId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Link existing document from Evidence Library…</option>
                {linkableDocs.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.title} ({d.originalFilename})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pp-button pp-button--sm"
                disabled={!linkDocId || linkDocument.isPending}
                onClick={() => linkDocument.mutate(Number(linkDocId))}
              >
                <Icon name="link-2" />
                <span>Link</span>
              </button>
            </div>
          )}

          {analysisProgressMsg && (
            <div className="pp-banner pp-banner--info" role="status" aria-live="polite">
              <div className="pp-banner__body">
                <div className="pp-banner__text">{analysisProgressMsg}</div>
              </div>
            </div>
          )}

          {detail.linkedDocuments.length === 0 ? (
            <p className="mw-muted">No uploaded documents linked to {detail.controlNumber} yet.</p>
          ) : (
            detail.linkedDocuments.map((doc) => {
              const isImage = doc.mimeType.startsWith("image/");
              return (
                <div key={doc.id} className="mw-action-row">
                  <div className="mw-stack" style={{ gap: 2 }}>
                    <div style={{ fontWeight: 500 }}>{doc.title}</div>
                    <span className="mw-faint">
                      {doc.originalFilename} · {formatBytes(doc.fileSize)} ·{" "}
                      {doc.analysisStatus === "analysed"
                        ? "Analysed"
                        : doc.analysisStatus === "analysing"
                          ? "Analysing…"
                          : doc.analysisStatus === "error"
                            ? "Analysis error"
                            : "Not analysed"}
                      {doc.extractionStatus === "error" ? " · Extraction error" : ""}
                    </span>
                  </div>
                  <div className="mw-row">
                    <button
                      type="button"
                      className="pp-button pp-button--sm"
                      disabled={analysingDocId !== null || isImage}
                      title={isImage ? "Images are visual evidence only" : undefined}
                      aria-busy={analysingDocId === doc.id}
                      onClick={() => void handleAnalyseDocument(doc.id)}
                    >
                      <Icon name="sparkles" />
                      <span>
                        {isImage
                          ? "Visual only"
                          : doc.analysisStatus === "analysed"
                            ? "Re-analyse"
                            : "Analyse"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="pp-icon-button pp-icon-button--compact"
                      aria-label={`Download ${doc.title}`}
                      onClick={async () => {
                        try {
                          const res = await downloadFile(
                            `/api/documents/${doc.id}/download`,
                            doc.originalFilename,
                          );
                          if (!res.cancelled) showToast(`Saved ${res.filename}`, { tone: "ok" });
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : "Download failed", {
                            tone: "err",
                          });
                        }
                      }}
                    >
                      <Icon name="download" />
                    </button>
                    <button
                      type="button"
                      className="pp-icon-button pp-icon-button--compact"
                      aria-label={`Unlink ${doc.title}`}
                      onClick={() => unlinkDocument.mutate(doc.id)}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">External Evidence Links</h2>
        </div>
        <div className="pp-card__body mw-stack">
          <form
            className="mw-row mw-row--wrap"
            onSubmit={(e) => {
              e.preventDefault();
              if (newLinkTitle.trim()) addEvidenceLink.mutate();
            }}
          >
            <input
              type="text"
              className="pp-input pp-input--sm"
              placeholder="Evidence title (e.g. Access Control Policy v2)"
              aria-label="Evidence link title"
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
              style={{ flex: 2, minWidth: 160 }}
            />
            <input
              type="url"
              className="pp-input pp-input--sm"
              placeholder="https://…"
              aria-label="Evidence URL"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              style={{ flex: 2, minWidth: 160 }}
            />
            <select
              className="pp-select pp-select--sm"
              aria-label="Evidence type"
              value={newLinkType}
              onChange={(e) => setNewLinkType(e.target.value as EvidenceType)}
            >
              <option value="POLICY">Policy</option>
              <option value="REGISTER">Register</option>
              <option value="RECORD">Record</option>
              <option value="MATRIX">Matrix</option>
              <option value="DOCUMENT">Document</option>
              <option value="OTHER">Other</option>
            </select>
            <button
              type="submit"
              className="pp-button pp-button--sm"
              disabled={!newLinkTitle.trim() || addEvidenceLink.isPending}
            >
              Add Link
            </button>
          </form>

          {detail.evidenceLinks.length === 0 ? (
            <p className="mw-muted">No external evidence links recorded for this control.</p>
          ) : (
            detail.evidenceLinks.map((link) => (
              <div key={link.id} className="mw-action-row">
                <div className="mw-stack" style={{ gap: 2 }}>
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mw-table-link"
                    >
                      {link.title}
                    </a>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{link.title}</span>
                  )}
                  <span className="mw-faint">
                    {link.evidenceType || "DOCUMENT"} · {formatShortDate(link.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="pp-icon-button pp-icon-button--compact"
                  aria-label={`Remove evidence link ${link.title}`}
                  onClick={() => deleteEvidenceLink.mutate(link.id)}
                >
                  <Icon name="trash-2" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
