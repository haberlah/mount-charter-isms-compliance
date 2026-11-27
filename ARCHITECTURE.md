# Architecture

Mount Charter is a local-first macOS desktop application composed of a native Swift `WKWebView` shell, an embedded Node.js/Express API server, a SQLite database (`node:sqlite`), and a React/TypeScript frontend styled with the vendored Paper v0.7.0 design system.

---

## High-Level Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│  /Applications/Mount Charter.app  (Swift WKWebView Shell)                 │
│   • Launches bundled Node server on 127.0.0.1:3852 with launch token    │
│   • Injects X-Mount-Charter-Token via WKUserScript                        │
│   • Bridges NSSavePanel downloads & Reveal Data Folder via WKScriptMsg  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Loopback HTTP + SSE (127.0.0.1:3852)
┌────────────────────────────────────▼────────────────────────────────────┐
│  Express API Server (server/)                                           │
│   • Middleware: Host/Origin/CSRF/CSP guards (server/security.ts)        │
│   • Routes: workspaces, controls, evidence, audit, frameworks, settings │
│   • Services: document-processor, blob-store, ai, control-schedule      │
│   • Domain Repositories (server/repositories/*)                         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ node:sqlite (WAL + STRICT + FKs)
┌────────────────────────────────────▼────────────────────────────────────┐
│  ~/Library/Application Support/Mount Charter/                             │
│   • mount-charter.sqlite (0600) — immutable triggers on audit log tables  │
│   • blobs/<sha256-prefix>/<sha256> (0600) — deduplicated evidence files │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
mount-charter-isms-compliance/
├── client/src/
│   ├── components/
│   │   ├── PaperUi.tsx              # Vendored Paper v0.7.0 React wrappers, dialogs & ⌘K CommandPalette
│   │   ├── audit/                   # SoaTab, TestTrailTab, AiActivityTab, AuditExportsTab
│   │   ├── controls/                # AssessmentTab, ControlEvidenceTab, TestHistoryTab,
│   │   │                            # ControlPropertiesInspector, RecordTestSheet
│   │   ├── evidence/                # DocumentsTab, ExternalLinksTab, AiReviewQueueTab,
│   │   │                            # CollectorsTab, EvidenceDialogs
│   │   ├── frameworks/              # RequirementCard (Drift + AI Assess), FrameworkOverviewTab
│   │   ├── governance/              # RisksTab, CapaAndReviewsTab, VendorsTab,
│   │   │                            # PoliciesTab, IncidentsTab
│   │   └── settings/                # ProfileTab, ScheduleTab, AiSettingsTab, WorkspacesTab
│   ├── pages/                       # Thin route orchestrators (Overview, Controls,
│   │                                # ControlDetail, Governance, Evidence, Frameworks, Audit, Settings)
│   └── lib/api.ts                   # CSRF-aware fetch, SSE stream client, native save bridge
├── server/
│   ├── app.ts / index.ts            # Express composition & loopback bootstrap
│   ├── db.ts                        # SQLite STRICT schema (incl. 7 governance tables), triggers, migrations
│   ├── storage.ts                   # Thin facade over server/repositories/*
│   ├── repositories/                # Domain repositories:
│   │                                # common, workspaces, controls, evidence, audit,
│   │                                # frameworks, governance, dashboard
│   ├── routes/                      # Domain Express routers (incl. governance, operations)
│   ├── security.ts                  # Loopback, CSRF, CSP, URL validation, Keychain helper
│   ├── document-processor.ts        # PDF/DOCX/XLSX/text extraction (zip-bomb safe) & chunking
│   ├── blob-store.ts                # Content-addressed local storage & magic-byte validation
│   ├── ai-provider.ts / ai.ts       # Multi-provider AI engine (API keys, Ollama/LM Studio, CLIs)
│   ├── zip-writer.ts                # Pure-Node deflate/CRC32 ZIP writer & zip-bomb-safe reader
│   ├── report-generator.ts          # Executive HTML Report, Auditor Bundle ZIP, RFC 5545 .ics
│   ├── backup.ts                    # Portable Workspace Backup & isolated Restore (.zip)
│   ├── collectors.ts                # Opt-in read-only local CLI evidence collectors
│   └── policy-templates.ts          # 6 AU ISMS starter policy templates & 8 starter risks
├── shared/schema.ts                 # Shared TypeScript domain interfaces & Zod v4 schemas
├── seed-data/
│   ├── iso_27001_ontology.json      # v3.0: 100 controls with plain-English explainers, ISO 27002 attributes & 262 focused Qs
│   ├── iso_27001_ontology.schema.json
│   ├── ontology_v2_1_to_v3_0_map.json # Deterministic 506-question lossless v2.1 -> v3.0 migration map
│   ├── frameworks.json              # 10 frameworks, 129 discrete requirements & ISO mappings
│   └── frameworks.schema.json
├── macos/                           # Swift WKWebView shell, shield-peak icon, build-app.sh
└── tests/                           # Node built-in test runner suites (tsx --test)
```

---

## Unified Multi-Framework Data Model

Mount Charter uses a **normalized relational multi-framework ontology** in SQLite (`STRICT` tables, `foreign_keys = ON`, `WAL` mode):

1. **ISO/IEC 27001:2022 Core (`controls`, `workspace_controls`, `question_responses`, `test_runs`, `response_change_log`):**
   - Controls and questions are seeded globally and linked per workspace through `workspace_controls`.
   - Every response edit and test run writes to append-only audit tables guarded by SQLite triggers.
2. **Framework Catalog & Provenance (`frameworks`, `framework_requirements`, `control_framework_mappings`):**
   - Each framework carries `jurisdiction`, `instrument_id`, `source_url`, `effective_date`, `transition_note`, `scoring_mode`, and `support_tier`.
   - Requirements carry `clause_ref`, `domain`, `level_or_category`, `prescriptive_sla_json`, `deadline_date`, and `is_draft`.
   - Draft / exposure-draft watch items (`is_draft = 1`) are excluded from in-force `readinessPercentage` denominators so forward-looking bills never distort current statutory compliance.
   - Cross-mappings (`control_framework_mappings`) declare explicit semantic coverage: `full`, `partial`, `delta_required`, or `rubric_conflict` (for example, Essential Eight's 48-hour critical patching SLA overriding ISO A.8.8 risk-based timelines).
3. **Per-Workspace Assessments, Evidence & Immutable History (`workspace_frameworks`, `workspace_requirement_assessments`, `requirement_evidence_links`, `requirement_assessment_log`):**
   - Every requirement status change appends an immutable row to `requirement_assessment_log` (`framework_code` + `req_code` denormalized so catalog upgrades never break historical audit trails).
   - Requirements link directly to local Evidence Library documents (`document_id`) or validated external URLs.

---

## Key Architecture Decision Records (ADRs)

- **ADR-001 — Built-in `node:sqlite` over native addons:** Eliminates `better-sqlite3` C++ rebuild fragility across Node upgrades and simplifies `.app` bundling.
- **ADR-002 — Domain repositories behind a facade (`server/repositories/*`):** Separates workspace, control, evidence, audit, framework, and dashboard SQL queries into cohesive `<450 LOC` modules while preserving a clean `storage` facade.
- **ADR-003 — Vendored Paper v0.7.0 with drift check:** All CSS tokens, icons, and web components are vendored under `client/public/vendor/paper` and verified against upstream SHA-256 hashes via `npm run drift:paper` so the desktop app works 100% offline with zero CDN dependencies.
- **ADR-004 — Additive migrations + idempotent catalog pruning:** Opening an older SQLite file applies additive `ALTER TABLE` migrations, upserts catalog updates, and prunes superseded catalog requirement codes without touching user workspaces or immutable audit logs.
