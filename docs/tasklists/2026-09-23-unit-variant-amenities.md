# Tasklist — unit-type (private) amenities

**Status:** schema done (v11); extraction, dossier, and comparison surfaces not started.
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** `docs/schema/schema.v11.md`, the existing `amenity_catalog`/`amenity_synonyms` vocabulary, the existing `property_submissions` publish transaction.
**References:** `docs/tasklists/2026-09-21-page-review-ux-and-lighter-categorization.md` (original proposal), `DECISIONS.md` 2026-09-22 (owner approval), `docs/design/comparison.v1.md` (like-for-like principle — unit type against unit type), `AGENTS.md` (controlled vocabularies, publish-transaction-only writes)

## Why this exists

`property_amenities` says a property has a pool. It cannot say only the penthouse has one. `unit_variant_amenities` (schema v11, done) gives that a home; this tasklist is building everything that reads and writes it.

## Done

- [x] `unit_variant_amenities` table, FKs, unique index — `docs/schema/schema.v11.md`, migration `0015_minor_scalphunter`.
- [x] Added to `liveCatalogTables` (`src/db/schema/catalog.ts`) and named in `AGENTS.md`'s publish-transaction-only rule.

## Not started

1. **Extraction contract.** A unit-type amenities field needs a home in the OCR/manual submission field contract (`property_schema_fields`), analogous to how `property.amenities` works today but scoped to a `unit_variants` entry instead of the property. Check whether the existing per-scope field-candidate/evidence machinery (`property_submission_fields`, `property_submission_field_evidence`) already generalizes to a unit-scoped field or needs its own shape — this is the main open design question, not a rote copy of the property-level path.
2. **Publish transaction.** The transaction that currently writes `property_amenities` needs a matching write path for `unit_variant_amenities`, keyed by the submission's per-unit-variant field candidates from (1). Still publish-transaction-only, per `AGENTS.md`.
3. **Dossier.** A "Private amenities" row in the unit type's own section (not the property's amenities section), showing `available` / `not_stated` / `explicitly_not_offered` the same way the property section already does.
4. **Comparison.** A "Private amenities" row group, matched unit-type-to-unit-type per `docs/design/comparison.v1.md`'s like-for-like principle (a penthouse's private amenities compare against the other side's penthouse, not its 2 BHK). Needs a look at how the comparison's existing unit-type matching (room-by-room, floor plans) is keyed, and reuse that key rather than inventing a new one.

## Non-goals

- Not building a UI for the admin to add a unit-type amenity by free text — the catalog + synonym constraint applies here exactly as it does to `property_amenities`.
- Not backfilling existing published properties' unit variants with private amenities — this is forward-only until a real brochure surfaces one worth recording (Godrej Altus's ground/1st-floor shops and typical-floor flats, once published, may be the first real candidate).

## Acceptance

An admin reviewing a submission can mark a specific unit type's own amenity as available/not-stated/explicitly-not-offered, distinct from the property's amenities; it publishes through the normal transaction; it shows on that unit type's dossier section; and it appears as its own row group in a comparison, matched by unit type on both sides.

## Completion record

_(fill in at completion)_
