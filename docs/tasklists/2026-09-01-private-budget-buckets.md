# Tasklist — Private budget buckets

**Status:** complete
**Owner:** Deep
**Branch:** `task/lookup-catalog-data`
**Depends on:** [Lookup catalog data](2026-09-01-lookup-catalog-data.md)

## Scope

Move the one canonical `budget_buckets` representation from `public` to
`private`, preserve the service-only coarse-classification view, and seed the
approved fixed internal bands. This is a security-boundary correction; it does
not add a second bucket table and does not change the Phase 3 ±20% matcher.

## References

- [Schema v2](../schema/schema.v2.md)
- [Schema v1](../schema/schema.v1.md)
- [Architecture](../../ARCHITECTURE.md)
- [Phase 3 budget matching](2026-09-01-phase-3-budget-range-matching.md)
- [Contributor rules](../../AGENTS.md)

## Checklist

- [x] Record the approved structural/security decision.
- [x] Move the sole table through a reviewed migration without data loss.
- [x] Keep the normal application role unable to read private bucket bounds.
- [x] Preserve `private.unit_current_bucket` as service-only coarse classification.
- [x] Add an idempotent service-role-only seed path for fixed internal bands.
- [x] Apply the migration and run the private seed twice.
- [x] Verify app-role denial (`42501`) and service-role view access.
- [x] Run format, lint, typecheck, tests, and migration-generation verification.
- [x] Update the dependent lookup and Phase 1 tasklists plus `PROGRESS.md`.
