# Tasklist — Lookup catalog data

**Status:** complete
**Owner:** Deep
**Branch:** `task/lookup-catalog-data`
**Base branch:** `task/phase-1-data-layer` (until the Phase 1 baseline merges to `main`)
**Depends on:** [Phase 1 data layer](2026-09-01-phase-1-data-layer.md)

**Completion:** approved lookup vocabularies, the OCR contract, and fixed
internal bands are seeded. Budget bounds are private under schema v2; the
normal application role cannot read them.

## Scope

Populate the fixed Phase 1 lookup table shapes with reviewed Gujarat-relevant amenity/specification vocabularies, budget-bucket ranges, and the versioned OCR extraction-field contract. This task is data-only: it must not change the schema or write live catalog properties.

## References

- [Schema v2](../schema/schema.v2.md)
- [PRD](../product/prd.v1.md)
- [Admin flow](../app-flows/admin.md)
- [Contributor rules](../../AGENTS.md)

## Required inputs before implementation

- [x] Approve the [26-item initial amenity catalog](../data/v1-amenity-catalog.proposal.2026-09-01.md) and its source-synonym treatment. It is extensible through catalog review, not capped at 26.
- [x] Approve the [initial v1 specification catalog](../data/v1-specification-catalog.2026-09-01.md): construction details appear as property specifications, not buyer filters.
- [x] Choose fixed internal INR magnitude bands for the current version. Their exact boundaries and labels remain unseeded because of the placement conflict recorded below. (The matching formula is already confirmed.)
- [x] Approve and seed the exact [`property_schema_fields` contract](../data/v1-property-schema-fields.proposal.2026-09-01.md): field key, label, data type, JSON path where relevant, schema version, active state, and extraction description.

## Recorded product direction

- [x] V1 amenity catalog has no numerical cap. Canonical keys/labels plus synonyms prevent casing, spacing, punctuation, and approved wording duplicates; unmatched semantic concepts require catalog review. See [DECISIONS.md](../../DECISIONS.md).
- [x] Security, visitor parking, and service lift are buyer-facing v1 amenity filters, not inferred values. See [DECISIONS.md](../../DECISIONS.md).
- [x] `clubhouse` is a buyer-facing v1 amenity filter; `club house` maps to it as a synonym.
- [x] Construction details use the separate controlled specification catalog; property-specific values remain evidence-backed, reviewed detail text.
- [x] Budget matching is inclusive and tolerant: for `[min, max]`, candidates fall within `[min × 0.80, max × 1.20]`, while exact prices remain private.

## Phase 3 compatibility note

The current `private.unit_current_bucket` view supports coarse classification only. Exact ±20% range matching has a dedicated planned [Phase 3 tasklist](2026-09-01-phase-3-budget-range-matching.md) for a service-only private matcher that returns only candidate IDs, never price data. Do not alter the private schema/view during this Phase 1 lookup task.

## Budget placement resolution

The original public placement would have exposed price bounds to the normal app
role. The sole table moved to `private` in [schema v2](../schema/schema.v2.md),
and its security-invoker classifier remains service-only. See the completed
[private-budget tasklist](2026-09-01-private-budget-buckets.md).

## Source review

- [x] Review the read-only [legacy OCR structure audit](2026-09-01-legacy-ocr-structure-audit.md). It provides candidate field and vocabulary shapes only; it does not approve catalog values.
- [x] Record approved in-repository product decisions and catalog sources: [amenities](../data/v1-amenity-catalog.proposal.2026-09-01.md), [specifications](../data/v1-specification-catalog.2026-09-01.md), and [decisions](../../DECISIONS.md). Do not infer missing values from legacy code, brochure marketing, or general market conventions.

## Implementation checklist

- [x] Create `task/lookup-catalog-data` from the Phase 1 foundation branch; it will merge with that phase baseline before Phase 1 reaches `main`.
- [x] Seed the approved amenity catalog and approved source synonyms using idempotent upserts.
- [x] Seed the approved specification catalog and source-field synonyms using idempotent upserts.
- [x] Seed fixed internal budget bands through the service-role-only seed path.
- [x] Seed `property_schema_fields` from the approved exact contract.
- [x] Keep controlled vocabulary values in catalog/synonym tables; never add free-text fallback fields.
- [x] Seed only lookup/contract tables. Do not insert into `properties`, `unit_variants`, or any other live catalog table.
- [x] Run public and private seeds twice with stable counts: 26 amenities, 51 amenity synonyms, 13 specifications, 13 specification synonyms, 26 OCR fields, and 16 private budget bands.

## Verification and handoff

- [x] `bun run format:check`
- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test`
- [x] Record the approved source/version for seeded catalogs: [amenities](../data/v1-amenity-catalog.proposal.2026-09-01.md) and [specifications](../data/v1-specification-catalog.2026-09-01.md), both version `2026-09-01`.
- [x] Update the Phase 1 tasklist and `PROGRESS.md`.
