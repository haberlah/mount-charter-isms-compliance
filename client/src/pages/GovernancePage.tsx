import type {
  CapaRecord,
  GovernanceReviewRecord,
  IncidentRecord,
  PolicyRecord,
  RiskRecord,
  VendorRecord,
} from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CapaAndReviewsTab } from "@/components/governance/CapaAndReviewsTab";
import { IncidentsTab } from "@/components/governance/IncidentsTab";
import { PoliciesTab } from "@/components/governance/PoliciesTab";
import { RisksTab } from "@/components/governance/RisksTab";
import { VendorsTab } from "@/components/governance/VendorsTab";
import { PaperTabs } from "@/components/PaperUi";
import { apiRequest, getActiveWorkspaceId } from "@/lib/api";

type GovernanceTab = "risks" | "capa" | "vendors" | "policies" | "incidents";

export function GovernancePage() {
  const wsId = getActiveWorkspaceId();
  const initialTab = (() => {
    const raw = new URLSearchParams(window.location.search).get("tab");
    if (
      raw === "risks" ||
      raw === "capa" ||
      raw === "vendors" ||
      raw === "policies" ||
      raw === "incidents"
    ) {
      return raw;
    }
    return "risks";
  })();
  const [tab, setTab] = useState<GovernanceTab>(initialTab);

  const { data: risks = [], refetch: refetchRisks } = useQuery<RiskRecord[]>({
    queryKey: ["governance-risks", wsId],
    queryFn: () => apiRequest<RiskRecord[]>("GET", "/api/governance/risks"),
  });

  const { data: capas = [], refetch: refetchCapas } = useQuery<CapaRecord[]>({
    queryKey: ["governance-capas", wsId],
    queryFn: () => apiRequest<CapaRecord[]>("GET", "/api/governance/capas"),
  });

  const { data: reviews = [], refetch: refetchReviews } = useQuery<GovernanceReviewRecord[]>({
    queryKey: ["governance-reviews", wsId],
    queryFn: () => apiRequest<GovernanceReviewRecord[]>("GET", "/api/governance/reviews"),
  });

  const { data: vendors = [], refetch: refetchVendors } = useQuery<VendorRecord[]>({
    queryKey: ["governance-vendors", wsId],
    queryFn: () => apiRequest<VendorRecord[]>("GET", "/api/governance/vendors"),
  });

  const { data: policies = [], refetch: refetchPolicies } = useQuery<PolicyRecord[]>({
    queryKey: ["governance-policies", wsId],
    queryFn: () => apiRequest<PolicyRecord[]>("GET", "/api/governance/policies"),
  });

  const { data: incidents = [], refetch: refetchIncidents } = useQuery<IncidentRecord[]>({
    queryKey: ["governance-incidents", wsId],
    queryFn: () => apiRequest<IncidentRecord[]>("GET", "/api/governance/incidents"),
  });

  const openCapas = capas.filter((c) => c.status !== "VerifiedClosed").length;
  const activeIncidents = incidents.filter((i) => i.status !== "Closed").length;

  const tabs: Array<{ id: GovernanceTab; label: string }> = [
    { id: "risks", label: `Risks (${risks.length})` },
    { id: "capa", label: `CAPA & Reviews (${openCapas})` },
    { id: "vendors", label: `Vendors & CPS 230 (${vendors.length})` },
    { id: "policies", label: `Policies (${policies.length})` },
    { id: "incidents", label: `Incidents & Clocks (${activeIncidents})` },
  ];

  return (
    <div className="mw-container">
      <div className="pp-page-header">
        <div className="pp-page-header__main">
          <h1 className="pp-page-header__title">ISMS Governance Registers</h1>
          <p className="pp-page-header__meta">
            Certification-mandatory ISO 27001 registers — Risk Assessment &amp; Treatment, CAPA,
            Internal Audits, CPS 230 Material Service Providers, Policies, and Statutory Breach
            Clocks.
          </p>
        </div>
      </div>

      <PaperTabs tabs={tabs} value={tab} onChange={setTab} label="ISMS Governance registers" />

      {tab === "risks" && <RisksTab risks={risks} onRefresh={() => void refetchRisks()} />}
      {tab === "capa" && (
        <CapaAndReviewsTab
          capas={capas}
          reviews={reviews}
          onRefresh={() => {
            void refetchCapas();
            void refetchReviews();
          }}
        />
      )}
      {tab === "vendors" && (
        <VendorsTab vendors={vendors} onRefresh={() => void refetchVendors()} />
      )}
      {tab === "policies" && (
        <PoliciesTab policies={policies} onRefresh={() => void refetchPolicies()} />
      )}
      {tab === "incidents" && (
        <IncidentsTab incidents={incidents} onRefresh={() => void refetchIncidents()} />
      )}
    </div>
  );
}
