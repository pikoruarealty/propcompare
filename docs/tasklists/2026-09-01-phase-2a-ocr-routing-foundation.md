# Tasklist — Phase 2A OCR routing and evidence foundation

**Status:** complete
**Owner:** Bhavarth
**Branch:** `task/phase-2a-ocr-foundation`
**Roadmap:** [Phase 2A](../roadmap.md#phase-2a--admin-ingestion--the-trust-boundary)

## Scope

Establish the versioned contract and persistence needed to route selected
brochure pages into controlled OCR extraction. One confirmed unit-variant scope
may contain multiple pages, so multi-floor penthouse or duplex plans remain one
proposed canonical variant. Replace single-page field provenance with
many-page evidence, and define a provider-neutral adapter boundary that emits
only active `property_schema_fields` values.

The historical property JSON files are read-only evaluation evidence. They may
be normalized for comparison reports, but they never create submissions or
populate live catalog records. Every selected brochure will be processed again
by the new versioned pipeline before it is eligible for review or publication.

## References

- [Product requirements](../product/prd.v1.md)
- [API specification](../api/api-spec.v1.md)
- [Admin app flow](../app-flows/admin.md)
- [Architecture](../../ARCHITECTURE.md)
- [Canonical schema v2](../schema/schema.v2.md)
- [Approved OCR field contract](../data/v1-property-schema-fields.proposal.2026-09-01.md)
- [Legacy OCR structure audit](../data/legacy-ocr-structure-audit.2026-09-01.md)
- [Design tokens](../design/design-tokens.md)

## Non-goals

- Do not choose or call a paid OCR provider in this task.
- Do not import the historical JSON payloads into `property_submissions`.
- Do not create or seed properties, unit variants, media, or prices.
- Do not implement the publish transaction, RERA scraper, or admin page-picker
  UI in this task.
- Do not add floor/level structure to `unit_variants.dimensions`; multiple
  floor-plan pages can belong to one variant without claiming structured
  room-to-level data that the current catalog cannot represent.

## Decisions and constraints

- [x] Page routing is human-confirmed before paid extraction; cheap text-layer
      inspection may suggest scopes but cannot create variant identity.
- [x] OCR attempts store an immutable, versioned routing manifest after they
      leave draft state; it is workflow metadata, not a second unit-variant entity.
- [x] A unit-variant scope contains the reviewed BHK key, optional layout key,
      proposed variant name, and one or more ordered source pages.
- [x] Historical and new OCR outputs are compared only through a derived
      evaluation report. Only new-pipeline output may enter the submission flow.
- [ ] OCR provider selection remains open and requires its own dated decision
      in the later provider-integration task.

## Implementation checklist

- [x] Record the approved routing, reprocessing, and legacy-comparison policy
      in `DECISIONS.md`.
- [x] Publish schema v3 as the canonical structural delta from schema v2.
- [x] Move attempt status from `source_documents` into versioned OCR job rows.
- [x] Store the validated page-routing manifest on each OCR job.
- [x] Replace scalar submission-field source columns with a child evidence
      table supporting multiple pages and optional JSON value paths.
- [x] Define provider-neutral routing, extraction-result, and adapter types.
- [x] Validate page bounds, duplicate pages, unit-scope identity, contract
      field keys, evidence pages, confidences, and one-variant-per-scope behavior.
- [x] Keep legacy comparison inputs outside the submission adapter.
- [x] Generate and inspect the migration; confirm it contains no live catalog
      writes or seed data.

## Verification

- [x] Unit tests cover a multi-page penthouse as one variant scope.
- [x] Unit tests reject invalid/duplicate/out-of-range routing pages.
- [x] Unit tests reject adapter fields outside the active contract.
- [x] Unit tests prove legacy comparison output cannot become submission input.
- [x] `bun run db:generate` (no schema drift after migration generation)
- [x] `bun run db:migrate`
- [x] `bun run format:check`
- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test` (2 files, 9 tests)
- [x] `git diff --check`

## Acceptance criteria

- The database can retain reproducible OCR attempts and multi-page evidence
  without introducing a second live representation of a property or variant.
- The adapter accepts only the approved versioned contract and preserves all
  evidence required for reconciliation.
- Historical JSON can be evaluated against new output but cannot be published
  or converted into a submission through the production adapter.
- No live catalog table is modified except by the future publish transaction.

## Documentation and handoff

- [x] Update `ARCHITECTURE.md`, the admin flow, API specification, and roadmap.
- [x] Update `PROGRESS.md` with outcome, verification, and the next bounded task.
- [x] Complete this tasklist and retain it as project history.

## Completion record

Completed locally on 2026-09-01. Schema v3, migration `0003`, the routing and
adapter contracts, comparison-only legacy boundary, and nine passing contract
tests establish the OCR foundation. No provider was selected, no brochure was
processed, and no live catalog record was written. The next Phase 2A task is
the submission review state machine and publish transaction.
