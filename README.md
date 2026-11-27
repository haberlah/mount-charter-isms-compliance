<div align="center">
  <img src="client/public/favicon.svg" width="88" height="88" alt="Mount Charter Shield-Peak Logo" />
  <h1>Mount Charter</h1>
  <p>
    <strong>Local-first ISO/IEC 27001:2022 (+ Amd 1:2024) &amp; Australian Cybersecurity / Privacy Compliance Workbench for macOS.</strong>
  </p>
  <p>
    <a href="https://github.com/haberlah/mount-charter-isms-compliance/actions/workflows/ci.yml"><img src="https://github.com/haberlah/mount-charter-isms-compliance/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/haberlah/mount-charter-isms-compliance/releases"><img src="https://img.shields.io/github/v/release/haberlah/mount-charter-isms-compliance?label=release" alt="Release" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
    <img src="https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen.svg" alt="Node >=22.5.0" />
    <img src="https://img.shields.io/badge/platform-macOS%20(native%20WKWebView)-16181d.svg" alt="macOS Native" />
  </p>
</div>

<p align="center">
  <img src="docs/images/overview.png" alt="Mount Charter Overview — ISO 27001, ACSC Essential Eight, Privacy Act POLA 2024, Cyber Security Act 2024, and ISMS Governance Registers" width="100%" />
</p>

---

## Why Mount Charter?

Most GRC platforms are US-centric SaaS tools (\$15k–\$40k/year) that require uploading sensitive policies, architecture diagrams, and audit findings into a vendor's cloud — while treating Australian statutory regimes as shallow spreadsheet checklists.

**Mount Charter** is built for **solo CISOs, vCISOs, security consultants, and security-sensitive Australian SMBs** who want an audit-grade, forkable workbench that runs **100% locally on macOS**:

| Capability | Typical SaaS GRC | Mount Charter (v3.0) |
| --- | --- | --- |
| **Data residency & lock-in** | Multi-tenant cloud SaaS | **100% local SQLite (`0600`) + SHA-256 blobs**; portable `.zip` backup/restore |
| **Australian statutory depth** | Generic ISO mapping | **72 discrete Essential Eight criteria** (Weakest-Link), **POLA 2024 ADM (10 Dec 2026)**, **Cyber Security Act 2024 (72h ASD)**, **APRA CPS 234 & 230**, **SOCI Act**, **NAIC AI6** |
| **Audit-trail integrity** | Editable web forms | **SQLite `BEFORE UPDATE` / `BEFORE DELETE` triggers** enforcing append-only audit logs |
| **AI privacy & flexibility** | Vendor-hosted LLM only | **Bring your own**: Cloud API Key (macOS Keychain), **100% offline Ollama / LM Studio**, or official signed-in CLIs (`claude`, `codex`, `gemini`) |
| **Auditor handoff** | Portal invite required | **One-click Auditor Evidence Bundle (`.zip`)** with print-ready Executive HTML/PDF Report, CSVs, Markdown policies, raw evidence files & `SHA256SUMS.txt` |
| **Cost & licensing** | Annual seat/connector tax | **Free, open-source MIT License** — fork, adapt, or self-host freely |

---

## Supported Standards & Legislative Register

Every framework in Mount Charter declares an **honest support tier** (`full` first-class engine vs. `ai_context_only` prompt context), authoritative Federal Register of Legislation instrument ID, effective date, and `isDraft` separation so un-enacted bills never distort in-force readiness scores. See [docs/STANDARDS.md](docs/STANDARDS.md) for full legislative citations.

| Framework | Jurisdiction | Authoritative Instrument | Support Tier | Scope |
| --- | --- | --- | --- | --- |
| **ISO/IEC 27001:2022 (+ Amd 1:2024)** | International | ISO/IEC 27001:2022 + Amd 1:2024 | First-Class Core | 100 controls (`RQ4`–`RQ10` incl. Climate & Clause 6.3 + 93 Annex A) · plain-English explainers · 262 streamlined questions · SoA |
| **ACSC Essential Eight** | Australia | ASD Maturity Model (Nov 2023) + Oct 2026 ASD Essentials note | First-Class (Weakest-Link) | 72 discrete criteria (`ML1`–`ML3`) across all 8 strategies |
| **Privacy Act 1988 & POLA Act 2024** | Australia | `C2004C00253` / `C2024A00128` | First-Class Statutory | 19 in-force obligations (incl. 10 Dec 2026 ADM `APP 1.7`–`1.9` & COPC) + 2 `isDraft` Tranche 2 watch items |
| **Cyber Security Act 2024 (Cth)** | Australia | `C2024A00098` | First-Class Statutory | 7 duties incl. 72h ransomware payment reporting & Smart Device (IoT) Rules 2025 |
| **APRA CPS 234** | Australia | `F2018L01745` | First-Class Deltas + ISO refs | 8 statutory deltas (72h incident, 10-day material weakness, tripartite testing) |
| **APRA CPS 230** | Australia | APRA CPS 230 (Effective 1 Jul 2025) | First-Class Deltas + ISO refs | 8 statutory deltas (24h disruption, critical ops tolerances, MSP exit plans) |
| **SOCI Act 2018 (+ ERP Act 2024)** | Australia | `C2018A00029` / `C2024A00100` | First-Class Statutory | 6 obligations (business-critical data, CIRMP, 12h/72h ASD reporting) |
| **NAIC Guidance for AI Adoption (`AI6`)** | Australia | NAIC Oct 2025 | First-Class + Watch | 6 essential practices + 1 `isDraft` Nov 2026 Frontier AI watch item |
| **SOC 2 Type II / EU GDPR** | Int'l / EU | AICPA TSC / Reg. (EU) 2016/679 | `ai_context_only` | Explicitly labelled as AI prompt context only (never counted as audited) |

---

## Feature Tour

### 1. Australian Frameworks, Weakest-Link Maturity & Cross-Framework Drift
Essential Eight computes strict **Weakest-Link Maturity** (`MIN` across all 8 strategies). Whenever an Australian requirement marked `Met` or `PartiallyMet` contradicts a `Fail`, `Blocked`, `Excluded`, or un-evidenced `rubric_conflict` linked ISO 27001 control, Mount Charter raises a live **Cross-Framework Drift** alert. Every requirement also supports on-demand **AI Readiness Assessment** with human-in-the-loop approval.

<p align="center">
  <img src="docs/images/frameworks-e8.png" alt="ACSC Essential Eight 8-Strategy Weakest-Link Matrix and Cross-Framework Drift Detection" width="100%" />
</p>

### 2. Certification-Mandatory ISMS Governance Registers (`/governance`)
Everything an ISO 27001 certification auditor asks for beyond Annex A controls:
- **Risk Register & Risk Treatment Plan** (Clauses 6.1.2 / 6.1.3 / 8.2 / 8.3) with Likelihood × Impact scoring, 1-click 8-risk Australian SMB starter seeder, and M:N control links surfaced directly on the Statement of Applicability.
- **CAPA / Nonconformities** (Clause 10.2) + **Internal Audits & Management Reviews** (Clauses 9.2 / 9.3).
- **Vendors & APRA CPS 230 Material Service Providers** (A.5.19–5.22 & CPS 230) with exit-plan verification (`Missing` / `Documented` / `Tested`) and APP 8 residency tracking.
- **Policy Register & 6 Australian Starter Markdown Templates** (ISMS Policy, Access Control & MFA, Patch Management, Incident & Breach Response, Privacy & APP 1.7 ADM, Supplier & CPS 230).
- **Incident Log & Live Statutory Breach Clocks** automatically counting down 72h ASD ransomware reporting, 30-day OAIC NDB, 72h APRA CPS 234, 24h CPS 230, and 12h SOCI windows.

<p align="center">
  <img src="docs/images/governance-risks.png" alt="ISMS Risk Register & Risk Treatment Plan linked to ISO 27001 Controls" width="100%" />
</p>

<p align="center">
  <img src="docs/images/governance-incidents.png" alt="Security Incident Log with Live Australian Statutory Breach Clocks" width="100%" />
</p>

<details>
  <summary><strong>More Screenshots: Multi-Provider AI Settings &amp; Auditor Evidence Bundle Exports</strong></summary>
  <br />
  <p align="center">
    <img src="docs/images/settings-ai.png" alt="Multi-Provider AI Settings — Cloud API Keys, Offline Ollama/LM Studio, and Signed-In Subscription CLIs" width="100%" />
  </p>
  <p align="center">
    <img src="docs/images/audit-exports.png" alt="One-Click Auditor Evidence Bundle ZIP, Executive HTML/PDF Report, and RFC 5545 Deadlines Calendar" width="100%" />
  </p>
</details>

---

## Multi-Provider AI & 100% Offline Support

AI features (document-to-question evidence matching, Persona Auditor/Advisor/Analyst reviews, and Australian framework readiness assessment) are **strictly optional** and never require a vendor subscription:

| Mode | Supported Providers | Credential / Privacy Model |
| --- | --- | --- |
| **Cloud API Key** | Anthropic (Claude), OpenAI (ChatGPT), Google Gemini, xAI (Grok), Meta Llama, Custom OpenAI-Compatible (OpenRouter, Mistral, Together, Groq, vLLM) | Stored per-provider in **macOS Keychain** (`mount-charter`); SSRF metadata-IP guard on custom endpoints |
| **Local Open-Source (100% Offline)** | **Ollama** (`127.0.0.1:11434/v1`) & **LM Studio** (`127.0.0.1:1234/v1`) with live model auto-discovery | **Zero bytes leave your Mac** — ideal for defence, health, legal, or APRA-regulated evidence |
| **Signed-In Subscription CLI** | Official `claude`, `codex`, and `gemini` CLIs (auto-detected on `PATH`) | Uses your existing authenticated CLI session with zero cookie scraping |

---

## Local-First Architecture

```mermaid
flowchart LR
  UI["Mount Charter.app<br/>(Native Swift WKWebView + React + Paper v0.7.0)"]
  API["Loopback Express API<br/>(127.0.0.1:3852 · CSRF · Host/Origin · CSP)"]
  DB[("SQLite STRICT + WAL<br/>0600 · Immutable Triggers")]
  BLOBS[("SHA-256 Evidence Blobs<br/>0600 · Deduplicated")]
  KC["macOS Keychain<br/>(Per-Provider API Keys)"]
  LLM["Optional AI Provider<br/>(Local Ollama / Cloud API / Official CLI)"]
  CLI["Opt-In Read-Only Collectors<br/>(macOS Posture · gh · gcloud · aws)"]

  UI <-->|"X-Mount-Charter-Token"| API
  API <--> DB
  API <--> BLOBS
  API <--> KC
  API -.->|"Untrusted XML Framing"| LLM
  API -.->|"Fixed-argv execFile"| CLI
```

---

## Quick Start

### Requirements
- **Node.js `>= 22.5.0`** (uses built-in `node:sqlite`, zero native C++ addons)
- **macOS** + Xcode Command Line Tools (`swiftc`) for the native `.app` bundle and macOS Keychain *(Linux/Windows supported for browser/headless dev with `MOUNT_CHARTER_DISABLE_KEYCHAIN=1`)*

### Run Locally or Build the macOS App

```bash
# 1. Clone and install
git clone https://github.com/haberlah/mount-charter-isms-compliance.git
cd mount-charter-isms-compliance
npm install

# 2. Launch dev server (Express API + Vite HMR at http://127.0.0.1:3852)
npm run dev

# 3. Run full quality & security gates
npm run check          # TypeScript strict typecheck
npm run lint           # Biome check (--error-on-warnings)
npm test               # Critical unit, security, migration & HTTP tests
npm run drift:paper    # Verify vendored Paper v0.7.0 SHA-256 manifest
npm audit --omit=dev --audit-level=high

# 4. Build & install native /Applications/Mount Charter.app
npm run build:app
```

---

## Security & Privacy Guarantees

- **Strict code/data separation:** This repository contains generic application code, JSON schemas, and public legislative ontologies only. All user data lives strictly under `~/Library/Application Support/Mount Charter/` (`0600` SQLite + `0600` content-addressed `blobs/`, overridable via `MOUNT_CHARTER_DATA_DIR`).
- **Loopback isolation & CSRF:** Binds strictly to `127.0.0.1`, validates `Host` and `Origin` against DNS rebinding, enforces a per-launch 192-bit `X-Mount-Charter-Token` on all mutations, and serves strict `Content-Security-Policy` headers.
- **Database immutability:** SQLite `BEFORE UPDATE` / `BEFORE DELETE` triggers protect `test_runs`, `response_change_log`, and `requirement_assessment_log`.
- **Safe file & archive handling:** Magic-byte validation on uploads, formula-injection neutralisation on all CSVs, bounded zip-bomb & path-traversal protection on XLSX/ZIP parsing, and SHA-256 verification on workspace backup restores.

See [SECURITY.md](SECURITY.md) for the complete threat model and private vulnerability reporting instructions.

---

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System topology, SQLite `STRICT` schema, domain repositories, and ADRs
- [SECURITY.md](SECURITY.md) — Threat model, loopback/CSRF/CSP/SSRF/Keychain invariants, and vulnerability reporting
- [docs/STANDARDS.md](docs/STANDARDS.md) — Authoritative register of encoded standards, instrument IDs, and Nov 2026 transition notes
- [CHANGELOG.md](CHANGELOG.md) — Version history
- [CONTRIBUTING.md](CONTRIBUTING.md) — Development workflow, PR gates, and legislative ontology contribution rules
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards

---

## Acknowledgements

Mount Charter is built in grateful acknowledgement of the subject-matter-expert (SME) inspiration and guidance that shaped the project's ISMS structure, audit-readiness philosophy, and practical focus on real-world compliance governance.

Styled with the vendored [Paper v0.7.0](https://github.com/haberlah/paper) design system.

---

## License & Legal Disclaimer

Released under the **[MIT License](LICENSE)** — free to use, fork, modify, and adapt for internal security teams or vCISO client practices.

> **Disclaimer:** Mount Charter is an operational compliance workbench designed to support structured ISMS and regulatory readiness tracking. It does **not** constitute legal advice or formal accredited certification. Organisations should verify statutory applicability and reporting obligations against the [Federal Register of Legislation](https://www.legislation.gov.au/), [ASD/ACSC](https://www.cyber.gov.au/), [OAIC](https://www.oaic.gov.au/), [APRA](https://www.apra.gov.au/), and qualified legal or audit advisers.
