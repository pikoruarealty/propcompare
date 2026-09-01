# Tasklist — Lookup catalog data

**Status:** ready to start after data source is agreed  
**Owner:** Deep  
**Branch:** `task/lookup-catalog-data`  
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

## Implementation checklist

- [ ] Create the task branch from current `main`.
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
