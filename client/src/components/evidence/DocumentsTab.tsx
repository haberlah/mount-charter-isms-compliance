import type { DocumentRecord } from "@shared/schema";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { formatBytes, formatShortDate, Icon } from "@/components/PaperUi";
import { downloadFile, showToast } from "@/lib/api";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface DocumentsTabProps {
  documents: DocumentRecord[];
  isLoading: boolean;
  search: string;
  onSearchChange: (val: string) => void;
  onLinkControls: (doc: DocumentRecord) => void;
  onMapEverywhere: (doc: DocumentRecord) => void;
  onInspectChunks: (doc: DocumentRecord) => void;
  onEditDoc: (doc: DocumentRecord) => void;
  onDeleteDoc: (doc: DocumentRecord) => void;
}

function isDocStale(d: DocumentRecord): boolean {
  const refMs = new Date(d.documentDate || d.createdAt).getTime();
  return Date.now() - refMs > ONE_YEAR_MS;
}

export function DocumentsTab({
  documents,
  isLoading,
  search,
  onSearchChange,
  onLinkControls,
  onMapEverywhere,
  onInspectChunks,
  onEditDoc,
  onDeleteDoc,
}: DocumentsTabProps) {
  const [staleOnly, setStaleOnly] = useState(false);

  const staleCount = useMemo(() => documents.filter(isDocStale).length, [documents]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (staleOnly && !isDocStale(d)) return false;
      if (!q) return true;
      return `${d.title} ${d.originalFilename} ${d.evidenceType || ""}`.toLowerCase().includes(q);
    });
  }, [documents, search, staleOnly]);

  return (
    <div className="mw-stack">
      <div className="pp-filter-bar mw-filter-bar">
        <div className="pp-search">
          <Icon name="search" className="pp-icon pp-search__icon" />
          <input
            type="search"
            className="pp-search__input"
            placeholder="Search uploaded documents…"
            aria-label="Search uploaded documents"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <label className="pp-check">
          <input
            type="checkbox"
            checked={staleOnly}
            onChange={(e) => setStaleOnly(e.target.checked)}
          />
          <span>Stale (&gt; 12 months{staleCount > 0 ? ` · ${staleCount}` : ""})</span>
        </label>
      </div>

      <div className="pp-card">
        <div
          className="pp-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Uploaded documents table"
        >
          <table className="pp-table pp-table--compact">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Linked Controls</th>
                <th>Size</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr className="pp-table__empty">
                  <td colSpan={6}>Loading documents…</td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr className="pp-table__empty">
                  <td colSpan={6}>
                    No uploaded documents match your filter. Click Upload Documents to add policies,
                    registers, or audit records.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => {
                  const stale = isDocStale(doc);
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="mw-stack" style={{ gap: 2 }}>
                          <div className="mw-row mw-row--wrap" style={{ gap: 6 }}>
                            <span style={{ fontWeight: 500 }}>{doc.title}</span>
                            {doc.extractionStatus === "error" && (
                              <span
                                className="pp-status pp-status--err"
                                title={doc.extractionError || "Text extraction failed"}
                              >
                                Extraction Error
                              </span>
                            )}
                            {stale && <span className="pp-status pp-status--warn">Stale</span>}
                          </div>
                          <span className="mw-faint">
                            {doc.originalFilename}
                            {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="pp-badge">{doc.evidenceType || "DOCUMENT"}</span>
                      </td>
                      <td>
                        <div className="mw-chip-group">
                          {(doc.linkedControls || []).map((l) => (
                            <Link
                              key={l.linkId}
                              href={`/controls/${encodeURIComponent(l.controlNumber)}`}
                              className="pp-badge pp-badge--accent"
                              style={{ textDecoration: "none" }}
                            >
                              {l.controlNumber}
                            </Link>
                          ))}
                          <button
                            type="button"
                            className="pp-button pp-button--ghost pp-button--sm"
                            onClick={() => onLinkControls(doc)}
                          >
                            <Icon name="link-2" />
                            <span>
                              {doc.linkedControls && doc.linkedControls.length > 0
                                ? "Edit links"
                                : "Link controls"}
                            </span>
                          </button>
                        </div>
                      </td>
                      <td className="pp-table__num mw-mono mw-nowrap">
                        {formatBytes(doc.fileSize)}
                      </td>
                      <td className="mw-faint mw-mono mw-nowrap">
                        {formatShortDate(doc.documentDate || doc.createdAt)}
                      </td>
                      <td>
                        <div className="mw-row">
                          {!doc.mimeType.startsWith("image/") &&
                            doc.extractionStatus !== "error" && (
                              <button
                                type="button"
                                className="pp-button pp-button--sm"
                                title="AI fan-out: map this document across all ISO 27001 controls and enabled Australian frameworks"
                                onClick={() => onMapEverywhere(doc)}
                              >
                                Map Everywhere
                              </button>
                            )}
                          <button
                            type="button"
                            className="pp-icon-button pp-icon-button--compact"
                            aria-label={`Inspect extracted text for ${doc.title}`}
                            title="Inspect extracted text & chunks"
                            onClick={() => onInspectChunks(doc)}
                          >
                            <Icon name="file-text" />
                          </button>
                          <button
                            type="button"
                            className="pp-icon-button pp-icon-button--compact"
                            aria-label={`Edit metadata for ${doc.title}`}
                            title="Edit metadata"
                            onClick={() => onEditDoc(doc)}
                          >
                            <Icon name="pencil" />
                          </button>
                          <button
                            type="button"
                            className="pp-icon-button pp-icon-button--compact"
                            aria-label={`Download ${doc.title}`}
                            title="Download original file"
                            onClick={async () => {
                              try {
                                const res = await downloadFile(
                                  `/api/documents/${doc.id}/download`,
                                  doc.originalFilename,
                                );
                                if (!res.cancelled) {
                                  showToast(`Saved ${res.filename}`, { tone: "ok" });
                                }
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
                            aria-label={`Delete ${doc.title}`}
                            title="Remove document"
                            onClick={() => onDeleteDoc(doc)}
                          >
                            <Icon name="trash-2" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
