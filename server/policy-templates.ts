import type { WorkspaceProfile } from "@shared/schema";

export interface PolicyTemplate {
  id: string;
  title: string;
  version: string;
  linkedControls: string[];
  summary: string;
  render: (orgName: string, profile: WorkspaceProfile) => string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const POLICY_TEMPLATES: readonly PolicyTemplate[] = [
  {
    id: "isms-policy",
    title: "Information Security Policy (ISO 27001 Clause 5.2 & A.5.1)",
    version: "1.0",
    linkedControls: ["RQ5", "5.1", "5.2", "5.3"],
    summary:
      "Overarching Board/Executive-approved ISMS policy establishing security objectives, governance, and compliance obligations.",
    render: (org, profile) => `# ${org} — Information Security Policy

**Version:** 1.0  
**Effective Date:** ${todayIso()}  
**Owner:** Chief Information Security Officer / Head of Security  
**Review Cadence:** Annual (or upon material organisational / regulatory change)

## 1. Purpose & Scope
This policy establishes the Information Security Management System (ISMS) commitment of **${org}** in alignment with **ISO/IEC 27001:2022 (+ Amendment 1:2024)** and applicable Australian legislation (${profile.regulatoryRequirements.join(", ") || "Privacy Act 1988, Cyber Security Act 2024"}).

It applies to all employees, contractors, directors, systems, cloud environments (${profile.deploymentModel || "cloud and corporate endpoints"}), and third-party service providers handling ${org} information assets.

## 2. Information Security Objectives
1. Protect the confidentiality, integrity, and availability of corporate, customer, and regulated information assets.
2. Maintain a risk-based Statement of Applicability (Clause 6.1.3(d)) directly traceable to the Risk Register.
3. Meet all statutory security and breach notification obligations across Australia (including ASD 72-hour ransomware reporting, OAIC Part IIIC NDB scheme, and applicable APRA/SOCI rules).
4. Continually improve the ISMS through internal audits, management reviews, and corrective actions (CAPA).

## 3. Roles & Responsibilities
- **Board / Executive Leadership:** Approves this policy, sets risk appetite (${profile.riskAppetite}), and reviews ISMS effectiveness at least annually.
- **Security Owner (CISO / Lead):** Maintains the Risk Register, SoA, control testing schedule, and incident response readiness.
- **All Personnel:** Must comply with security policies, complete annual security awareness training, and report suspected incidents immediately.

## 4. Climate Change & Planning of Changes (Amd 1:2024 & Clause 6.3)
${org} assesses climate-related operational and cloud-region resilience issues during context reviews (Clauses 4.1 & 4.2) and executes material ISMS changes through formal change control (Clause 6.3).

## 5. Exceptions & Enforcement
Any policy exception requires documented risk acceptance signed by the Security Owner with a defined expiry date (maximum 12 months).`,
  },
  {
    id: "access-mfa-policy",
    title: "Access Control & Phishing-Resistant MFA Policy",
    version: "1.0",
    linkedControls: ["5.15", "5.16", "5.17", "5.18", "8.2", "8.5"],
    summary:
      "Least privilege, quarterly privileged access reviews, and Essential Eight ML2–ML3 phishing-resistant MFA (FIDO2/WebAuthn).",
    render: (org) => `# ${org} — Access Control & Multi-Factor Authentication Policy

**Version:** 1.0  
**Effective Date:** ${todayIso()}  
**Linked Standards:** ISO/IEC 27001 A.5.15–A.5.18, A.8.2, A.8.5 · ACSC Essential Eight (MFA & Restrict Admin Privileges)

## 1. Principle of Least Privilege
Access to all production systems, source repositories, cloud consoles, and customer data is granted strictly on a role-based, least-privilege basis and approved by the asset owner.

## 2. Mandatory Multi-Factor Authentication (MFA)
- **All Users:** MFA is mandatory for all internet-facing services, corporate identity providers, email, VPN, and SaaS tools.
- **Phishing-Resistant MFA (Essential Eight ML2/ML3):** Privileged accounts, cloud administrators, and remote access MUST use phishing-resistant authenticators (FIDO2/WebAuthn hardware keys or platform passkeys). SMS and voice OTP are prohibited for administrative access.

## 3. Privileged Access Management
- Dedicated administrative accounts are separated from day-to-day email and web-browsing accounts.
- Privileged elevation is time-bound (Just-in-Time) where supported and centrally logged.

## 4. Access Reviews & Offboarding
- **Privileged Access:** Reviewed at least quarterly with documented sign-off.
- **User Offboarding:** Identity provider and production sessions are revoked immediately upon termination (within 4 hours for voluntary departures; immediately for involuntary departures).`,
  },
  {
    id: "incident-ransomware-policy",
    title: "Incident Response & 72-Hour Ransomware Notification Policy",
    version: "1.0",
    linkedControls: ["5.24", "5.25", "5.26", "5.27", "5.28", "5.30"],
    summary:
      "End-to-end incident triage plus mandatory Australian statutory clocks (Cyber Security Act 72h ransomware, NDB 30d, APRA 72h/24h, SOCI 12h).",
    render: (org) => `# ${org} — Cyber Incident Response & Statutory Breach Notification Policy

**Version:** 1.0  
**Effective Date:** ${todayIso()}  
**Linked Legislation:** Cyber Security Act 2024 (Cth) Part 3 · Privacy Act 1988 Part IIIC (NDB) · APRA CPS 234/230 · SOCI Act 2018

## 1. Incident Lifecycle
All suspected security incidents follow six controlled phases: **1. Preparation → 2. Detection & Triage → 3. Containment → 4. Eradication → 5. Recovery → 6. Post-Incident Review & CAPA**.

## 2. Mandatory Australian Statutory Notification Clocks
Upon incident confirmation, the Incident Commander MUST immediately log the incident in the Mount Charter Incident Register and track every applicable statutory clock:
- **Cyber Security Act 2024 (Part 3 — Mandatory Ransomware Payment Reporting):** If a ransomware or cyber-extortion payment/benefit is made (and ${org} meets the \\$3M turnover or SOCI threshold), submit the mandatory report to ASD / ReportCyber within **72 hours** of making the payment or becoming aware it was made.
- **Privacy Act 1988 (Part IIIC — NDB Scheme):** Complete reasonable assessment of suspected eligible data breaches within **30 calendar days** (target < 72 hours for containment & OAIC readiness) and notify OAIC and affected individuals as soon as practicable.
- **APRA CPS 234 (if APRA-regulated):** Notify APRA within **72 hours** of becoming aware of a material information security incident, and within **10 business days** of identifying a material control weakness.
- **APRA CPS 230 (if APRA-regulated):** Notify APRA within **24 hours** of a material operational disruption to a critical operation.
- **SOCI Act 2018 (if critical infrastructure):** Report critical cyber incidents to ASD within **12 hours** (other relevant incidents within **72 hours**).

## 3. Evidence Preservation & Post-Incident Review
Volatile logs, forensic timelines, and containment actions are preserved intact. A formal post-incident lessons-learned review is completed within 10 business days and tracked via the CAPA Register.`,
  },
  {
    id: "privacy-adm-policy",
    title: "Privacy Governance & Automated Decision-Making (POLA 2024) Policy",
    version: "1.0",
    linkedControls: ["5.31", "5.34", "8.10", "8.11", "8.12"],
    summary:
      "APP 1–13 governance, APP 11 technical/organisational security measures, and 10 Dec 2026 Automated Decision-Making transparency.",
    render: (org) => `# ${org} — Privacy Governance & Automated Decision-Making Policy

**Version:** 1.0  
**Effective Date:** ${todayIso()}  
**Linked Legislation:** Privacy Act 1988 (Cth) (APPs 1–13) · Privacy and Other Legislation Amendment Act 2024 (Cth)

## 1. Australian Privacy Principles (APPs 1–13)
${org} collects personal information only where reasonably necessary for its functions (APP 3), provides clear collection notices (APP 5), restricts secondary use/disclosure (APP 6), ensures cross-border accountability (APP 8), and honours access and correction requests within 30 days (APPs 12 & 13).

## 2. Technical & Organisational Measures (APP 11.1 & 11.2)
Personal information is protected by explicit technical and organisational controls (encryption in transit and at rest, MFA, role-based access, vulnerability management, and vendor security assessments). Personal information no longer required for a permitted purpose is securely destroyed or permanently de-identified per the retention schedule (APP 11.2).

## 3. Automated Decision-Making Transparency (APP 1.7–1.9 — Effective 10 Dec 2026)
${org} maintains an inventory of all computer programs and AI models that use personal information to make or substantially assist decisions significantly affecting an individual's rights or interests. The public Privacy Policy explicitly discloses:
1. The kinds of personal information used in those automated systems;
2. The kinds of decisions made solely by automated programs; and
3. The kinds of decisions for which automated programs substantially and directly assist human decision-makers.

## 4. Children's Online Privacy Code & Statutory Tort
Where digital services are likely to be accessed by children, ${org} conducts child-focused Privacy Impact Assessments and applies privacy-by-default settings. Personnel are trained on avoiding serious invasions of privacy (intrusion upon seclusion or misuse of information) under the statutory tort.`,
  },
  {
    id: "vuln-patching-policy",
    title: "Vulnerability & 48-Hour Patch Management Policy",
    version: "1.0",
    linkedControls: ["8.7", "8.8", "8.9", "8.19", "8.32"],
    summary:
      "Prescriptive ASD Essential Eight 48-hour critical patching SLA, fortnightly automated scanning, and EOL software removal.",
    render: (org) => `# ${org} — Vulnerability & Patch Management Policy

**Version:** 1.0  
**Effective Date:** ${todayIso()}  
**Linked Standards:** ISO/IEC 27001 A.8.8, A.8.7 · ACSC Essential Eight (Patch Applications & Patch Operating Systems)

## 1. Prescriptive Remediation SLAs
To satisfy both ISO/IEC 27001 A.8.8 and ASD Essential Eight (Nov 2023) requirements, ${org} enforces the following maximum remediation windows from vendor patch release:
- **Critical / Actively Exploited (Online Services, Browsers, Office, PDF, OS):** **48 hours** (overrides longer general risk-based windows).
- **Non-Critical Vulnerabilities (Internet-Facing & Untrusted-Content Apps / OS):** **14 days (2 weeks)**.
- **Other Internal Software / Non-Exploited Low-Risk Findings:** **30 days**.

## 2. Continuous Discovery & Scanning
- An automated vulnerability scanner executes at least **fortnightly** across all corporate endpoints, servers, container images, and internet-facing services.
- Software Bill of Materials (SBOM) and dependency advisories (Dependabot / SCA) are monitored continuously in CI/CD.

## 3. End-of-Life (EOL) Software
Applications and operating systems that are no longer supported with vendor security updates MUST be removed or replaced prior to vendor end-of-support date.`,
  },
  {
    id: "vendor-cps230-policy",
    title: "Third-Party & Material Service Provider Security Policy (CPS 230)",
    version: "1.0",
    linkedControls: ["5.19", "5.20", "5.21", "5.22", "5.23"],
    summary:
      "Vendor due diligence, APRA CPS 230 Material Service Provider register, exit plan testing, and fourth-party oversight.",
    render: (org) => `# ${org} — Third-Party & Material Service Provider Security Policy

**Version:** 1.0  
**Effective Date:** ${todayIso()}  
**Linked Standards:** ISO/IEC 27001 A.5.19–A.5.23 · APRA CPS 230 · APRA CPS 234 · APP 8

## 1. Pre-Engagement Security Due Diligence
Before onboarding any supplier that processes ${org} confidential/personal data or supports critical operations, the vendor owner must complete a security and privacy assessment (reviewing ISO 27001 / SOC 2 reports, encryption, incident SLAs, and data residency).

## 2. Material Service Providers (APRA CPS 230)
Suppliers supporting critical operations or exposing ${org} to material operational or privacy risk are designated as **Material Service Providers** in the Mount Charter Vendor Register. Each Material Service Provider MUST have:
1. A formal written contract specifying security obligations, audit/access rights, and incident notification windows (<= 24 hours for critical disruptions / <= 72 hours for cyber incidents);
2. Visibility into key fourth-party (subcontractor) dependencies;
3. A **documented and periodically tested Exit / Contingency Plan** to transition or operate through sudden supplier failure.

## 3. Ongoing Annual Review
Critical and High-risk vendors are reassessed annually prior to contract renewal; findings are tracked via the CAPA Register.`,
  },
];

export const STARTER_RISKS = [
  {
    title: "Credential compromise & phishing against cloud / IdP accounts",
    description:
      "Attacker steals employee or administrator credentials via adversary-in-the-middle phishing to access cloud infrastructure, source code, or customer data.",
    assetOrProcess: "Corporate Identity Provider, Cloud Console & GitHub",
    threat: "Credential harvesting / AiTM phishing",
    likelihood: 4,
    impact: 5,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Enforce phishing-resistant FIDO2/WebAuthn MFA for all privileged and standard accounts, disable legacy auth, and run quarterly privileged access reviews.",
    residualLikelihood: 2,
    residualImpact: 4,
    owner: "Head of Security",
    status: "InTreatment" as const,
    linkedControls: ["5.15", "5.17", "8.2", "8.5"],
  },
  {
    title: "Ransomware encryption & extortion causing extended outage",
    description:
      "Malicious execution encrypts corporate endpoints, SaaS workspaces, or backups and triggers mandatory 72-hour Cyber Security Act 2024 reporting if payment is considered.",
    assetOrProcess: "Endpoints, Production Databases & Backups",
    threat: "Ransomware / double-extortion group",
    likelihood: 3,
    impact: 5,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Maintain immutable offline backups tested quarterly, enforce 48-hour critical patching (Essential Eight), EDR, and rehearse ransomware playbooks annually.",
    residualLikelihood: 2,
    residualImpact: 4,
    owner: "Head of Security",
    status: "InTreatment" as const,
    linkedControls: ["5.24", "5.30", "8.7", "8.8", "8.13"],
  },
  {
    title: "Unpatched critical vulnerability in internet-facing service or browser",
    description:
      "Exploitation of an unpatched zero-day or N-day vulnerability in public web apps, APIs, or endpoint browsers.",
    assetOrProcess: "Internet-facing services & employee endpoints",
    threat: "Automated opportunistic exploitation",
    likelihood: 4,
    impact: 4,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Automate fortnightly vulnerability scans, CI dependency checks, and enforce 48-hour emergency patch deployment ring.",
    residualLikelihood: 2,
    residualImpact: 3,
    owner: "Security Engineering",
    status: "InTreatment" as const,
    linkedControls: ["8.8", "8.25", "8.32"],
  },
  {
    title: "Unauthorised disclosure of personal information (Privacy Act / NDB)",
    description:
      "Misconfigured storage, excessive access, or insecure third-party sharing exposes customer or staff personal information.",
    assetOrProcess: "Customer database, CRM & document storage",
    threat: "Cloud misconfiguration / insider error",
    likelihood: 3,
    impact: 4,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Apply encryption at rest/in transit, least privilege, DLP controls, APP 11.2 retention/deletion automation, and 30-day NDB response drills.",
    residualLikelihood: 2,
    residualImpact: 3,
    owner: "Privacy Officer",
    status: "Open" as const,
    linkedControls: ["5.34", "8.10", "8.11", "8.12", "8.24"],
  },
  {
    title: "Non-compliant Automated Decision-Making (ADM) disclosures (10 Dec 2026 POLA deadline)",
    description:
      "AI or automated scoring workflows materially affect individuals without mandatory APP 1.7–1.9 Privacy Policy transparency.",
    assetOrProcess: "Product AI / automated workflow features",
    threat: "Regulatory enforcement & statutory tort claims",
    likelihood: 3,
    impact: 4,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Complete ADM system inventory, update Privacy Policy before 10 Dec 2026, and align AI governance with NAIC AI6 practices.",
    residualLikelihood: 1,
    residualImpact: 3,
    owner: "Privacy Officer",
    status: "Open" as const,
    linkedControls: ["5.31", "5.34", "RQ4"],
  },
  {
    title: "Material cloud or SaaS service provider outage or breach (APRA CPS 230)",
    description:
      "Failure or compromise of a critical third-party cloud, identity, or payment provider disrupts critical business operations.",
    assetOrProcess: "Critical cloud & SaaS suppliers",
    threat: "Third-party operational failure / supply-chain compromise",
    likelihood: 3,
    impact: 4,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Maintain Material Service Provider register, annual security due diligence, contractual breach SLAs, and documented/tested exit plans.",
    residualLikelihood: 2,
    residualImpact: 3,
    owner: "Operations Lead",
    status: "Open" as const,
    linkedControls: ["5.19", "5.20", "5.22", "5.23", "5.30"],
  },
  {
    title: "Stale access retained by departing employees or contractors",
    description:
      "Former staff retain active sessions, API tokens, or repository access after offboarding.",
    assetOrProcess: "SSO, GitHub, Cloud IAM & SaaS apps",
    threat: "Malicious or accidental post-employment access",
    likelihood: 3,
    impact: 4,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Centralise SSO provisioning/deprovisioning, enforce same-day offboarding checklist, and verify during quarterly access reviews.",
    residualLikelihood: 1,
    residualImpact: 3,
    owner: "People & IT",
    status: "InTreatment" as const,
    linkedControls: ["5.18", "6.5", "8.2"],
  },
  {
    title: "Insufficient audit logging obscuring breach detection and forensics",
    description:
      "Missing or short-retention audit logs prevent timely detection or root-cause investigation during an incident.",
    assetOrProcess: "Cloud audit trails, IdP logs & production hosts",
    threat: "Delayed detection / inability to evidence NDB scope",
    likelihood: 3,
    impact: 3,
    treatment: "Mitigate" as const,
    treatmentPlan:
      "Centralise immutable audit logs with >= 12-month retention, alerting on privileged changes, and NTP clock sync.",
    residualLikelihood: 1,
    residualImpact: 2,
    owner: "Security Engineering",
    status: "InTreatment" as const,
    linkedControls: ["8.15", "8.16", "8.17"],
  },
];
