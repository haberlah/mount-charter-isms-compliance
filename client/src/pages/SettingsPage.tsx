import type {
  AiProviderStatus,
  FrameworkSummary,
  Workspace,
  WorkspaceProfile,
} from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PaperTabs } from "@/components/PaperUi";
import { AiSettingsTab } from "@/components/settings/AiSettingsTab";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { ScheduleTab } from "@/components/settings/ScheduleTab";
import { WorkspacesTab } from "@/components/settings/WorkspacesTab";
import { apiRequest, revealDataFolderNative, showToast } from "@/lib/api";

type SettingsTab = "profile" | "schedule" | "ai" | "workspaces";

export function SettingsPage({
  activeWorkspace,
  workspaces,
  archivedWorkspaces = [],
  onWorkspaceChanged,
}: {
  activeWorkspace: Workspace | null;
  workspaces: Workspace[];
  archivedWorkspaces?: Workspace[];
  onWorkspaceChanged: (id: number) => void;
}) {
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const urlTab = new URLSearchParams(searchStr).get("tab") as SettingsTab | null;
  const [tab, setTab] = useState<SettingsTab>(
    urlTab && ["profile", "schedule", "ai", "workspaces"].includes(urlTab) ? urlTab : "profile",
  );

  useEffect(() => {
    if (urlTab && ["profile", "schedule", "ai", "workspaces"].includes(urlTab)) {
      setTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (next: SettingsTab) => {
    setTab(next);
    navigate(`/settings?tab=${next}`, { replace: true });
  };

  const { data } = useQuery<{
    profile: WorkspaceProfile;
    aiStatus: AiProviderStatus;
    tokensUsedToday: number;
    dataDir: string;
  }>({
    queryKey: ["settings-profile"],
    queryFn: () => apiRequest("GET", "/api/settings/profile"),
  });

  const { data: fwList = [] } = useQuery<FrameworkSummary[]>({
    queryKey: ["frameworks"],
    queryFn: () => apiRequest<FrameworkSummary[]>("GET", "/api/frameworks"),
  });

  return (
    <div className="mw-container">
      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <h1 className="pp-page-header__title">Settings</h1>
          <p className="pp-page-header__meta">
            Local data directory: <span className="mw-mono">{data?.dataDir || "—"}</span>
          </p>
        </div>
        <div className="pp-page-header__actions">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() => {
              if (!revealDataFolderNative()) {
                if (data?.dataDir && navigator.clipboard) {
                  void navigator.clipboard.writeText(data.dataDir);
                  showToast("Copied data directory path", { tone: "info" });
                }
              }
            }}
          >
            <span>Reveal Data Folder</span>
          </button>
        </div>
      </div>

      <PaperTabs
        label="Settings tabs"
        value={tab}
        onChange={handleTabChange}
        tabs={[
          { id: "profile", label: "Organisation Profile" },
          { id: "schedule", label: "Schedule & Display" },
          { id: "ai", label: "AI Providers & Subscriptions" },
          { id: "workspaces", label: "Appearance & Workspaces" },
        ]}
      />

      {tab === "profile" && <ProfileTab profile={data?.profile} frameworks={fwList} />}
      {tab === "schedule" && <ScheduleTab profile={data?.profile} />}
      {tab === "ai" && <AiSettingsTab profile={data?.profile} aiStatus={data?.aiStatus} />}
      {tab === "workspaces" && (
        <WorkspacesTab
          activeWorkspace={activeWorkspace}
          workspaces={workspaces}
          archivedWorkspaces={archivedWorkspaces}
          onWorkspaceChanged={onWorkspaceChanged}
        />
      )}
    </div>
  );
}
