# Security Policy & Threat Model

Mount Charter is designed as a **local-first single-user desktop application**. This document records the security architecture, trust boundaries, enforced invariants, and vulnerability reporting process.

---

## 1. Trust Boundary & Loopback Isolation

- **Loopback-only binding:** The embedded Express server binds strictly to `127.0.0.1` (default port `3852`) and never exposes a network interface on `0.0.0.0` or LAN addresses.
- **Host header validation (DNS rebinding defence):** Every incoming HTTP request is validated against `isValidLoopbackHost()` (`127.0.0.1:<port>` or `localhost:<port>`). Non-loopback `Host` headers are rejected with `403 Forbidden`.
- **CSRF & cross-origin mutation protection:** Every mutating request (`POST`, `PUT`, `PATCH`, `DELETE`) must pass `verifyMutationRequest()`:
  1. Rejects non-loopback `Origin` headers (`403`).
  2. Rejects cross-site `Sec-Fetch-Site` headers (`403`).
  3. Verifies a per-launch cryptographically random 192-bit token (`X-Mount-Charter-Token`) using constant-time comparison (`crypto.timingSafeEqual`, `401` on mismatch). The native macOS launcher injects this token into the `WKWebView` context via `WKUserScript`.
- **Content Security Policy & browser headers:**
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`

---

## 2. Secrets & Local Storage Hardening

- **macOS Keychain:** Optional cloud provider API keys (Anthropic, OpenAI, Gemini, xAI, Meta, Custom OpenAI-Compatible) are never stored in SQLite, `localStorage`, or `.env` files inside the repository. `server/security.ts` enforces:
  - Strict account-name allowlist (`^[A-Z0-9_]{1,64}$`) preventing argument/newline injection into `security -i`.
  - Unconditional `b64:` encoding when writing via stdin to `/usr/bin/security -i` so secret material never appears in `ps` process arguments and cannot break interactive quoting.
- **Multi-Provider AI SSRF & Subscription Boundaries:**
  - Custom/local LLM endpoints (`aiBaseUrl`) are validated by `validateLlmBaseUrl()` (`server/ai-provider.ts`), permitting only `http:` / `https:` schemes and explicitly blocking cloud metadata IPs (`169.254.169.254`, `metadata.google.internal`, `100.100.100.200`) and non-HTTP schemes.
  - Subscription connections invoke only official user-installed CLIs (`claude`, `codex`, `gemini`) via `execFile` with fixed argv arrays — Mount Charter never scrapes browser cookies or bypasses consumer web auth.
- **Opt-In Local CLI Evidence Collectors:**
  - Collectors (`server/collectors.ts`) use strictly hardcoded read-only `execFile` invocations (never `shell: true` or user-supplied arguments), bounded timeouts, and bounded output buffers.
- **ZIP Archive & Backup Restore Safety:**
  - Pure-Node ZIP reader (`server/zip-writer.ts`) enforces strict entry counts, per-entry and cumulative decompression ceilings, path traversal checks, and SHA-256 verification during workspace backup restore.
- **Local file permissions:**
  - `mount-charter.sqlite` is `chmod 0600`.
  - Uploaded evidence blobs are stored content-addressed (`sha256` prefix sharding) with `0600` permissions inside `~/Library/Application Support/Mount Charter/blobs/`.
  - `blobs` directory is `0700`.

---

## 3. Input Validation & File Processing Defences

- **Schema validation:** All API mutation payloads are parsed through strict Zod v4 schemas (`shared/schema.ts`).
- **Stored XSS prevention:** All external evidence URLs (on controls, test runs, and framework requirements) pass `safeHttpUrl()`, permitting only `http:` and `https:` schemes and blocking `javascript:`, `data:`, `file:`, and `vbscript:`.
- **Magic-byte verification:** Uploaded files are checked against magic-byte signatures (`server/blob-store.ts`) before storage.
- **XLSX ZIP-bomb mitigation:** The built-in ZIP/XLSX parser (`server/document-processor.ts`) enforces strict decompression budgets:
  - `MAX_ZIP_ENTRIES = 256`
  - `MAX_ZIP_ENTRY_BYTES = 20 MB` (enforced both on ZIP header claims and via Node's `zlib.inflateRawSync(raw, { maxOutputLength })`)
  - `MAX_ZIP_TOTAL_BYTES = 50 MB` cumulative extracted output.
- **CSV formula injection neutralisation:** All CSV exports pass through `escapeCsvField()` (`server/csv.ts`), prefixing formula-leading characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with a single quote.
- **Prompt-injection isolation:** Uploaded document chunks sent to Claude (`server/ai.ts`) are framed as untrusted data inside structured XML boundaries with explicit system instructions not to follow embedded directives.

---

## 4. Database Audit-Trail Integrity

SQLite `BEFORE UPDATE` and `BEFORE DELETE` triggers enforce append-only immutability on:

- `test_runs` (`trg_test_runs_no_update`, `trg_test_runs_no_delete`)
- `response_change_log` (`trg_response_change_log_no_update`, `trg_response_change_log_no_delete`)
- `requirement_assessment_log` (`trg_req_assessment_log_no_update`, `trg_req_assessment_log_no_delete`)

Deleting an evidence document referenced by `response_change_log` soft-archives the record rather than destroying audit provenance.

---

## 5. Reporting a Vulnerability

If you discover a security issue in Mount Charter:

1. **Do not** open a public issue containing exploit details or sensitive local data.
2. Report privately to the repository maintainer via GitHub Security Advisories on `haberlah/mount-charter-isms-compliance`.
3. Include reproduction steps, affected file paths, and impact assessment. Verified vulnerabilities are patched and released with a corresponding regression test under `tests/`.
