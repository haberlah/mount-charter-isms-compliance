# Supported Standards & Legislative Register

**Last verified:** 27 November 2026  
**Seed catalog version:** `3.0` (`seed-data/frameworks.json` & `seed-data/iso_27001_ontology.json`)

Mount Charter enforces **truth-in-advertising support tiers**: every framework explicitly declares whether it has a first-class assessment engine (`full`) or is used strictly as advisory context for AI reviews (`ai_context_only`).

---

## Framework Matrix

| Code | Framework | Jurisdiction | Authoritative Instrument | Effective Date | Support Tier | Requirements |
| --- | --- | --- | --- | --- | --- | --- |
| `iso27001_2022` | ISO/IEC 27001:2022 (+ Amd 1:2024) | International | ISO/IEC 27001:2022 + Amd 1:2024 | 2024-02-23 | `full` (Core Engine) | 100 controls · 262 Qs |
| `acsc_e8_2023` | ACSC Essential Eight & ASD Essentials | Australia | ASD Essential Eight Maturity Model (Nov 2023) | 2023-11-01 | `full` (Weakest-Link ML0–ML3) | 72 discrete criteria |
| `au_privacy_act` | Privacy Act 1988, APPs & POLA Act 2024 | Australia | C2004C00253 / C2024A00128 | 2024-12-10 | `full` (Statutory Register) | 19 in-force + 2 draft |
| `au_cyber_security_act_2024` | Cyber Security Act 2024 (Cth) | Australia | C2024A00098 | 2025-05-30 | `full` (Statutory Register) | 7 in-force |
| `apra_cps234` | APRA Prudential Standard CPS 234 | Australia | F2018L01745 | 2019-07-01 | `full` (Statutory Deltas + ISO refs) | 8 in-force |
| `apra_cps230` | APRA Prudential Standard CPS 230 | Australia | APRA CPS 230 (Effective 1 Jul 2025) | 2025-07-01 | `full` (Statutory Deltas + ISO refs) | 8 in-force |
| `au_soci_act` | Security of Critical Infrastructure Act 2018 | Australia | C2018A00029 / C2024A00100 | 2025-04-04 | `full` (Statutory Register) | 6 in-force |
| `au_ai6_2025` | NAIC Guidance for AI Adoption (`AI6`) | Australia | NAIC Guidance for AI Adoption (Oct 2025) | 2025-10-21 | `full` (Voluntary + Watch) | 6 in-force + 1 draft |
| `soc2_type2` | AICPA SOC 2 Type II | International | AICPA Trust Services Criteria (2017 / 2022) | 2022-10-01 | `ai_context_only` | Advisory tag only |
| `gdpr` | EU General Data Protection Regulation | European Union | Regulation (EU) 2016/679 | 2018-05-25 | `ai_context_only` | Advisory tag only |

---

## Key Legislative & Transition Notes (Nov 2026)

### 1. ISO/IEC 27001:2022 + Amendment 1:2024
- **Amendment 1:2024 (23 Feb 2024):** Mandatory Climate Action Changes to Clauses 4.1 and 4.2 are captured both in `RQ4` and in the dedicated Statement of Applicability determination field (`Relevant` / `NotRelevant` / `Undetermined` + rationale).
- **Clause 6.3:** Planning of Changes is explicitly assessed in `RQ6`.
- **Clause 6.1.3(d):** Clauses 4–10 (`RQ4`–`RQ10`) are enforced mandatory and cannot be excluded; Annex A exclusions require documented justification; inclusions support documented justification and implementation status.

### 2. ACSC Essential Eight (Nov 2023) & ASD Essentials (Oct 2026)
- Encodes **72 discrete auditable criteria** across all 8 mitigation strategies and Maturity Levels 1–3 (`E8-*-ML1..3-01..03`).
- Applies the strict **Weakest-Link Rule**: a strategy achieves `ML1` only when *every* `ML1` criterion in that strategy is `Met` or `NotApplicable` (and overall achieved maturity equals `MIN` across all 8 strategies).
- **ASD Essentials Transition:** In October 2026, ASD launched *ASD Essentials* (Enterprise IT, Cloud, and OT chapters) running concurrently with Essential Eight. Essential Eight remains the active PSPF, DISP, procurement, and cyber-insurance baseline during transition.

### 3. Australian Privacy Act 1988, POLA Act 2024 & Tranche 2 Watch
- **10 December 2026 Statutory Commencements:** Automated Decision-Making transparency (`APP 1.7`–`1.9`) and the Children's Online Privacy Code (`COPC`, informed by the OAIC 2026 Exposure Draft) carry explicit deadline tracking.
- **In-force POLA Tranche 1:** Statutory tort for serious invasions of privacy (commenced 10 June 2025, no \$3M turnover threshold), explicit technical & organisational security measures under `APP 11.1`, mandatory destruction/de-identification (`APP 11.2`), civil penalties, and doxxing offences.
- **Draft Segregation:** Tranche 2 Exposure Draft items (*Privacy Amendment (Personal Data Protection) Bill 2026* — "fair and reasonable" test and proposed 72-hour OAIC breach notification) are flagged `isDraft: true` and excluded from in-force readiness percentages until enacted.

### 4. Cyber Security Act 2024 (Cth) (`C2024A00098`)
- **Mandatory Ransomware Payment Reporting (commenced 30 May 2025):** Entities meeting the \$3M annual turnover threshold or SOCI obligations must report ransomware/cyber-extortion payments to ASD within **72 hours** (civil penalty: 60 penalty units).
- **Smart Device (IoT) Security Rules 2025 (commenced 4 March 2026):** Prohibits universal default passwords, requires vulnerability disclosure policies, and mandates defined security-update support periods.
- **Limited Use Obligation & CIRB:** Tracks protections for voluntary ASD incident sharing and Cyber Incident Review Board review participation.

### 5. APRA CPS 234 & CPS 230 Statutory Deltas
- Complements inline ISO 27001 control cross-references with standalone statutory delta requirements for APRA-regulated entities (72-hour cyber incident & 10-business-day material control weakness notifications, tripartite testing, Board accountability, 24-hour material disruption reporting, critical operations tolerance levels, and material service provider registers).

### 6. SOCI Act 2018 (+ ERP Act 2024) & NAIC `AI6`
- **SOCI:** Covers `s 9(7)` business-critical data storage systems, Critical Infrastructure Risk Management Programs (CIRMP), 12-hour critical / 72-hour other ASD reporting, and annual 90-day post-FY Board reports to CISC.
- **NAIC `AI6` (Oct 2025):** Tracks the 6 essential practices for responsible AI adoption plus an `isDraft: true` watch item for the Australian Government's November 2026 announcement regarding mandatory guardrails and a dedicated safety regulator for frontier AI developers.

---

## Legal Disclaimer

This register is maintained for operational compliance tracking and audit preparation. It is not legal advice. Always verify current statutory text on the [Federal Register of Legislation](https://www.legislation.gov.au/), [ASD/ACSC](https://www.cyber.gov.au/), [OAIC](https://www.oaic.gov.au/), and [APRA](https://www.apra.gov.au/).
