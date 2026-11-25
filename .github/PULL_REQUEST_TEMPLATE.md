## Summary

<!-- Describe what this PR changes and why. -->

## Verification Checklist

- [ ] `npm run check` passes with 0 TypeScript errors
- [ ] `npm run lint` passes with 0 errors and 0 warnings (`--error-on-warnings`)
- [ ] `npm test` passes (and critical unit tests were added/updated for changed behaviour)
- [ ] `npm run drift:paper` passes (if Paper assets were touched)
- [ ] `npm audit --omit=dev --audit-level=high` reports 0 vulnerabilities
- [ ] No private client documents, SQLite databases, `.env` files, or API keys included
- [ ] Documentation (`README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `docs/STANDARDS.md`, `CHANGELOG.md`) updated where applicable
