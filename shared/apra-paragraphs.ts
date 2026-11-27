export interface ApraParagraphGloss {
  code: string;
  label: string;
  summary: string;
}

/**
 * Plain-English glosses for APRA CPS 234 (Information Security) entity-obligation paragraphs.
 * Regulator supervisory/discretionary power paragraphs are intentionally excluded from entity badges.
 */
export const APRA_CPS234_PARAGRAPHS: Record<string, { label: string; summary: string }> = {
  "13": {
    label: "Board responsibility",
    summary: "Board is ultimately responsible for information security.",
  },
  "14": {
    label: "Information security capability",
    summary: "Maintain security capability commensurate with threat size and extent.",
  },
  "15": {
    label: "Roles & responsibilities",
    summary: "Clearly define information security roles for Board, management, and staff.",
  },
  "16": {
    label: "Policy framework",
    summary:
      "Maintain an information security policy framework aligned to vulnerabilities and threats.",
  },
  "17": {
    label: "Policy framework currency",
    summary: "Keep the information security policy framework current and board-aligned.",
  },
  "18": {
    label: "Third-party capability",
    summary: "Assess information security capability of third parties managing assets.",
  },
  "20": {
    label: "Asset classification",
    summary: "Classify information assets by criticality and sensitivity.",
  },
  "21": {
    label: "Control implementation",
    summary: "Implement controls protecting assets commensurate with criticality and sensitivity.",
  },
  "21a": {
    label: "Asset protection controls",
    summary: "Protect information assets in proportion to their criticality and sensitivity.",
  },
  "21b": {
    label: "Threat-aligned controls",
    summary: "Align security controls to vulnerabilities, threats, and lifecycle changes.",
  },
  "21c": {
    label: "Lifecycle protection",
    summary: "Maintain controls across the full asset lifecycle including decommissioning.",
  },
  "22": {
    label: "Third-party control assurance",
    summary: "Evaluate design and operating effectiveness of third-party controls.",
  },
  "23": {
    label: "Detection & response capability",
    summary: "Maintain mechanisms to detect and respond to information security incidents.",
  },
  "24": {
    label: "Incident response plans",
    summary: "Maintain plans to respond to incidents that could plausibly occur.",
  },
  "25": {
    label: "Incident management",
    summary: "Manage incidents promptly to limit impact and restore operations.",
  },
  "26": {
    label: "Annual response plan review & test",
    summary: "Review and test incident response plans at least annually.",
  },
  "27": {
    label: "Systematic control testing",
    summary: "Systematically test control effectiveness through an ongoing testing program.",
  },
  "27a": {
    label: "Testing frequency & scope",
    summary: "Test controls at a frequency and rigour matching asset criticality and threat rate.",
  },
  "27b": {
    label: "Tester independence & competence",
    summary:
      "Ensure control testing is performed by appropriately skilled, independent specialists.",
  },
  "27c": {
    label: "Testing scope & coverage",
    summary: "Cover design and operating effectiveness across critical and sensitive assets.",
  },
  "28": {
    label: "Annual testing baseline",
    summary: "Test controls protecting critical/sensitive assets at least annually.",
  },
  "29": {
    label: "Testing escalation",
    summary: "Escalate and report testing results identifying control deficiencies.",
  },
  "30": {
    label: "Internal audit assurance",
    summary:
      "Internal audit activities must include reviewing information security control assurance.",
  },
  "31": {
    label: "Internal audit scope",
    summary:
      "Review design and operating effectiveness of controls, including third-party reliance.",
  },
  "32": {
    label: "Internal audit independence & skills",
    summary: "Ensure internal audit personnel have sufficient security skills and independence.",
  },
  "33": {
    label: "Internal audit reporting",
    summary:
      "Provide internal audit findings on information security to the Board Audit Committee.",
  },
  "34": {
    label: "Audit assurance of third parties",
    summary: "Assess assurance provided by third-party audits before relying on them.",
  },
  "34a": {
    label: "Third-party audit scope",
    summary: "Verify third-party assurance covers relevant assets and controls.",
  },
  "34b": {
    label: "Third-party audit competence",
    summary: "Verify independence and competence of third-party auditors.",
  },
  "35": {
    label: "72-hour incident notification",
    summary: "Notify APRA within 72 hours of a material information security incident.",
  },
  "36": {
    label: "10-business-day weakness notification",
    summary:
      "Notify APRA within 10 business days of a material control weakness not remediated in time.",
  },
};

/**
 * Plain-English glosses for APRA CPS 230 (Operational Risk Management, effective 1 July 2025).
 * Regulator supervisory power paragraphs (19, 37, 39, 52) are intentionally omitted.
 */
export const APRA_CPS230_PARAGRAPHS: Record<string, { label: string; summary: string }> = {
  "12": {
    label: "Operational risk framework",
    summary:
      "Maintain an operational risk management framework commensurate with size and complexity.",
  },
  "13": {
    label: "Board oversight",
    summary: "Board oversees operational risk profile, tolerance levels, and resilience.",
  },
  "14": {
    label: "Senior management accountability",
    summary: "Senior management implements and monitors operational risk controls.",
  },
  "15": {
    label: "Three lines accountability",
    summary: "Clear operational risk roles across business, risk, and assurance functions.",
  },
  "16": {
    label: "Risk profile & assessment",
    summary: "Maintain an accurate view of the entity's operational risk profile.",
  },
  "17": {
    label: "Risk appetite & limits",
    summary: "Align operational risk management to Board-approved risk appetite.",
  },
  "20": {
    label: "Internal controls",
    summary: "Design and maintain effective internal controls to manage operational risks.",
  },
  "21": {
    label: "Control environment",
    summary: "Ensure controls operate reliably across processes, people, and technology.",
  },
  "22": {
    label: "Control monitoring",
    summary: "Monitor control effectiveness continuously and track exceptions.",
  },
  "23": {
    label: "Scenario analysis & stress",
    summary: "Assess plausible severe operational disruption scenarios.",
  },
  "24": {
    label: "Control testing",
    summary: "Periodically test design and operating effectiveness of key operational controls.",
  },
  "25": {
    label: "Control failure assessment",
    summary: "Assess root causes and systemic impacts when controls fail.",
  },
  "26": {
    label: "Change management risk",
    summary:
      "Assess operational risk before introducing or changing systems, products, or processes.",
  },
  "28": {
    label: "Incident identification",
    summary: "Identify, record, and classify operational risk incidents promptly.",
  },
  "29": {
    label: "Incident escalation",
    summary: "Escalate material operational incidents to senior management and Board.",
  },
  "30": {
    label: "Remediation tracking",
    summary: "Track remediation of identified operational risk weaknesses to closure.",
  },
  "31": {
    label: "Material weakness remediation",
    summary: "Remediate material control weaknesses and notify APRA where required.",
  },
  "32": {
    label: "72-hour operational incident notice",
    summary: "Notify APRA within 72 hours of a material operational risk incident.",
  },
  "34": {
    label: "Critical operations register",
    summary: "Identify and maintain a register of critical operations and their dependencies.",
  },
  "35": {
    label: "Tolerance levels",
    summary: "Set Board-approved tolerance levels for disruption to critical operations.",
  },
  "36": {
    label: "Mapping critical dependencies",
    summary:
      "Map people, technology, premises, and third-party dependencies for critical operations.",
  },
  "38": {
    label: "Business continuity planning",
    summary: "Maintain a credible Business Continuity Plan (BCP) to stay within tolerance levels.",
  },
  "40": {
    label: "BCP activation & governance",
    summary: "Define clear triggers, roles, and communication paths to activate the BCP.",
  },
  "41": {
    label: "Disruption notification (24h)",
    summary:
      "Notify APRA within 24 hours of a disruption to a critical operation outside tolerance.",
  },
  "42": {
    label: "BCP review & currency",
    summary: "Review and update the BCP regularly and after material operational changes.",
  },
  "43": {
    label: "Severe disruption recovery",
    summary: "Ensure recovery strategies address severe but plausible disruption scenarios.",
  },
  "44": {
    label: "Alternative operating arrangements",
    summary: "Maintain fallback processes, sites, and manual workarounds for critical operations.",
  },
  "45": {
    label: "Annual BCP testing",
    summary: "Test the BCP at least annually under severe disruption scenarios and remediate gaps.",
  },
  "48": {
    label: "Service provider risk policy",
    summary: "Maintain a comprehensive policy covering material service provider lifecycle risk.",
  },
  "49": {
    label: "Material service provider register",
    summary: "Maintain and submit to APRA a register of all material service providers.",
  },
  "50": {
    label: "Pre-contract due diligence",
    summary:
      "Assess operational risk, resilience, and capability before engaging a material provider.",
  },
  "51": {
    label: "Fourth-party & concentration risk",
    summary:
      "Identify and manage reliance on subcontractors (fourth parties) and concentration risk.",
  },
  "53": {
    label: "Formal service agreements",
    summary: "Execute formal legally binding agreements with material service providers.",
  },
  "54": {
    label: "Mandatory contract clauses",
    summary:
      "Include audit rights, APRA access, incident reporting, and liability clauses in contracts.",
  },
  "55": {
    label: "Service level monitoring",
    summary: "Monitor material service provider performance against agreed SLAs and tolerances.",
  },
  "56": {
    label: "Offshoring & cross-border risk",
    summary: "Assess and manage risks of material arrangements performed outside Australia.",
  },
  "57": {
    label: "Exit & transition plans",
    summary: "Maintain tested exit plans for orderly transition off material service providers.",
  },
  "58": {
    label: "Ongoing provider & fourth-party review",
    summary:
      "Continuously monitor material providers and manage fourth-party / sub-outsourcing risk.",
  },
  "59": {
    label: "APRA notification of material changes",
    summary:
      "Notify APRA before entering or materially changing critical service provider arrangements.",
  },
  "60": {
    label: "Independent review of framework",
    summary: "Ensure internal audit periodically reviews the operational risk and BCP framework.",
  },
};

const REGULATOR_POWER_PARAS = new Set(["19", "37", "39", "52"]);

/**
 * Parse a semicolon-separated APRA paragraph reference string into deduplicated,
 * entity-obligation glosses (filtering out regulator supervisory power paragraphs).
 */
export function parseApraRefs(
  raw: string | null | undefined,
  standard: "cps234" | "cps230",
): ApraParagraphGloss[] {
  if (!raw) return [];
  const table = standard === "cps234" ? APRA_CPS234_PARAGRAPHS : APRA_CPS230_PARAGRAPHS;
  const seen = new Set<string>();
  const result: ApraParagraphGloss[] = [];
  for (const part of raw.split(/[;,]/)) {
    const clean = part.replace(/^§\s*/i, "").trim();
    if (!clean) continue;
    if (standard === "cps230" && REGULATOR_POWER_PARAS.has(clean)) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    const meta = table[clean];
    result.push({
      code: clean,
      label: meta?.label ?? `Paragraph ${clean}`,
      summary: meta?.summary ?? `APRA ${standard.toUpperCase()} paragraph ${clean}.`,
    });
  }
  return result;
}
