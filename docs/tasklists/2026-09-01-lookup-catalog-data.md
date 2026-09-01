# Tasklist — Lookup catalog data

**Status:** blocked — awaiting approved source data
**Owner:** Deep
**Branch:** `task/lookup-catalog-data`
**Base branch:** `task/phase-1-data-layer` (until the Phase 1 baseline merges to `main`)
**Depends on:** [Phase 1 data layer](2026-09-01-phase-1-data-layer.md)

## Scope

Populate the fixed Phase 1 lookup table shapes with reviewed Gujarat-relevant amenity/specification vocabularies, budget-bucket ranges, and the versioned OCR extraction-field contract. This task is data-only: it must not change the schema or write live catalog properties.

## References

- [Schema v1](../schema/schema.v1.md)
- [PRD](../product/prd.v1.md)
- [Admin flow](../app-flows/admin.md)
- [Contributor rules](../../AGENTS.md)

## Required inputs before implementation

- [ ] Approved amenity categories, canonical labels/keys, and brochure synonym list.
- [ ] Approved specification categories, canonical labels/keys, and brochure synonym list.
- [ ] Approved INR budget-bucket boundaries and display labels.
- [ ] Approved `property_schema_fields` list: field key, label, data type, JSON path where relevant, schema version, active state, and extraction description.

## Source review

- [ ] Add approved in-repository source documents, a project spreadsheet, or written product decisions here before seeding. Do not infer missing values from legacy code, brochure marketing, or general market conventions.

## Implementation checklist

- [x] Create `task/lookup-catalog-data` from the Phase 1 foundation branch; it will merge with that phase baseline before Phase 1 reaches `main`.
- [ ] Add the agreed data to the seed source using idempotent upserts keyed by each table's canonical key/unique identity.
- [ ] Keep controlled vocabulary values in catalog/synonym tables; never add free-text fallback fields.
- [ ] Seed only lookup/contract tables. Do not insert into `properties`, `unit_variants`, or any other live catalog table.
- [ ] Run the seed twice against local Postgres and verify stable row counts.

## Verification and handoff

- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] Record the approved source/version for each catalog in this tasklist.
- [ ] Update the Phase 1 tasklist and `PROGRESS.md`.
