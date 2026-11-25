import type { FrameworkSummary, RiskAppetite, WorkspaceProfile } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiRequest, invalidateWorkspaceQueries, showToast } from "@/lib/api";

interface ProfileTabProps {
  profile: WorkspaceProfile | undefined;
  frameworks: FrameworkSummary[];
}

export function ProfileTab({ profile, frameworks }: ProfileTabProps) {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [techStack, setTechStack] = useState("");
  const [deploymentModel, setDeploymentModel] = useState("");
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite>("Moderate");
  const [additionalContext, setAdditionalContext] = useState("");

  useEffect(() => {
    if (!profile) return;
    setCompanyName(profile.companyName || "");
    setIndustry(profile.industry || "");
    setCompanySize(profile.companySize || "");
    setTechStack(profile.techStack || "");
    setDeploymentModel(profile.deploymentModel || "");
    setRiskAppetite(profile.riskAppetite || "Moderate");
    setAdditionalContext(profile.additionalContext || "");
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings/profile", {
        companyName: companyName.trim() || null,
        industry: industry.trim() || null,
        companySize: companySize.trim() || null,
        techStack: techStack.trim() || null,
        deploymentModel: deploymentModel.trim() || null,
        riskAppetite,
        additionalContext: additionalContext.trim() || null,
      }),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("Organisation profile saved", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const toggleFramework = useMutation({
    mutationFn: ({ code, enabled }: { code: string; enabled: boolean }) =>
      apiRequest("PUT", `/api/frameworks/${encodeURIComponent(code)}/config`, { enabled }),
    onSuccess: () => {
      invalidateWorkspaceQueries();
      showToast("Framework scope updated", { tone: "ok" });
    },
    onError: (err: Error) => showToast(err.message, { tone: "err" }),
  });

  const fullFrameworks = frameworks.filter((f) => f.supportTier === "full");
  const crossMappedFrameworks = frameworks.filter((f) => f.supportTier === "cross_mapped");
  const advisoryFrameworks = frameworks.filter((f) => f.supportTier === "ai_context_only");
  const e8Enabled = fullFrameworks.some((f) => f.code === "acsc_e8_2023" && f.enabled);

  return (
    <div className="pp-card">
      <div className="pp-card__body mw-stack">
        <div className="mw-form-grid">
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prof-name">
              Organisation Name
            </label>
            <input
              id="prof-name"
              className="pp-input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prof-industry">
              Industry
            </label>
            <input
              id="prof-industry"
              className="pp-input"
              placeholder="e.g. Financial Services, HealthTech, SaaS"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prof-size">
              Organisation Size
            </label>
            <input
              id="prof-size"
              className="pp-input"
              placeholder="e.g. 15 staff"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
            />
          </div>
          <div className="pp-field">
            <label className="pp-field__label" htmlFor="prof-deploy">
              Deployment Model
            </label>
            <input
              id="prof-deploy"
              className="pp-input"
              placeholder="e.g. Cloud-native (GCP AU / AWS Sydney)"
              value={deploymentModel}
              onChange={(e) => setDeploymentModel(e.target.value)}
            />
          </div>
        </div>

        <div className="pp-field">
          <label className="pp-field__label" htmlFor="prof-tech">
            Technology Stack
          </label>
          <input
            id="prof-tech"
            className="pp-input"
            placeholder="e.g. TypeScript, PostgreSQL, Google Workspace, GitHub"
            value={techStack}
            onChange={(e) => setTechStack(e.target.value)}
          />
        </div>

        <div className="pp-field">
          <div className="mw-row mw-row--between">
            <span className="pp-field__label">
              First-Class Assurance Modules (Controls, Scoring &amp; Exports)
            </span>
            <Link href="/frameworks" className="mw-table-link mw-faint">
              Open Frameworks →
            </Link>
          </div>
          <div className="mw-chip-group" role="group" aria-label="First-class frameworks">
            {fullFrameworks.map((fw) => (
              <button
                key={fw.code}
                type="button"
                className="pp-filter-chip"
                aria-pressed={fw.enabled}
                disabled={fw.code === "iso27001_2022"}
                onClick={() => toggleFramework.mutate({ code: fw.code, enabled: !fw.enabled })}
              >
                {fw.shortName}
                {fw.code === "iso27001_2022" ? " (Core)" : ""}
              </button>
            ))}
          </div>
          {e8Enabled && (
            <p className="mw-faint" style={{ margin: "4px 0 0" }}>
              Note: ACSC Essential Eight mandates 48-hour critical patching (stricter than ISO
              8.7:Q7 risk-based windows) and phishing-resistant MFA at ML2–ML3.
            </p>
          )}
        </div>

        {crossMappedFrameworks.length > 0 && (
          <div className="pp-field">
            <span className="pp-field__label">ISO 27001 Cross-Mapped Standards</span>
            <div className="mw-chip-group" role="group" aria-label="Cross-mapped frameworks">
              {crossMappedFrameworks.map((fw) => (
                <button
                  key={fw.code}
                  type="button"
                  className="pp-filter-chip"
                  aria-pressed={fw.enabled}
                  onClick={() => toggleFramework.mutate({ code: fw.code, enabled: !fw.enabled })}
                >
                  {fw.shortName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pp-field">
          <span className="pp-field__label">
            AI Prompt Context Tags (Advisory Only — No Dedicated Control Library Yet)
          </span>
          <div className="mw-chip-group" role="group" aria-label="Advisory AI context frameworks">
            {advisoryFrameworks.map((fw) => (
              <button
                key={fw.code}
                type="button"
                className="pp-filter-chip"
                aria-pressed={fw.enabled}
                onClick={() => toggleFramework.mutate({ code: fw.code, enabled: !fw.enabled })}
              >
                {fw.shortName}
              </button>
            ))}
          </div>
          <p className="mw-faint" style={{ margin: "4px 0 0" }}>
            Advisory tags inform AI review prompts only and are labelled separately from audited
            frameworks in exported packs.
          </p>
        </div>

        <div className="pp-field">
          <span className="pp-field__label">Risk Appetite</span>
          <div className="pp-segmented" role="group" aria-label="Risk appetite">
            {(["Conservative", "Moderate", "Aggressive"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className="pp-segmented__item"
                aria-pressed={riskAppetite === r}
                onClick={() => setRiskAppetite(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="pp-field">
          <label className="pp-field__label" htmlFor="prof-context">
            Additional ISMS Context (supplied to AI reviews)
          </label>
          <textarea
            id="prof-context"
            className="pp-textarea"
            rows={4}
            placeholder="Describe scope boundaries, key third parties, or data residency requirements…"
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
          />
        </div>

        <div>
          <button
            type="button"
            className="pp-button pp-button--primary"
            disabled={saveProfile.isPending}
            onClick={() => saveProfile.mutate()}
          >
            {saveProfile.isPending ? "Saving…" : "Save Organisation Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
