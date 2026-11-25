import type { FrameworkSummary } from "@shared/schema";
import { Icon } from "@/components/PaperUi";
import { downloadFile, getActiveWorkspaceId, showToast } from "@/lib/api";

interface AuditExportsTabProps {
  frameworks: FrameworkSummary[];
}

export function AuditExportsTab({ frameworks }: AuditExportsTabProps) {
  const handleExport = async (url: string, filename: string) => {
    try {
      const res = await downloadFile(url, filename);
      if (res.cancelled) return;
      showToast(`Exported ${res.filename}`, { tone: "ok" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed", { tone: "err" });
    }
  };

  const openExecutiveReport = () => {
    const wsId = getActiveWorkspaceId();
    const url = wsId
      ? `/api/exports/executive-report.html?workspaceId=${wsId}`
      : "/api/exports/executive-report.html";
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const activeModules = frameworks.filter(
    (f) => f.enabled && f.supportTier === "full" && f.code !== "iso27001_2022",
  );

  return (
    <div className="mw-export-grid">
      {/* 1. Complete Auditor Evidence Bundle (.zip) */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Auditor Evidence Bundle (.zip)</h2>
          <span className="pp-badge pp-badge--accent">All-in-One</span>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            Self-contained ZIP handoff with print-ready Executive HTML Report, SoA, Test Trail, Risk
            &amp; Vendor registers, authored Markdown policies, every uploaded local evidence file,
            full Audit Pack JSON, and a cryptographic{" "}
            <span className="mw-mono">SHA256SUMS.txt</span> manifest.
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--primary pp-button--sm"
            onClick={() =>
              handleExport(
                "/api/exports/auditor-bundle.zip",
                "mount-charter-auditor-evidence-bundle.zip",
              )
            }
          >
            <Icon name="download" />
            <span>Download Bundle (.zip)</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Compliance Report (HTML -> PDF) */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Executive Report (HTML / PDF)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            Board- and auditor-ready single-file HTML report covering ISO 27001 readiness, Essential
            Eight weakest-link maturity, AU statutory frameworks, top risks, and full Statement of
            Applicability. Press <kbd className="pp-kbd">⌘P</kbd> to save as PDF.
          </p>
        </div>
        <div className="pp-card__footer">
          <div className="mw-row mw-row--wrap">
            <button
              type="button"
              className="pp-button pp-button--primary pp-button--sm"
              onClick={openExecutiveReport}
            >
              <span>Open Report</span>
            </button>
            <button
              type="button"
              className="pp-button pp-button--sm"
              onClick={() =>
                handleExport(
                  "/api/exports/executive-report.html?download=1",
                  "mount-charter-executive-report.html",
                )
              }
            >
              <Icon name="download" />
              <span>Save HTML</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Compliance Deadlines Calendar (.ics) */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Deadlines Calendar (.ics)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            RFC 5545 calendar feed for Apple Calendar, Outlook, or Google Calendar combining
            statutory AU deadlines (10 Dec 2026 ADM), control test due dates, CAPA due dates, policy
            reviews, and vendor contract expiries.
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              handleExport("/api/exports/deadlines.ics", "mount-charter-compliance-deadlines.ics")
            }
          >
            <Icon name="calendar" />
            <span>Export Deadlines .ics</span>
          </button>
        </div>
      </div>

      {/* 4. Statement of Applicability CSV */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Statement of Applicability (CSV)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            All 100 ISO/IEC 27001:2022 (+ Amd 1:2024) controls with applicability, inclusion &amp;
            exclusion justifications, linked Risk IDs, implementation status, SoA version/approver,
            and APRA CPS 234/230 references.
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              handleExport("/api/exports/soa.csv", "mount-charter-statement-of-applicability.csv")
            }
          >
            <Icon name="download" />
            <span>Export SoA CSV</span>
          </button>
        </div>
      </div>

      {/* 5. Test History CSV */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Test Audit Trail (CSV)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            Complete append-only history of control test runs, outcomes, AI confidence, and tester
            observations.
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              handleExport("/api/exports/test-history.csv", "mount-charter-test-history.csv")
            }
          >
            <Icon name="download" />
            <span>Export Test History CSV</span>
          </button>
        </div>
      </div>

      {/* 6. Full Audit Pack JSON */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Full Audit Pack (JSON)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            Complete machine-readable snapshot combining SoA, Amd 1:2024 Climate Change
            determination, governance registers (Risks, CAPAs, Vendors, Policies, Incidents),
            written responses, immutable logs, active AU frameworks, and document SHA-256 hashes.
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              handleExport("/api/exports/audit-pack.json", "mount-charter-audit-pack.json")
            }
          >
            <Icon name="download" />
            <span>Export Audit Pack JSON</span>
          </button>
        </div>
      </div>

      {/* 7. Risk Register CSV */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Risk Register &amp; RTP (CSV)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            Inherent and residual Likelihood × Impact scores, risk treatment plans, owners, review
            dates, and linked ISO 27001 controls (Clauses 6.1.2 / 6.1.3).
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              handleExport("/api/exports/risks.csv", "mount-charter-risk-register.csv")
            }
          >
            <Icon name="download" />
            <span>Export Risks CSV</span>
          </button>
        </div>
      </div>

      {/* 8. Vendors / CPS 230 MSP Register CSV */}
      <div className="pp-card">
        <div className="pp-card__header">
          <h2 className="pp-card__title">Vendors &amp; CPS 230 MSPs (CSV)</h2>
        </div>
        <div className="pp-card__body">
          <p className="mw-muted">
            Supplier inventory with APRA CPS 230 Material Service Provider flags, exit-plan
            verification status, APP 8 overseas data residency, and contract expiries.
          </p>
        </div>
        <div className="pp-card__footer">
          <button
            type="button"
            className="pp-button pp-button--sm"
            onClick={() =>
              handleExport("/api/exports/vendors.csv", "mount-charter-vendors-cps230.csv")
            }
          >
            <Icon name="download" />
            <span>Export Vendors CSV</span>
          </button>
        </div>
      </div>

      {/* Active First-Class AU Frameworks CSVs */}
      {activeModules.map((fw) => {
        const filename =
          fw.code === "acsc_e8_2023"
            ? "mount-charter-essential-eight-maturity.csv"
            : fw.code === "au_privacy_act"
              ? "mount-charter-privacy-act-readiness.csv"
              : `mount-charter-${fw.code}-readiness.csv`;
        return (
          <div key={fw.code} className="pp-card">
            <div className="pp-card__header">
              <h2 className="pp-card__title">{fw.shortName} (CSV)</h2>
            </div>
            <div className="pp-card__body">
              <p className="mw-muted">{fw.description}</p>
            </div>
            <div className="pp-card__footer">
              <button
                type="button"
                className="pp-button pp-button--sm"
                onClick={() =>
                  handleExport(
                    `/api/exports/framework/${encodeURIComponent(fw.code)}.csv`,
                    filename,
                  )
                }
              >
                <Icon name="download" />
                <span>Export {fw.shortName} CSV</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
