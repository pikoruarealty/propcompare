# Tasklist — unit-type (private) amenities

**Status:** done (2026-09-25), except brochure extraction, which is deferred. Schema done (v11); review, publish, dossier and comparison being built; brochure extraction deferred.
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** `docs/schema/schema.v11.md`, the existing `amenity_catalog`/`amenity_synonyms` vocabulary, the existing `property_submissions` publish transaction.
**References:** `docs/tasklists/2026-09-21-page-review-ux-and-lighter-categorization.md` (original proposal), `DECISIONS.md` 2026-09-22 (owner approval), `docs/design/comparison.v1.md` (like-for-like principle — unit type against unit type), `AGENTS.md` (controlled vocabularies, publish-transaction-only writes)

## Why this exists

`property_amenities` says a property has a pool. It cannot say only the penthouse has one. `unit_variant_amenities` (schema v11, done) gives that a home; this tasklist is building everything that reads and writes it.

## Done

- [x] `unit_variant_amenities` table, FKs, unique index — `docs/schema/schema.v11.md`, migration `0015_minor_scalphunter`.
- [x] Added to `liveCatalogTables` (`src/db/schema/catalog.ts`) and named in `AGENTS.md`'s publish-transaction-only rule.

## Design (owner-approved 2026-09-25, in chat)

No new table and no new contract field. A unit type is already one entry of the `unit_variants` value; it gains an optional `amenities` list of `{ key, status }`, where `key` is an `amenity_catalog` key (validated against the same catalog as `property.amenities`) and `status` is `available` or `explicitly_not_offered`. `not_stated` is the absence of a row, so it is never written. When a variant in a submission carries `amenities`, that list is the complete set for that unit type: the publish transaction upserts the listed rows and deletes any other row of that unit type (back to not stated). A variant without `amenities` leaves its rows untouched, so an edit that does not mention them cannot erase them. Only the publish transaction writes `unit_variant_amenities`.

## Steps

1. [x] Validation: `SubmissionUnitVariant.amenities`, checked against the catalog, no duplicates, two statuses only.
2. [x] Publish transaction: write `unit_variant_amenities` as above.
3. [x] Live values: report each live unit type's amenities so an edit starts from what is live.
4. [x] Review control: the unit-type editor carries and edits the list; saving never drops it.
5. [x] Buyer read: `DossierUnitVariant.amenities` (`GET /api/v1/properties/{slug}`, so `api-spec.v1.md`); the sign-in lock withholds it.
6. [x] Dossier: a "Private amenities" row in each unit type's own section.
7. [x] Comparison: a "Private amenities" row group in the chosen unit types' detail, matched unit type to unit type; part of the locked depth.
8. [x] Docs: `DECISIONS.md` entry, `PROGRESS.md`, the payload note in the schema doc.
9. [x] Verification: typecheck, lint, format and the full suite (161 files, 1950 tests) pass, including real-database tests for publish, replacement, refusal and read-back.

## Deferred (needs the owner)

- **Extraction from brochures.** The OCR prompts read unit types from floor-plan pages only. Having them also read a unit type's own amenities changes paid prompts and can only be judged on a paid run, so it waits for the owner's go-ahead. Until then the amenities are entered in review.

## Non-goals

- Not building a UI for the admin to add a unit-type amenity by free text — the catalog + synonym constraint applies here exactly as it does to `property_amenities`.
- Not backfilling existing published properties' unit variants with private amenities — this is forward-only until a real brochure surfaces one worth recording (Godrej Altus's ground/1st-floor shops and typical-floor flats, once published, may be the first real candidate).

## Acceptance

An admin reviewing a submission can mark a specific unit type's own amenity as available/not-stated/explicitly-not-offered, distinct from the property's amenities; it publishes through the normal transaction; it shows on that unit type's dossier section; and it appears as its own row group in a comparison, matched by unit type on both sides.

## Completion record

Completed 2026-09-25 on `task/phase-3-completion`. See `PROGRESS.md` (2026-09-25) and `DECISIONS.md` (2026-09-25). Acceptance met: a unit type's own amenity is marked in review, published through the normal transaction, shown in that unit type's dossier section, and compared as its own row group matched by unit type. Open for the owner: unit-only catalog entries and brochure extraction.
