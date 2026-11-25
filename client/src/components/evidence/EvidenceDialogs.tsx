import type { ControlSummary, DocumentChunk, DocumentRecord, EvidenceType } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatBytes, Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface EvidenceDialogsProps {
  controls: ControlSummary[];
  uploadSheetRef: React.RefObject<HTMLDialogElement>;
  onUploadComplete: () => void;
  editingDoc: DocumentRecord | null;
  onCloseEditDoc: () => void;
  linkingDoc: DocumentRecord | null;
  onCloseLinkingDoc: () => void;
  inspectDoc: DocumentRecord | null;
  onCloseInspectDoc: () => void;
}

export function EvidenceDialogs({
  controls,
  uploadSheetRef,
  onUploadComplete,
  editingDoc,
  onCloseEditDoc,
  linkingDoc,
  onCloseLinkingDoc,
  inspectDoc,
  onCloseInspectDoc,
}: EvidenceDialogsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editSheetRef = useRef<HTMLDialogElement>(null);
  const linkControlsSheetRef = useRef<HTMLDialogElement>(null);
  const chunksDialogRef = useRef<HTMLDialogElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadType, setUploadType] = useState<EvidenceType>("POLICY");
  const [uploadDate, setUploadDate] = useState("");
  const [uploadControl, setUploadControl] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploading, setUploading] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState<EvidenceType>("POLICY");
  const [editDate, setEditDate] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [selectedControlNums, setSelectedControlNums] = useState<Set<string>>(new Set());
  const [controlPickerSearch, setControlPickerSearch] = useState("");

  const [inspectChunks, setInspectChunks] = useState<DocumentChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  useEffect(() => {
    if (!editingDoc) return;
    setEditTitle(editingDoc.title);
    setEditType(editingDoc.evidenceType || "DOCUMENT");
    setEditDate(editingDoc.documentDate ? editingDoc.documentDate.slice(0, 10) : "");
    setEditDesc(editingDoc.description || "");
    if (editSheetRef.current && !editSheetRef.current.open) editSheetRef.current.showModal();
  }, [editingDoc]);

  useEffect(() => {
    if (!linkingDoc) return;
    setSelectedControlNums(new Set((linkingDoc.linkedControls || []).map((l) => l.controlNumber)));
    setControlPickerSearch("");
    if (linkControlsSheetRef.current && !linkControlsSheetRef.current.open) {
      linkControlsSheetRef.current.showModal();
    }
  }, [linkingDoc]);

  useEffect(() => {
    if (!inspectDoc) return;
    setInspectChunks([]);
    setLoadingChunks(true);
    if (chunksDialogRef.current && !chunksDialogRef.current.open) {
      chunksDialogRef.current.showModal();
    }
    apiRequest<{ chunks: DocumentChunk[] }>("GET", `/api/documents/${inspectDoc.id}/chunks`)
      .then((res) => setInspectChunks(res.chunks || []))
      .catch((err) =>
        showToast(err instanceof Error ? err.message : "Failed to load extracted text", {
          tone: "err",
        }),
      )
      .finally(() => setLoadingChunks(false));
  }, [inspectDoc]);

  const pickerControls = useMemo(() => {
    const q = controlPickerSearch.trim().toLowerCase();
    if (!q) return controls;
    return controls.filter((c) =>
      `${c.controlNumber} ${c.name} ${c.category.name}`.toLowerCase().includes(q),
    );
  }, [controls, controlPickerSearch]);

  const appendFiles = (list: FileList | File[]) => {
    const incoming = Array.from(list);
    if (incoming.length > 0) setSelectedFiles((prev) => [...prev, ...incoming]);
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of selectedFiles) {
        fd.append("files", f);
      }
      fd.append("evidenceType", uploadType);
      if (uploadDate) fd.append("documentDate", uploadDate);
      if (uploadControl) fd.append("controlNumber", uploadControl);
      if (uploadDesc.trim()) fd.append("description", uploadDesc.trim());
      const res = await apiRequest<{
        documents: Array<DocumentRecord & { deduplicated?: boolean }>;
        errors?: Array<{ filename: string; error: string }>;
      }>("POST", "/api/documents/upload", fd);
      uploadSheetRef.current?.close();
      setSelectedFiles([]);
      setUploadDesc("");
      setUploadControl("");
      onUploadComplete();
      await invalidateWorkspaceQueries();

      const okCount = res.documents?.length ?? 0;
      const dedupCount = (res.documents || []).filter((d) => d.deduplicated).length;
      const errCount = res.errors?.length ?? 0;
      if (errCount > 0) {
        showToast(
          `Uploaded ${okCount} file(s); ${errCount} rejected (${res.errors![0].filename}: ${res.errors![0].error})`,
          { tone: "warn" },
        );
      } else if (dedupCount > 0) {
        showToast(
          `Saved ${okCount} file(s) (${dedupCount} matched an existing local document and was deduplicated)`,
          { tone: "info" },
        );
      } else {
        showToast(`Uploaded ${okCount} file${okCount === 1 ? "" : "s"}`, { tone: "ok" });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Upload failed", { tone: "err" });
    } finally {
      setUploading(false);
    }
  };

  const saveEditDoc = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/documents/${editingDoc!.id}`, {
        title: editTitle,
        evidenceType: editType,
        documentDate: editDate || null,
        description: editDesc || null,
      }),
    onSuccess: () => {
      editSheetRef.current?.close();
      onCloseEditDoc();
      invalidateWorkspaceQueries();
      showToast("Document metadata updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const saveControlLinks = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/documents/${linkingDoc!.id}/controls`, {
        controlNumbers: Array.from(selectedControlNums),
      }),
    onSuccess: () => {
      linkControlsSheetRef.current?.close();
      onCloseLinkingDoc();
      invalidateWorkspaceQueries();
      showToast(`Updated control links (${selectedControlNums.size} linked)`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  return (
    <>
      <dialog
        ref={uploadSheetRef}
        className="pp-sheet"
        closedby="any"
        aria-labelledby="upload-sheet-title"
      >
        <div className="pp-sheet__header">
          <h2 id="upload-sheet-title" className="pp-sheet__title">
            Upload Evidence Documents
          </h2>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--compact"
            aria-label="Close upload drawer"
            onClick={() => uploadSheetRef.current?.close()}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="pp-sheet__body mw-stack">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg"
            style={{ display: "none" }}
            onChange={(e) => {
              if (e.target.files) appendFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={`mw-dropzone${dragActive ? " mw-dropzone--active" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files) appendFiles(e.dataTransfer.files);
            }}
          >
            <Icon name="upload" />
            <strong>Choose files or drop them here</strong>
            <span className="mw-faint">
              PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPG (up to 25 MB each)
            </span>
          </button>

          {selectedFiles.length > 0 && (
            <div className="mw-stack mw-stack--sm">
              {selectedFiles.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="mw-action-row">
                  <span>{f.name}</span>
                  <div className="mw-row">
                    <span className="mw-faint mw-mono">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      className="pp-icon-button pp-icon-button--compact"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="up-type">
              Evidence Type
            </label>
            <select
              id="up-type"
              className="pp-select"
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value as EvidenceType)}
            >
              <option value="POLICY">Policy</option>
              <option value="REGISTER">Register</option>
              <option value="RECORD">Record</option>
              <option value="MATRIX">Matrix</option>
              <option value="DOCUMENT">Document</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="up-control">
              Initial Control Link (optional)
            </label>
            <select
              id="up-control"
              className="pp-select"
              value={uploadControl}
              onChange={(e) => setUploadControl(e.target.value)}
            >
              <option value="">Store in library only</option>
              {controls.map((c) => (
                <option key={c.controlNumber} value={c.controlNumber}>
                  {c.controlNumber} — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="up-date">
              Document Date (optional)
            </label>
            <input
              id="up-date"
              type="date"
              className="pp-input"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
            />
          </div>

          <div className="pp-field">
            <label className="pp-field__label" htmlFor="up-desc">
              Notes (optional)
            </label>
            <textarea
              id="up-desc"
              className="pp-textarea"
              rows={3}
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="pp-button pp-button--primary"
            disabled={selectedFiles.length === 0 || uploading}
            aria-busy={uploading}
            onClick={handleUploadSubmit}
          >
            {uploading ? "Uploading & Extracting…" : "Upload to Local Library"}
          </button>
        </div>
      </dialog>

      <dialog
        ref={linkControlsSheetRef}
        className="pp-sheet"
        closedby="any"
        aria-labelledby="link-ctrls-title"
        onClose={onCloseLinkingDoc}
      >
        <div className="pp-sheet__header">
          <h2 id="link-ctrls-title" className="pp-sheet__title">
            Link Controls — {linkingDoc?.title}
          </h2>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--compact"
            aria-label="Close link controls drawer"
            onClick={() => linkControlsSheetRef.current?.close()}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="pp-sheet__body mw-stack">
          <div className="pp-search">
            <Icon name="search" className="pp-icon pp-search__icon" />
            <input
              type="search"
              className="pp-search__input"
              placeholder="Filter controls to link…"
              value={controlPickerSearch}
              onChange={(e) => setControlPickerSearch(e.target.value)}
            />
          </div>
          <div className="mw-faint">{selectedControlNums.size} controls selected</div>
          <div className="mw-stack mw-stack--sm" style={{ maxHeight: "55vh", overflowY: "auto" }}>
            {pickerControls.map((c) => {
              const checked = selectedControlNums.has(c.controlNumber);
              return (
                <label key={c.controlNumber} className="pp-check" style={{ padding: "4px 2px" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedControlNums((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.controlNumber);
                        else next.delete(c.controlNumber);
                        return next;
                      });
                    }}
                  />
                  <span>
                    <span className="mw-mono">{c.controlNumber}</span> {c.name}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="pp-button pp-button--primary"
            disabled={saveControlLinks.isPending}
            onClick={() => saveControlLinks.mutate()}
          >
            {saveControlLinks.isPending
              ? "Saving…"
              : `Save Control Links (${selectedControlNums.size})`}
          </button>
        </div>
      </dialog>

      <dialog
        ref={chunksDialogRef}
        className="pp-dialog"
        closedby="any"
        aria-labelledby="chunks-dialog-title"
        onClose={onCloseInspectDoc}
      >
        <div className="pp-dialog__header">
          <h2 id="chunks-dialog-title" className="pp-dialog__title">
            Extracted Text — {inspectDoc?.title}
          </h2>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--compact"
            aria-label="Close inspector"
            onClick={() => chunksDialogRef.current?.close()}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="pp-dialog__body mw-stack" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {inspectDoc && (
            <div className="mw-row mw-row--between mw-row--wrap">
              <span className="mw-faint">
                {inspectDoc.originalFilename} · {inspectDoc.extractionStatus}
                {inspectDoc.extractionError ? ` (${inspectDoc.extractionError})` : ""}
              </span>
              <a
                href={`/api/documents/${inspectDoc.id}/preview`}
                target="_blank"
                rel="noopener noreferrer"
                className="pp-button pp-button--sm"
              >
                Open Raw Preview
              </a>
            </div>
          )}
          {loadingChunks ? (
            <p className="mw-muted">Loading extracted chunks…</p>
          ) : inspectChunks.length === 0 ? (
            <p className="mw-muted">No extracted text chunks available for this document.</p>
          ) : (
            inspectChunks.map((ch) => (
              <div key={ch.id} className="mw-question-card">
                <div className="mw-row mw-row--between">
                  <span className="pp-badge">Chunk #{ch.chunkIndex + 1}</span>
                  <span className="mw-faint">
                    {ch.sectionHeading || "Body"} · ~{ch.tokenCount} tokens
                  </span>
                </div>
                <pre
                  className="mw-quote"
                  style={{ maxHeight: 180, overflowY: "auto", whiteSpace: "pre-wrap" }}
                >
                  {ch.content}
                </pre>
              </div>
            ))
          )}
        </div>
        <div className="pp-dialog__footer">
          <button
            type="button"
            className="pp-button"
            onClick={() => chunksDialogRef.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>

      <dialog
        ref={editSheetRef}
        className="pp-sheet"
        closedby="any"
        aria-labelledby="edit-doc-title"
        onClose={onCloseEditDoc}
      >
        <div className="pp-sheet__header">
          <h2 id="edit-doc-title" className="pp-sheet__title">
            Edit Document Metadata
          </h2>
          <button
            type="button"
            className="pp-icon-button pp-icon-button--compact"
            aria-label="Close edit drawer"
            onClick={() => editSheetRef.current?.close()}
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="pp-sheet__body mw-stack">
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="edit-title">
              Title
            </label>
            <input
              id="edit-title"
              type="text"
              className="pp-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="edit-type">
              Evidence Type
            </label>
            <select
              id="edit-type"
              className="pp-select"
              value={editType}
              onChange={(e) => setEditType(e.target.value as EvidenceType)}
            >
              <option value="POLICY">Policy</option>
              <option value="REGISTER">Register</option>
              <option value="RECORD">Record</option>
              <option value="MATRIX">Matrix</option>
              <option value="DOCUMENT">Document</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="edit-date">
              Document Date
            </label>
            <input
              id="edit-date"
              type="date"
              className="pp-input"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="edit-desc">
              Description
            </label>
            <textarea
              id="edit-desc"
              className="pp-textarea"
              rows={3}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="pp-button pp-button--primary"
            disabled={!editTitle.trim() || saveEditDoc.isPending}
            onClick={() => saveEditDoc.mutate()}
          >
            {saveEditDoc.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </dialog>
    </>
  );
}
