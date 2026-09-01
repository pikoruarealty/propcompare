# Tasklist — Lookup catalog data

**Status:** blocked — structural audit complete; explicit catalog/contract approval required before seeding
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

- [x] Approve the [26-item initial amenity catalog](../data/v1-amenity-catalog.proposal.2026-09-01.md) and its source-synonym treatment. It is extensible through catalog review, not capped at 26.
- [x] Approve the [initial v1 specification catalog](../data/v1-specification-catalog.2026-09-01.md): construction details appear as property specifications, not buyer filters.
- [ ] Define INR budget-bucket boundaries/display labels. (The matching formula is already confirmed.)
- [ ] Approved `property_schema_fields` list: field key, label, data type, JSON path where relevant, schema version, active state, and extraction description.

## Recorded product direction

- [x] V1 amenity catalog has no numerical cap. Canonical keys/labels plus synonyms prevent casing, spacing, punctuation, and approved wording duplicates; unmatched semantic concepts require catalog review. See [DECISIONS.md](../../DECISIONS.md).
- [x] Security, visitor parking, and service lift are buyer-facing v1 amenity filters, not inferred values. See [DECISIONS.md](../../DECISIONS.md).
- [x] `clubhouse` is a buyer-facing v1 amenity filter; `club house` maps to it as a synonym.
- [x] Construction details use the separate controlled specification catalog; property-specific values remain evidence-backed, reviewed detail text.
- [x] Budget matching is inclusive and tolerant: for `[min, max]`, candidates fall within `[min × 0.80, max × 1.20]`, while exact prices remain private.

## Phase 3 compatibility note

The current `private.unit_current_bucket` view supports coarse classification only. Exact ±20% range matching has a dedicated planned [Phase 3 tasklist](2026-09-01-phase-3-budget-range-matching.md) for a service-only private matcher that returns only candidate IDs, never price data. Do not alter the private schema/view during this Phase 1 lookup task.

## Source review

- [x] Review the read-only [legacy OCR structure audit](2026-09-01-legacy-ocr-structure-audit.md). It provides candidate field and vocabulary shapes only; it does not approve catalog values.
- [x] Record approved in-repository product decisions and catalog sources: [amenities](../data/v1-amenity-catalog.proposal.2026-09-01.md), [specifications](../data/v1-specification-catalog.2026-09-01.md), and [decisions](../../DECISIONS.md). Do not infer missing values from legacy code, brochure marketing, or general market conventions.

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
