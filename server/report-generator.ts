import { createHash } from "node:crypto";
import { getBlob } from "./blob-store";
import { escapeCsvField } from "./csv";
import { storage } from "./storage";
import { buildZip, type ZipInputEntry } from "./zip-writer";

function escHtml(raw: string | number | null | undefined): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Self-contained print-ready Executive Compliance Report (HTML -> Safari/macOS Print to PDF).
 */
export function buildExecutiveReportHtml(workspaceId: number): string {
  const workspace = storage.getWorkspace(workspaceId);
  const profile = storage.getProfile(workspaceId);
  const stats = storage.getDashboardStats(workspaceId);
  const controls = storage.listControlsWithStatus(workspaceId);
  const risks = storage.listRisks(workspaceId);
  const capas = storage.listCapas(workspaceId);
  const vendors = storage.listVendors(workspaceId);
  const policies = storage.listPolicies(workspaceId);
  const incidents = storage.listIncidents(workspaceId);
  const documents = storage.listDocuments(workspaceId);
  const activeFrameworks = stats.frameworks.filter((f) => f.enabled && f.supportTier === "full");
  const generated = new Date().toISOString();

  const fwRows = activeFrameworks
    .map(
      (f) => `<tr>
        <td><strong>${escHtml(f.name)}</strong><br/><span class="muted">${escHtml(f.instrumentId || f.version)}</span></td>
        <td>${escHtml(f.jurisdiction)}</td>
        <td>${
          f.code === "iso27001_2022"
            ? `${stats.compliancePercentage}% (${stats.passedControls}/${stats.applicableControls})`
            : f.code === "acsc_e8_2023"
              ? `<strong>${escHtml(f.weakestLinkMaturity || "ML0")}</strong> (${f.metCount}/${f.totalRequirements})`
              : `${f.readinessPercentage}% (${f.metCount}/${f.totalRequirements})`
        }</td>
        <td>${f.driftCount > 0 ? `<span class="warn">${f.driftCount} drift alert(s)</span>` : "Clean"}</td>
      </tr>`,
    )
    .join("");

  const topRisksRows = risks
    .slice(0, 12)
    .map(
      (r) => `<tr>
        <td class="mono">${escHtml(r.riskCode)}</td>
        <td>${escHtml(r.title)}</td>
        <td>${r.inherentScore} → <strong>${r.residualScore}</strong></td>
        <td>${escHtml(r.treatment)}</td>
        <td class="mono">${escHtml(r.linkedControls.join(", ") || "—")}</td>
        <td>${escHtml(r.status)}</td>
      </tr>`,
    )
    .join("");

  const soaRows = controls
    .map(
      (c) => `<tr>
        <td class="mono">${escHtml(c.controlNumber)}</td>
        <td>${escHtml(c.name)}</td>
        <td>${c.workspaceControl.isApplicable ? "Yes" : "Excluded"}</td>
        <td>${escHtml(c.workspaceControl.implementationStatus)}</td>
        <td>${escHtml(c.latestTestRun?.status || "NotAttempted")}</td>
        <td class="mono">${escHtml((c.linkedRiskCodes || []).join(", ") || "—")}</td>
        <td>${escHtml(
          c.workspaceControl.isApplicable
            ? c.workspaceControl.inclusionJustification || ""
            : c.workspaceControl.exclusionJustification || "",
        )}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escHtml(workspace?.name || "Organisation")} — Mount Charter Compliance Executive Report</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif; color: #16181d; background: #fff; margin: 36px auto; max-width: 1020px; line-height: 1.5; font-size: 13px; padding: 0 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 16px; margin: 28px 0 10px; border-bottom: 1px solid #e2e5ec; padding-bottom: 6px; page-break-after: avoid; }
  .muted { color: #5b6372; font-size: 12px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; }
  .warn { color: #9a5b00; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .card { border: 1px solid #e2e5ec; border-radius: 10px; padding: 12px 14px; background: #fafbfc; }
  .card .k { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b6372; }
  .card .v { font-size: 22px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 20px; font-size: 12px; }
  th, td { border-bottom: 1px solid #e8ebf0; padding: 7px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f7fa; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; color: #475061; }
  .print-hint { float: right; padding: 6px 12px; border-radius: 8px; border: 1px solid #cfd5e1; background: #fafbfc; font-size: 12px; color: #475061; }
  @media print { .print-hint { display: none; } body { margin: 0; max-width: none; } }
</style>
</head>
<body>
  <div class="print-hint">Press <strong>⌘P</strong> (Print) → Save as PDF</div>
  <h1>${escHtml(workspace?.name || "Organisation")} — ISMS &amp; Australian Compliance Report</h1>
  <div class="muted">
    Generated ${escHtml(generated)} by Mount Charter v3.0 · SoA v${escHtml(profile.soaVersion)}
    ${profile.soaApprovedBy ? ` · Approved by ${escHtml(profile.soaApprovedBy)} (${escHtml(profile.soaApprovedAt || "Date TBD")})` : ""}
    · Amd 1:2024 Climate Change: <strong>${escHtml(profile.climateChangeRelevant)}</strong>
  </div>

  <div class="grid">
    <div class="card"><div class="k">ISO 27001 Compliance</div><div class="v">${stats.compliancePercentage}%</div><div class="muted">${stats.passedControls} of ${stats.applicableControls} passed</div></div>
    <div class="card"><div class="k">Questionnaire Progress</div><div class="v">${stats.questionnaireProgress.percentage}%</div><div class="muted">${stats.questionnaireProgress.answeredQuestions}/${stats.questionnaireProgress.totalQuestions} answered</div></div>
    <div class="card"><div class="k">Evidence Library</div><div class="v">${documents.length}</div><div class="muted">${stats.documentStats.controlsWithEvidence} controls evidenced</div></div>
    <div class="card"><div class="k">Governance Health</div><div class="v">${risks.length} Risks</div><div class="muted">${capas.filter((c) => c.status !== "VerifiedClosed").length} open CAPA · ${vendors.length} vendors · ${policies.length} policies · ${incidents.filter((i) => i.status !== "Closed").length} active incidents</div></div>
  </div>

  <h2>1. Active Assurance &amp; Legislative Frameworks</h2>
  <table>
    <thead><tr><th>Framework &amp; Instrument</th><th>Jurisdiction</th><th>Readiness / Maturity</th><th>Cross-Framework Drift</th></tr></thead>
    <tbody>${fwRows}</tbody>
  </table>

  <h2>2. Top Risks &amp; Risk Treatment Plan (ISO Clauses 6.1.2 / 6.1.3)</h2>
  ${
    risks.length === 0
      ? `<p class="muted">No risks recorded in the Risk Register yet.</p>`
      : `<table>
          <thead><tr><th>Code</th><th>Risk</th><th>Inherent → Residual</th><th>Treatment</th><th>Linked ISO Controls</th><th>Status</th></tr></thead>
          <tbody>${topRisksRows}</tbody>
        </table>`
  }

  <h2>3. ISO/IEC 27001:2022 (+ Amd 1:2024) Statement of Applicability</h2>
  <table>
    <thead><tr><th>Control</th><th>Name</th><th>Applicable</th><th>Implementation</th><th>Latest Test</th><th>Linked Risks</th><th>Justification (6.1.3(d))</th></tr></thead>
    <tbody>${soaRows}</tbody>
  </table>

  <p class="muted" style="margin-top: 28px; border-top: 1px solid #e2e5ec; padding-top: 10px;">
    Generated locally by Mount Charter. Operational compliance workbench output — verify statutory obligations against the Federal Register of Legislation and accredited certification auditors.
  </p>
</body>
</html>`;
}

/**
 * Self-contained Auditor Evidence Bundle (.zip) with HTML Executive Report,
 * all CSV registers, authored Policy Markdown files, actual local evidence binaries,
 * full Audit-Pack.json, and cryptographic SHA256SUMS.txt manifest.
 */
export function buildAuditorBundleZip(workspaceId: number): Buffer {
  const entries: ZipInputEntry[] = [];
  const profile = storage.getProfile(workspaceId);
  const controls = storage.listControlsWithStatus(workspaceId);
  const testRuns = storage.listTestRuns(workspaceId, 100_000);
  const frameworks = storage.listFrameworks(workspaceId);
  const documents = storage.listDocuments(workspaceId);
  const risks = storage.listRisks(workspaceId);
  const capas = storage.listCapas(workspaceId);
  const vendors = storage.listVendors(workspaceId);
  const policies = storage.listPolicies(workspaceId);
  const incidents = storage.listIncidents(workspaceId);
  const reviews = storage.listReviews(workspaceId);

  // 1. Print-ready Executive Report
  entries.push({
    name: "00-Executive-Compliance-Report.html",
    content: buildExecutiveReportHtml(workspaceId),
  });

  // 2. Statement of Applicability CSV (including Risk Traceability)
  const soaHeaders = [
    "Control Number",
    "Control Name",
    "Category",
    "Applicable",
    "Linked Risks",
    "Inclusion Justification",
    "Exclusion Justification",
    "Implementation Status",
    "Latest Test Status",
    "Questions Answered",
    "Total Questions",
    "SoA Version",
  ];
  const soaCsv = [
    soaHeaders.map(escapeCsvField).join(","),
    ...controls.map((c) =>
      [
        c.controlNumber,
        c.name,
        c.category.name,
        c.workspaceControl.isApplicable ? "Yes" : "No",
        (c.linkedRiskCodes || []).join("; "),
        c.workspaceControl.inclusionJustification || "",
        c.workspaceControl.exclusionJustification || "",
        c.workspaceControl.implementationStatus,
        c.latestTestRun?.status || "NotAttempted",
        c.questionnaireProgress.answered,
        c.questionnaireProgress.total,
        profile.soaVersion,
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ].join("\n");
  entries.push({ name: "01-ISO27001-Statement-of-Applicability.csv", content: soaCsv });

  // 3. Immutable Test History CSV
  const testCsv = [
    ["Test Run ID", "Date", "Control", "Name", "Status", "Comments"].map(escapeCsvField).join(","),
    ...testRuns.map((r) =>
      [r.id, r.testDate, r.controlNumber, r.controlName, r.status, r.comments || ""]
        .map(escapeCsvField)
        .join(","),
    ),
  ].join("\n");
  entries.push({ name: "02-ISO27001-Test-History.csv", content: testCsv });

  // 4. Every enabled first-class framework CSV
  for (const fw of frameworks.filter(
    (f) => f.enabled && f.supportTier === "full" && f.code !== "iso27001_2022",
  )) {
    const detail = storage.getFrameworkDetail(workspaceId, fw.code);
    if (!detail) continue;
    const fwCsv = [
      [
        "Code",
        "Clause Ref",
        "Domain",
        "Level/Category",
        "Title",
        "Lifecycle",
        "Status",
        "Linked ISO Controls",
        "Drift Warnings",
        "Owner",
        "Evidence Summary",
        "Notes",
      ]
        .map(escapeCsvField)
        .join(","),
      ...detail.requirements.map((r) =>
        [
          r.reqCode,
          r.clauseRef || "",
          r.domain,
          r.levelOrCategory || "",
          r.title,
          r.isDraft ? "Draft" : "In Force",
          r.assessment.status,
          r.linkedControls.map((lc) => `${lc.controlNumber} (${lc.coverage})`).join("; "),
          r.driftWarnings.map((w) => w.reason).join("; "),
          r.assessment.owner || "",
          r.assessment.evidenceSummary || "",
          r.assessment.notes || "",
        ]
          .map(escapeCsvField)
          .join(","),
      ),
    ].join("\n");
    entries.push({ name: `03-Frameworks/${fw.code}.csv`, content: fwCsv });
  }

  // 5. Governance CSVs
  entries.push({
    name: "04-Governance/Risk-Register.csv",
    content: [
      ["Code", "Title", "Inherent", "Residual", "Treatment", "Linked Controls", "Owner", "Status"]
        .map(escapeCsvField)
        .join(","),
      ...risks.map((r) =>
        [
          r.riskCode,
          r.title,
          r.inherentScore,
          r.residualScore,
          r.treatment,
          r.linkedControls.join("; "),
          r.owner || "",
          r.status,
        ]
          .map(escapeCsvField)
          .join(","),
      ),
    ].join("\n"),
  });

  entries.push({
    name: "04-Governance/CAPA-Register.csv",
    content: [
      [
        "Code",
        "Type",
        "Title",
        "Control",
        "Root Cause",
        "Corrective Action",
        "Owner",
        "Due",
        "Status",
      ]
        .map(escapeCsvField)
        .join(","),
      ...capas.map((c) =>
        [
          c.capaCode,
          c.findingType,
          c.title,
          c.controlNumber || c.reqCode || "",
          c.rootCause || "",
          c.correctiveAction || "",
          c.owner || "",
          c.dueDate || "",
          c.status,
        ]
          .map(escapeCsvField)
          .join(","),
      ),
    ].join("\n"),
  });

  entries.push({
    name: "04-Governance/Vendors-CPS230.csv",
    content: [
      [
        "Name",
        "MSP (CPS 230)",
        "Criticality",
        "Data Residency",
        "Exit Plan",
        "Contract Expiry",
        "Owner",
      ]
        .map(escapeCsvField)
        .join(","),
      ...vendors.map((v) =>
        [
          v.name,
          v.isMaterialServiceProvider ? "Yes" : "No",
          v.criticality,
          v.dataResidency || "",
          v.exitPlanStatus,
          v.contractExpiryDate || "",
          v.owner || "",
        ]
          .map(escapeCsvField)
          .join(","),
      ),
    ].join("\n"),
  });

  entries.push({
    name: "04-Governance/Incidents-Log.csv",
    content: [
      ["Code", "Type", "Severity", "Title", "Detected", "Status", "Regulator Notified", "Ref"]
        .map(escapeCsvField)
        .join(","),
      ...incidents.map((i) =>
        [
          i.incidentCode,
          i.incidentType,
          i.severity,
          i.title,
          i.detectedAt,
          i.status,
          i.regulatorNotified ? "Yes" : "No",
          i.regulatorRef || "",
        ]
          .map(escapeCsvField)
          .join(","),
      ),
    ].join("\n"),
  });

  // 6. Authored Policies Markdown
  for (const pol of policies) {
    entries.push({
      name: `05-Policies/${pol.policyCode}-${safeFilename(pol.title)}.md`,
      content: pol.contentMarkdown || `# ${pol.title}\n\nVersion ${pol.version}`,
    });
  }

  // 7. Actual Local Evidence Library Binary Files
  for (const doc of documents) {
    const blobBuf = getBlob(doc.blobKey);
    if (blobBuf) {
      entries.push({
        name: `06-Evidence-Files/${doc.id}-${safeFilename(doc.originalFilename)}`,
        content: blobBuf,
      });
    }
  }

  // 8. Complete Audit-Pack.json
  entries.push({
    name: "07-Audit-Pack.json",
    content: JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        generator: "Mount Charter v3.0",
        workspace: storage.getWorkspace(workspaceId),
        profile,
        controls: controls.length,
        questionResponses: storage.listAllQuestionResponses(workspaceId),
        responseChangeLog: storage.listAllResponseChangeLogs(workspaceId),
        requirementAssessmentLog: storage.listAllRequirementAssessmentLogs(workspaceId),
        testRuns,
        risks,
        capas,
        reviews,
        vendors,
        policies,
        incidents,
      },
      null,
      2,
    ),
  });

  // 9. Cryptographic SHA256SUMS.txt manifest
  const sums = entries
    .map((e) => {
      const buf = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content, "utf8");
      return `${sha256Hex(buf)}  ${e.name}`;
    })
    .join("\n");
  entries.push({ name: "SHA256SUMS.txt", content: `${sums}\n` });

  return buildZip(entries);
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toIcsDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

/**
 * RFC 5545 iCalendar (.ics) feed of statutory deadlines, control reviews,
 * CAPA due dates, policy reviews, risk reviews, and vendor contract expiries.
 */
export function buildDeadlinesIcs(workspaceId: number): string {
  const ws = storage.getWorkspace(workspaceId);
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mount Charter//ISMS Compliance Workbench//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(`Mount Charter Deadlines — ${ws?.name || "Organisation"}`)}`,
  ];

  const pushEvent = (
    uid: string,
    dateStr: string | null | undefined,
    summary: string,
    desc: string,
  ) => {
    if (!dateStr) return;
    const ymd = toIcsDate(dateStr);
    if (!ymd) return;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}@mount-charter.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(desc)}`,
      "END:VEVENT",
    );
  };

  for (const fw of storage.listFrameworks(workspaceId).filter((f) => f.enabled)) {
    for (const d of fw.upcomingDeadlines || []) {
      pushEvent(
        `fw-${fw.code}-${d.reqCode}`,
        d.deadlineDate,
        `[Statutory] ${fw.shortName} ${d.reqCode}: ${d.title}`,
        `Current status: ${d.status}. Framework: ${fw.name} (${fw.instrumentId || fw.version}).`,
      );
    }
  }

  for (const c of storage.listControlsWithStatus(workspaceId)) {
    if (c.workspaceControl.isApplicable && c.workspaceControl.nextDueDate) {
      pushEvent(
        `ctrl-${c.controlNumber}-${c.workspaceControl.nextDueDate}`,
        c.workspaceControl.nextDueDate,
        `[ISO 27001 Review] ${c.controlNumber} ${c.name}`,
        `Review frequency: ${c.workspaceControl.frequency || "Annual"}. Latest test: ${c.latestTestRun?.status || "NotAttempted"}.`,
      );
    }
  }

  for (const capa of storage.listCapas(workspaceId)) {
    if (capa.status !== "VerifiedClosed") {
      pushEvent(
        `capa-${capa.id}`,
        capa.dueDate,
        `[CAPA Due] ${capa.capaCode}: ${capa.title}`,
        `Owner: ${capa.owner || "Unassigned"}. Type: ${capa.findingType}.`,
      );
    }
  }

  for (const pol of storage.listPolicies(workspaceId)) {
    if (pol.status !== "Retired") {
      pushEvent(
        `policy-${pol.id}`,
        pol.nextReviewDate,
        `[Policy Review] ${pol.policyCode} ${pol.title}`,
        `Version ${pol.version}. Owner: ${pol.owner || "Unassigned"}.`,
      );
    }
  }

  for (const v of storage.listVendors(workspaceId)) {
    pushEvent(
      `vendor-${v.id}`,
      v.contractExpiryDate,
      `[Vendor Contract Expiry] ${v.name}${v.isMaterialServiceProvider ? " (CPS 230 MSP)" : ""}`,
      `Exit plan: ${v.exitPlanStatus}. Criticality: ${v.criticality}.`,
    );
  }

  for (const r of storage.listRisks(workspaceId)) {
    if (r.status !== "Closed") {
      pushEvent(
        `risk-${r.id}`,
        r.reviewDate,
        `[Risk Review] ${r.riskCode}: ${r.title}`,
        `Residual score: ${r.residualScore} (${r.treatment}).`,
      );
    }
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
