import type {
  AiInteraction,
  ControlSummary,
  FrameworkSummary,
  TestRunWithControl,
  WorkspaceProfile,
} from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { AiActivityTab } from "@/components/audit/AiActivityTab";
import { AuditExportsTab } from "@/components/audit/AuditExportsTab";
import { MockAuditorTab } from "@/components/audit/MockAuditorTab";
import { SoaTab } from "@/components/audit/SoaTab";
import { TestTrailTab } from "@/components/audit/TestTrailTab";
import { PaperTabs } from "@/components/PaperUi";
import { apiRequest } from "@/lib/api";

type AuditTab = "soa" | "auditor" | "runs" | "ai" | "exports";

export function AuditPage() {
  const searchStr = useSearch();
  const [, navigate] = useLocation();
  const urlTab = new URLSearchParams(searchStr).get("tab") as AuditTab | null;

  const [tab, setTab] = useState<AuditTab>(
    urlTab && ["soa", "auditor", "runs", "ai", "exports"].includes(urlTab) ? urlTab : "soa",
  );

  useEffect(() => {
    if (urlTab && ["soa", "auditor", "runs", "ai", "exports"].includes(urlTab)) {
      setTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (next: AuditTab) => {
    setTab(next);
    navigate(`/audit?tab=${next}`, { replace: true });
  };

  const { data: controls = [] } = useQuery<ControlSummary[]>({
    queryKey: ["controls"],
    queryFn: () => apiRequest<ControlSummary[]>("GET", "/api/controls"),
  });

  const { data: settingsData } = useQuery<{ profile: WorkspaceProfile }>({
    queryKey: ["settings-profile"],
    queryFn: () => apiRequest<{ profile: WorkspaceProfile }>("GET", "/api/settings/profile"),
  });

  const { data: testRuns = [] } = useQuery<TestRunWithControl[]>({
    queryKey: ["test-runs"],
    queryFn: () => apiRequest<TestRunWithControl[]>("GET", "/api/test-runs?limit=500"),
  });

  const { data: frameworks = [] } = useQuery<FrameworkSummary[]>({
    queryKey: ["frameworks"],
    queryFn: () => apiRequest<FrameworkSummary[]>("GET", "/api/frameworks"),
  });

  const { data: aiData } = useQuery<{
    interactions: AiInteraction[];
    tokensUsedToday: number;
    dailyBudget: number;
    costUsedTodayUsd?: number;
    dailyCostBudgetUsd?: number;
  }>({
    queryKey: ["ai-interactions"],
    queryFn: () =>
      apiRequest<{
        interactions: AiInteraction[];
        tokensUsedToday: number;
        dailyBudget: number;
        costUsedTodayUsd?: number;
        dailyCostBudgetUsd?: number;
      }>("GET", "/api/ai-interactions"),
  });

  return (
    <div className="mw-container">
      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <h1 className="pp-page-header__title">Audit &amp; SoA</h1>
          <p className="pp-page-header__meta">
            ISO/IEC 27001:2022 (+ Amd 1:2024) Statement of Applicability (Clause 6.1.3(d)),
            immutable test audit trail, AI usage log, and auditor-ready exports.
          </p>
        </div>
      </div>

      <PaperTabs
        label="Audit sections"
        value={tab}
        onChange={handleTabChange}
        tabs={[
          { id: "soa", label: `Statement of Applicability (${controls.length})` },
          { id: "auditor", label: "Mock Lead Auditor" },
          { id: "runs", label: `Test Audit Trail (${testRuns.length})` },
          { id: "ai", label: `AI Activity Log (${aiData?.interactions.length ?? 0})` },
          { id: "exports", label: "Audit Pack Exports" },
        ]}
      />

      {tab === "soa" && <SoaTab controls={controls} profile={settingsData?.profile} />}
      {tab === "auditor" && <MockAuditorTab />}
      {tab === "runs" && <TestTrailTab testRuns={testRuns} />}
      {tab === "ai" && <AiActivityTab aiData={aiData} />}
      {tab === "exports" && <AuditExportsTab frameworks={frameworks} />}
    </div>
  );
}
