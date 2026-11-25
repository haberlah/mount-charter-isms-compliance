# Contributing to Mount Charter

Thank you for helping keep Mount Charter clean, accurate, and audit-grade.

## Local Development Setup

```bash
node -v        # Requires Node.js >= 22.5.0
npm install
npm run dev    # Runs Express + Vite on http://127.0.0.1:3852
```

## Quality Gates

Every pull request must pass the same checks enforced by `.github/workflows/ci.yml`:

```bash
npm run check          # TypeScript strict type-checking (0 errors)
npm run lint           # Biome linting & formatting (0 errors)
npm test               # Full Node test suite (tests/*.test.ts)
npm run drift:paper    # Vendored Paper v0.7.0 checksum integrity
npm run build          # Production client + server bundle
npm audit --omit=dev --audit-level=high
```

## Architecture & Coding Standards

- **Domain repositories (`server/repositories/`):** Keep SQL queries grouped by domain (`workspaces`, `controls`, `evidence`, `audit`, `frameworks`, `governance`, `dashboard`) rather than growing `server/storage.ts`.
- **Immutable audit tables:** Never weaken or bypass the `BEFORE UPDATE` / `BEFORE DELETE` triggers on `test_runs`, `response_change_log`, or `requirement_assessment_log`.
- **Modular UI components:** Keep React pages thin route orchestrators and place tab/dialog views under `client/src/components/<domain>/`.
- **Paper design system:** Use vendored Paper tokens (`--paper-*`) and classes (`.pp-*`) rather than ad-hoc hardcoded colours or layout styles.
- **No private data:** Never commit organisation-specific policies, SQLite databases, `.env` files, or API keys.

## Updating Standards & Legislation (`seed-data/`)

When updating `seed-data/frameworks.json` or `seed-data/iso_27001_ontology.json`:

1. Verify statutory text, instrument IDs, and commencement dates against official sources (Federal Register of Legislation, ASD/ACSC, OAIC, APRA, ISO).
2. Mark un-enacted bills or consultation drafts with `"isDraft": true` so they are excluded from in-force readiness denominators.
3. Ensure every `isoMappings[].controlNumber` references an existing control in `seed-data/iso_27001_ontology.json`.
4. Run `npm test` to verify `tests/seed-integrity.test.ts` and `tests/migrations.test.ts` pass.
5. Update [docs/STANDARDS.md](docs/STANDARDS.md) with the new verification date and any legislative transition notes.
