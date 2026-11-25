import type { ControlSummary, EvidenceLink, EvidenceType } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { formatShortDate, Icon } from "@/components/PaperUi";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface ExternalLinksTabProps {
  evidenceLinks: EvidenceLink[];
  controls: ControlSummary[];
  onDeleteLink: (link: EvidenceLink) => void;
}

export function ExternalLinksTab({ evidenceLinks, controls, onDeleteLink }: ExternalLinksTabProps) {
  const [linkSearch, setLinkSearch] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkControl, setLinkControl] = useState("");
  const [linkType, setLinkType] = useState<EvidenceType>("POLICY");
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editLinkTitle, setEditLinkTitle] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

  const addExternalLink = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/evidence-links", {
        title: linkTitle,
        url: linkUrl || null,
        controlNumber: linkControl || null,
        evidenceType: linkType,
      }),
    onSuccess: () => {
      setLinkTitle("");
      setLinkUrl("");
      setLinkControl("");
      invalidateWorkspaceQueries();
      showToast("External reference added", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const updateExternalLink = useMutation({
    mutationFn: ({ id, title, url }: { id: number; title: string; url: string | null }) =>
      apiRequest("PATCH", `/api/evidence-links/${id}`, { title, url }),
    onSuccess: () => {
      setEditingLinkId(null);
      invalidateWorkspaceQueries();
      showToast("External link updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const filteredLinks = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return evidenceLinks;
    return evidenceLinks.filter((l) =>
      `${l.title} ${l.url || ""} ${l.controlNumber || ""} ${l.evidenceType || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [evidenceLinks, linkSearch]);

  return (
    <div className="mw-stack">
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Add External Evidence Reference</h2>
        </div>
        <div className="pp-card__body">
          <form
            className="mw-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (linkTitle.trim()) addExternalLink.mutate();
            }}
          >
            <div className="mw-form-grid">
              <div className="pp-field">
                <label className="pp-field__label" htmlFor="ext-title">
                  Title
                </label>
                <input
                  id="ext-title"
                  type="text"
                  className="pp-input pp-input--sm"
                  placeholder="Information Security Policy"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  required
                />
              </div>
              <div className="pp-field">
                <label className="pp-field__label" htmlFor="ext-url">
                  URL (https:// or http://)
                </label>
                <input
                  id="ext-url"
                  type="url"
                  className="pp-input pp-input--sm"
                  placeholder="https://…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>
              <div className="pp-field">
                <label className="pp-field__label" htmlFor="ext-ctrl">
                  Control (optional)
                </label>
                <select
                  id="ext-ctrl"
                  className="pp-select pp-select--sm"
                  value={linkControl}
                  onChange={(e) => setLinkControl(e.target.value)}
                >
                  <option value="">General / Unassigned</option>
                  {controls.map((c) => (
                    <option key={c.controlNumber} value={c.controlNumber}>
                      {c.controlNumber} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pp-field">
                <label className="pp-field__label" htmlFor="ext-type">
                  Evidence Type
                </label>
                <select
                  id="ext-type"
                  className="pp-select pp-select--sm"
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value as EvidenceType)}
                >
                  <option value="POLICY">Policy</option>
                  <option value="REGISTER">Register</option>
                  <option value="RECORD">Record</option>
                  <option value="MATRIX">Matrix</option>
                  <option value="DOCUMENT">Document</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
            <div>
              <button
                type="submit"
                className="pp-button pp-button--primary pp-button--sm"
                disabled={!linkTitle.trim() || addExternalLink.isPending}
              >
                <Icon name="plus" />
                <span>Add Reference</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="pp-search" style={{ maxWidth: 420 }}>
        <Icon name="search" className="pp-icon pp-search__icon" />
        <input
          type="search"
          className="pp-search__input"
          placeholder="Search external links…"
          aria-label="Search external links"
          value={linkSearch}
          onChange={(e) => setLinkSearch(e.target.value)}
        />
      </div>

      <div className="pp-card">
        <div
          className="pp-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="External links table"
        >
          <table className="pp-table pp-table--compact">
            <thead>
              <tr>
                <th>Title</th>
                <th>Control</th>
                <th>Type</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLinks.length === 0 ? (
                <tr className="pp-table__empty">
                  <td colSpan={5}>No external evidence links saved.</td>
                </tr>
              ) : (
                filteredLinks.map((l) => {
                  const isEditing = editingLinkId === l.id;
                  return (
                    <tr key={l.id}>
                      <td>
                        {isEditing ? (
                          <div className="mw-row mw-row--wrap">
                            <input
                              type="text"
                              className="pp-input pp-input--sm"
                              value={editLinkTitle}
                              onChange={(e) => setEditLinkTitle(e.target.value)}
                              style={{ flex: 1, minWidth: 140 }}
                            />
                            <input
                              type="url"
                              className="pp-input pp-input--sm"
                              placeholder="https://…"
                              value={editLinkUrl}
                              onChange={(e) => setEditLinkUrl(e.target.value)}
                              style={{ flex: 1, minWidth: 140 }}
                            />
                            <button
                              type="button"
                              className="pp-button pp-button--primary pp-button--sm"
                              onClick={() =>
                                updateExternalLink.mutate({
                                  id: l.id,
                                  title: editLinkTitle.trim(),
                                  url: editLinkUrl.trim() || null,
                                })
                              }
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="pp-button pp-button--ghost pp-button--sm"
                              onClick={() => setEditingLinkId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : l.url ? (
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mw-table-link"
                          >
                            {l.title}
                          </a>
                        ) : (
                          l.title
                        )}
                      </td>
                      <td className="mw-mono mw-nowrap">
                        {l.controlNumber ? (
                          <Link
                            href={`/controls/${encodeURIComponent(l.controlNumber)}`}
                            className="mw-table-link"
                          >
                            {l.controlNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <span className="pp-badge">{l.evidenceType || "DOCUMENT"}</span>
                      </td>
                      <td className="mw-faint mw-mono mw-nowrap">{formatShortDate(l.createdAt)}</td>
                      <td>
                        <div className="mw-row">
                          <button
                            type="button"
                            className="pp-icon-button pp-icon-button--compact"
                            aria-label={`Edit ${l.title}`}
                            onClick={() => {
                              setEditingLinkId(l.id);
                              setEditLinkTitle(l.title);
                              setEditLinkUrl(l.url || "");
                            }}
                          >
                            <Icon name="pencil" />
                          </button>
                          <button
                            type="button"
                            className="pp-icon-button pp-icon-button--compact"
                            aria-label={`Remove ${l.title}`}
                            onClick={() => onDeleteLink(l)}
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
