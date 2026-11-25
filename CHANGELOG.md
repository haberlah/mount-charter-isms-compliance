# Changelog

All notable changes to Mount Charter are documented in this file.

## [3.0.0] — 2026-11-25

### Certification-Mandatory ISMS Governance Workbench (`/governance`)
- **Risk Register & Risk Treatment Plan (ISO Clauses 6.1.2, 6.1.3, 8.2, 8.3):** Likelihood × Impact inherent/residual scoring, 1-click 8-risk Australian SMB/cloud starter seeder, M:N linking (`risk_control_links`) surfaced as badges on the Statement of Applicability and `soa.csv`, and CSV export.
- **CAPA / Nonconformities (Clause 10.2) + Internal Audits & Management Reviews (Clauses 9.2 / 9.3):** Track Major/Minor NCs, OFIs, root causes, due dates, verified closures, and formal internal audit / executive management review records.
- **Vendors & APRA CPS 230 Material Service Providers (A.5.19–5.22 & CPS 230):** MSP flags, exit-plan verification (`Missing` / `Documented` / `Tested`), APP 8 data residency, contract expiries, and CSV export.
- **Policy Register & 6 Australian Starter Templates (Clause 7.5 & A.5.1):** Pre-filled Markdown templates tailored to organisation profile & regulatory scope with inline Markdown editor and `.md` export.
- **Incident Log & Live Statutory Breach Clocks:** Automatically computes live hours remaining / overdue for Cyber Security Act 2024 72h ASD ransomware reporting, Privacy Act Part IIIC 30d NDB, APRA CPS 234 72h / CPS 230 24h, and SOCI 12h critical cyber incidents.

### Local-First Auditor Handoff, Cross-Framework Drift, Backups & Collectors
- **Self-Contained Auditor Evidence Bundle (`.zip`) & Executive HTML/PDF Report:** Single-click ZIP bundling print-ready Executive Report, all CSV registers, authored Markdown policies, actual local binary evidence files, Audit Pack JSON, and `SHA256SUMS.txt`.
- **Cross-Framework Drift Warnings:** Real-time detection when `Met` / `PartiallyMet` Australian framework requirements contradict `Fail`, `Blocked`, `Excluded`, or un-evidenced `rubric_conflict` linked ISO 27001 controls.
- **AI Readiness Assessment Across All 7 Australian Frameworks:** On-demand AI assessment on every framework requirement (`POST /api/frameworks/:code/requirements/:reqCode/ai-assess`) with human-in-the-loop "Apply Assessment".
- **Portable Workspace Backup & Restore (`.zip`) + RFC 5545 `.ics` Deadlines Calendar:** Export full workspace + binary blobs and restore safely into a new isolated workspace with SHA-256 verification; export statutory and operational deadlines to Apple Calendar / Outlook.
- **Opt-In Local Read-Only CLI Evidence Collectors:** Allowlisted, read-only local collectors (`macOS Endpoint Posture`, `GitHub gh`, `Google Cloud gcloud`, `AWS aws`) auto-capturing Markdown evidence snapshots linked to ISO 27001 controls and Essential Eight criteria.

### Multi-Provider AI, Offline Open-Source LLMs & Subscription CLIs
- **Cloud API Keys (Per-Provider macOS Keychain):** Anthropic Claude, OpenAI ChatGPT, Google Gemini, xAI Grok, Meta Llama, and Custom OpenAI-Compatible endpoints (OpenRouter, Mistral, Together, Groq, vLLM) with SSRF metadata IP protection.
- **100% Offline Local Open-Source LLMs:** Ollama (`127.0.0.1:11434/v1`) and LM Studio (`127.0.0.1:1234/v1`) with `/api/settings/local-models` auto-discovery.
- **Official Signed-In Subscription CLIs:** Sanctioned PATH-detected integrations for `claude` (Claude), `codex` (ChatGPT), and `gemini` (Gemini) with zero cookie scraping.

## [2.2.0] — 2026-11-25

### Security & Supply Chain
- Upgraded `zod` to `^4.6.7` and removed unused `date-fns`; `npm audit --omit=dev` now reports **0 vulnerabilities**.
- Added strict XLSX ZIP-bomb decompression ceilings (`MAX_ZIP_ENTRIES = 256`, `MAX_ZIP_ENTRY_BYTES = 20 MB`, `MAX_ZIP_TOTAL_BYTES = 50 MB`, `inflateRawSync` `maxOutputLength`).
- Hardened macOS Keychain helper (`isValidKeychainAccount` allowlist + unconditional `b64:` stdin encoding into `/usr/bin/security -i`).
- Cached production `index.html` in memory at server startup (`server/static.ts`).
- Added Biome linter/formatter (`biome.json`) and GitHub Actions CI pipeline (`.github/workflows/ci.yml`).
- Declared `"engines": { "node": ">=22.5.0" }` in `package.json`.

### Unified Multi-Framework Ontology & Nov 2026 Australian Legislation
- Added authoritative provenance metadata (`jurisdiction`, `instrumentId`, `sourceUrl`, `effectiveDate`, `transitionNote`, `clauseRef`, `isDraft`) and JSON Schemas for `seed-data/frameworks.json` and `seed-data/iso_27001_ontology.json`.
- Expanded **ACSC Essential Eight (Nov 2023)** from 24 summary rows to **72 discrete auditable criteria** across all 8 strategies (`ML1`–`ML3`) with strict per-criterion Weakest-Link calculation and **ASD Essentials (Oct 2026)** transition guidance.
- Expanded **Australian Privacy Act 1988 & POLA Act 2024** to 21 requirements (19 in-force incl. 10 Dec 2026 ADM & COPC Exposure Draft + 2 `isDraft: true` Tranche 2 watch items excluded from readiness scoring).
- Added first-class modules for **Cyber Security Act 2024 (Cth)** (7 requirements), **APRA CPS 234** (8 statutory deltas), **APRA CPS 230** (8 statutory deltas), **SOCI Act 2018 / ERP Act 2024** (6 requirements), and **NAIC Guidance for AI Adoption (`AI6`, Oct 2025)** (6 practices + 1 `isDraft: true` Nov 2026 Frontier AI watch item).
- Added append-only SQLite `requirement_assessment_log` with `BEFORE UPDATE` / `BEFORE DELETE` immutability triggers, direct `requirement_evidence_links` (local documents + validated URLs), and generic `/api/exports/framework/:code.csv` exports.

### Architecture, Tests & Documentation
- Decomposed `server/storage.ts` (2,511 LOC) into 7 focused domain repositories under `server/repositories/`.
- Modularized `ControlDetailPage`, `EvidencePage`, `AuditPage`, `SettingsPage`, and `FrameworksPage` into focused subcomponents (`client/src/components/{controls,evidence,audit,settings,frameworks}/`).
- Added deep test suites covering XLSX extraction & zip-bomb defence, security/CSRF/Keychain guards, v2.1 → v2.2 SQLite migrations, and seed-data integrity (32 passing tests).
- Added publication-grade `README.md`, `SECURITY.md`, `ARCHITECTURE.md`, `docs/STANDARDS.md`, `CHANGELOG.md`, and `CONTRIBUTING.md`.

## [2.1.0] — 2026-11-24

- Resolved all horizontal/vertical layout jumps across tabs (`0.0 px` delta) and topbar overflow at `720×800`.
- Adopted `<paper-split>` master-detail workbench on Controls, native `<paper-tabs>` keyboard navigation, and `<ConfirmDialog>` replacing `window.confirm`.
- Upgraded native Swift `WKUIDelegate` (confirm panels, external link handling, Reveal Data Folder, async `NSSavePanel` bridge).
- Repaired ISO A.8.21–8.23 titles/mappings, added ISO 27001 Amd 1:2024 Climate Change & Clause 6.3, enforced non-excludable Clauses 4–10 (`RQ4`–`RQ10`), and launched initial Essential Eight and Privacy Act modules.

## [2.0.0] — 2026-11-23

- Converted Mount Charter to a pure local-first macOS desktop application using Node built-in SQLite, macOS Keychain, Paper v0.7.0 light-first design system, and monochrome `shield-peak` app icon.
- Stripped all private client documents and secrets from the repository.
