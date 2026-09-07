# Tasklist — Schema v5 brochure fields (floors, units-per-floor, plot area, developer narrative)

**Status:** complete
**Owner:** Bhavarth
**Branch:** `task/schema-v5-brochure-fields`
**Roadmap:** [Phase 2A](../roadmap.md#phase-2a--admin-ingestion--the-trust-boundary)

## Scope

Implement the four schema v5 columns as Drizzle schema + migration, extend the
approved OCR field contract to cover them, and wire them through the existing
submission validation / publish transaction. No new provenance mechanism, no
new live-write path — these are ordinary evidence-backed fields going through
the one existing `property_submissions` publish transaction.

## References

- [Canonical schema v5](../schema/schema.v5.md)
- [Approved OCR field contract](../data/v1-property-schema-fields.proposal.2026-09-01.md)
- [DECISIONS.md — 2026-09-02 schema v5 entry](../../DECISIONS.md)
- [Contributor rules](../../AGENTS.md)

## Non-goals

- Do not touch `rera_project_land_area_sqft` or any other existing RERA-gated
  column; `plot_area_sqft` is additive and independent, never a fallback for it.
- Do not add a synonym/catalog table for `developers.profile_narrative` — it
  is free text, not a controlled vocabulary.
- Do not change the OCR provider or extraction prompt's other field behavior
  beyond adding these four fields to the contract.
- Do not backfill existing published properties; these fields populate only
  through new submissions going forward.

## Implementation checklist

- [x] Add `properties.total_floors`, `properties.plot_area_sqft`,
      `developers.profile_narrative`, `unit_variants.units_per_floor` to the
      Drizzle schema files and generate migration `0005`.
- [x] Extend `property_schema_fields` seed rows for the four new contract
      fields (field key, display label, target column/path) per the pattern
      in `v1-property-schema-fields.proposal.2026-09-01.md`.
- [x] Update `src/lib/submissions/validation.ts` to accept the new fields
      against the extended contract.
- [x] Update `src/lib/submissions/publisher.ts` to write the four fields
      inside the existing publish transaction (new-property insert and
      additive-patch update paths).
- [x] Confirm the extraction prompt/adapter (see the OCR provider integration
      tasklist) is the only producer of values for these fields — no admin
      manual-entry shortcut bypassing evidence.

## Verification

- [x] Unit tests: validation accepts the four new fields when present in the
      active contract and rejects them if the contract row is missing/disabled.
- [x] Integration test: publishing a new property with all four fields
      populates the correct columns; publishing an additive-patch update
      leaves them unchanged when omitted (same additive-patch semantics as
      every other field).
- [x] `bun run db:generate` (no schema drift after migration generation)
- [x] `bun run db:migrate`
- [x] `bun run format:check`
- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test`
- [x] `git diff --check`

## Acceptance criteria

- The four fields have exactly one live representation each, populated only
  through the publish transaction, with evidence rows like any other
  contract field.
- No existing RERA-gated column's behavior changes.

## Documentation and handoff

- [x] Update `PROGRESS.md` with outcome and verification results.
- [x] Complete this tasklist and retain it as project history.

## Implementation note

`units_per_floor` is carried as `unitsPerFloor` inside the existing composite
`unit_variants` contract row. A separate scalar contract row could not identify
which of several variants it belongs to and would create a second representation
of the same variant fact. The other three additions are new scalar contract rows;
the existing `unit_variants` row is versioned to `v5` and now explicitly covers
the fourth field. Evidence continues to use the variant array item `valuePath`.
