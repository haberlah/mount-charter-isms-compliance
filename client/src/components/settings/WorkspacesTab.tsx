import type { Workspace } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Icon } from "@/components/PaperUi";
import {
  apiRequest,
  downloadFile,
  invalidateWorkspaceQueries,
  setActiveWorkspaceId,
  showToast,
} from "@/lib/api";

interface WorkspacesTabProps {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  archivedWorkspaces: Workspace[];
  onWorkspaceChanged: (id: number) => void;
}

export function WorkspacesTab({
  activeWorkspace,
  workspaces,
  archivedWorkspaces,
  onWorkspaceChanged,
}: WorkspacesTabProps) {
  const [newWsName, setNewWsName] = useState("");
  const [renamingWsId, setRenamingWsId] = useState<number | null>(null);
  const [renameText, setRenameText] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState("");
  const [restoringBackup, setRestoringBackup] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleRestoreZip = async (file: File) => {
    setRestoringBackup(true);
    try {
      const form = new FormData();
      form.append("backup", file);
      const res = await apiRequest<{
        workspace: Workspace;
        restoredDocuments: number;
        restoredRisks: number;
      }>("POST", "/api/workspaces/restore", form);
      setActiveWorkspaceId(res.workspace.id);
      onWorkspaceChanged(res.workspace.id);
      await invalidateWorkspaceQueries();
      showToast(
        `Restored "${res.workspace.name}" (${res.restoredDocuments} docs, ${res.restoredRisks} risks)`,
        { tone: "ok" },
      );
    } catch (err) {
      showToast((err as Error).message, { tone: "err" });
    } finally {
      setRestoringBackup(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const createWorkspace = useMutation({
    mutationFn: () => apiRequest<Workspace>("POST", "/api/workspaces", { name: newWsName.trim() }),
    onSuccess: (ws) => {
      setNewWsName("");
      setActiveWorkspaceId(ws.id);
      onWorkspaceChanged(ws.id);
      showToast(`Created workspace "${ws.name}"`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const renameWorkspace = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiRequest<Workspace>("PATCH", `/api/workspaces/${id}`, { name }),
    onSuccess: (ws) => {
      setRenamingWsId(null);
      setRenameText("");
      invalidateWorkspaceQueries();
      showToast(`Renamed workspace to "${ws.name}"`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const archiveWorkspace = useMutation({
    mutationFn: () =>
      apiRequest<{ activeWorkspaces: Workspace[] }>(
        "POST",
        `/api/workspaces/${activeWorkspace!.id}/archive`,
      ),
    onSuccess: (res) => {
      setArchiveConfirm("");
      const next = res.activeWorkspaces[0];
      if (next) {
        setActiveWorkspaceId(next.id);
        onWorkspaceChanged(next.id);
      }
      showToast("Workspace archived (immutable audit records preserved)", { tone: "info" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const restoreWorkspace = useMutation({
    mutationFn: (id: number) =>
      apiRequest<{ restored: Workspace }>("POST", `/api/workspaces/${id}/restore`),
    onSuccess: (res) => {
      invalidateWorkspaceQueries();
      showToast(`Restored workspace "${res.restored.name}"`, { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  return (
    <div className="mw-stack">
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Appearance</h2>
        </div>
        <div className="pp-card__body">
          <div className="pp-setting">
            <div className="pp-setting__main">
              <div className="pp-setting__label">Colour Theme</div>
              <div className="pp-setting__text">
                Light by default; syncs with native macOS window chrome.
              </div>
            </div>
            <div className="pp-setting__control">
              <paper-theme-switch storage-key="mount-charter.mode" />
            </div>
          </div>
        </div>
      </div>

      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Organisations / Workspaces</h2>
          <span className="pp-card__meta">{workspaces.length} active</span>
        </div>
        <div className="pp-card__body mw-stack">
          <p className="mw-muted">
            Keep separate clients or organisations isolated in local SQLite without touching Git.
          </p>

          <div>
            {workspaces.map((w) => {
              const isRenaming = renamingWsId === w.id;
              const isActive = activeWorkspace?.id === w.id;
              return (
                <div key={w.id} className="mw-action-row">
                  {isRenaming ? (
                    <form
                      className="mw-row"
                      style={{ flex: 1 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (renameText.trim()) {
                          renameWorkspace.mutate({ id: w.id, name: renameText.trim() });
                        }
                      }}
                    >
                      <input
                        type="text"
                        className="pp-input pp-input--sm"
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        style={{ flex: 1 }}
                        autoFocus
                      />
                      <button type="submit" className="pp-button pp-button--primary pp-button--sm">
                        Save
                      </button>
                      <button
                        type="button"
                        className="pp-button pp-button--ghost pp-button--sm"
                        onClick={() => setRenamingWsId(null)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="mw-row">
                        <span style={{ fontWeight: isActive ? 600 : 400 }}>{w.name}</span>
                        {isActive && <span className="pp-badge pp-badge--accent">Active</span>}
                      </div>
                      <div className="mw-row">
                        {!isActive && (
                          <button
                            type="button"
                            className="pp-button pp-button--sm"
                            onClick={() => onWorkspaceChanged(w.id)}
                          >
                            Switch
                          </button>
                        )}
                        <button
                          type="button"
                          className="pp-icon-button pp-icon-button--compact"
                          aria-label={`Rename ${w.name}`}
                          onClick={() => {
                            setRenamingWsId(w.id);
                            setRenameText(w.name);
                          }}
                        >
                          <Icon name="pencil" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <form
            className="mw-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (newWsName.trim()) createWorkspace.mutate();
            }}
          >
            <input
              type="text"
              className="pp-input pp-input--sm"
              placeholder="New organisation / workspace name…"
              aria-label="New workspace name"
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="pp-button pp-button--primary pp-button--sm"
              disabled={!newWsName.trim() || createWorkspace.isPending}
            >
              <Icon name="plus" />
              <span>Create Workspace</span>
            </button>
          </form>
        </div>
      </div>

      {archivedWorkspaces.length > 0 && (
        <div className="pp-card">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Archived Workspaces</h2>
            <span className="pp-card__meta">{archivedWorkspaces.length} archived</span>
          </div>
          <div className="pp-card__body">
            {archivedWorkspaces.map((w) => (
              <div key={w.id} className="mw-action-row">
                <span>{w.name}</span>
                <button
                  type="button"
                  className="pp-button pp-button--sm"
                  disabled={restoreWorkspace.isPending}
                  onClick={() => restoreWorkspace.mutate(w.id)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeWorkspace && (
        <div className="pp-card">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Portable Workspace Backup &amp; Restore (.zip)</h2>
          </div>
          <div className="pp-card__body mw-stack">
            <p className="mw-muted" style={{ margin: 0 }}>
              Export a complete, self-contained ZIP archive of{" "}
              <strong>{activeWorkspace.name}</strong> (SQLite workspace records, governance
              registers, assessments, and all local binary evidence files with SHA-256 checksums) to
              back up, migrate Macs, or hand off to a client. Restoring imports into a fresh
              isolated workspace without overwriting existing data.
            </p>
            <div className="mw-row mw-row--wrap">
              <button
                type="button"
                className="pp-button pp-button--primary pp-button--sm"
                onClick={() =>
                  downloadFile(
                    `/api/workspaces/${activeWorkspace.id}/backup.zip`,
                    `mount-charter-backup-${activeWorkspace.slug}.zip`,
                  )
                }
              >
                <Icon name="download" />
                <span>Download Workspace Backup (.zip)</span>
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".zip,application/zip"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleRestoreZip(f);
                }}
              />
              <button
                type="button"
                className="pp-button pp-button--sm"
                disabled={restoringBackup}
                onClick={() => restoreInputRef.current?.click()}
              >
                <Icon name="upload" />
                <span>{restoringBackup ? "Restoring…" : "Restore Backup (.zip)…"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeWorkspace && (
        <div className="pp-card">
          <div className="pp-card__header">
            <h2 className="pp-card__title">Archive Current Workspace</h2>
          </div>
          <div className="pp-card__body mw-stack">
            <p className="mw-muted">
              Archiving hides <strong>{activeWorkspace.name}</strong> from the workspace switcher
              while preserving its immutable audit trail on disk. Type{" "}
              <span className="mw-mono">{activeWorkspace.name}</span> to confirm.
            </p>
            <div className="mw-row">
              <input
                type="text"
                className="pp-input pp-input--sm"
                placeholder={activeWorkspace.name}
                aria-label="Confirm workspace name to archive"
                value={archiveConfirm}
                onChange={(e) => setArchiveConfirm(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="pp-button pp-button--danger pp-button--sm"
                disabled={
                  archiveConfirm.trim() !== activeWorkspace.name || archiveWorkspace.isPending
                }
                onClick={() => archiveWorkspace.mutate()}
              >
                Archive Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
