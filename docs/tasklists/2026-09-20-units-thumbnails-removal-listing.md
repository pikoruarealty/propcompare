# Tasklist — exact units, thumbnails, and removing, unlisting and deleting

**Status:** built and verified 2026-09-20
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `2026-09-20-owner-feedback-round-1.md`
**References:** `docs/schema/schema.v8.md`, `docs/api/api-spec.v1.md`, `DECISIONS.md` 2026-09-20 (three entries), project memory "units are exact"

_Written after the work, at the owner's direction to keep moving. The next slice starts with its tasklist first._

## What the owner asked

1. Kimana's room dimensions are metres, not feet. Units must never be wrong; everything is stored in square feet or feet, converted from what is printed; make it a permanent rule; check how it is implemented, fix it, correct Kimana, and make the extraction pipeline find the unit strictly. Also check that conversion happens once, so it cannot happen twice.
2. Finish real thumbnails for the gallery.
3. Allow removing amenities and unit types (soft is fine, everything goes through admin), and unlisting or deleting properties, softly.
4. A session handoff, with what to test, what is next, what is left in the current phase and which phase is next.

## Checklist

### 1. Units

- [x] Saved the "units are exact" rule to project memory.
- [x] Found the root cause: field names promised feet, the prompt never asked for a unit, nothing converted; `property.plot_area_sqft` asked the model to convert.
- [x] `src/lib/units/measurements.ts`: exact conversions, strict unit reading, never assumes a unit; 82 tests including Kimana's numbers.
- [x] Extraction returns what is printed plus its unit; one conversion boundary (`convertProviderDetails`); no printed unit means the value is left out and logged.
- [x] Converted exactly once, proved by tests (replay, re-validation, incompatible shapes).
- [x] Fixed: the extractor could never read `positive_number` fields (plot area was silently dropped).
- [x] Plausibility warning in the Rooms tab and unit-type summary.
- [x] Kimana corrected through an edit and publish (`src/db/correct-dimension-units.ts`, dry run by default, refuses a second run).

### 2. Thumbnails

- [x] `?size=thumb` on the media route, made on first use and stored beside the original; cards and the browse card use it; verified in a browser (88 KB instead of 1,551 KB for Kimana's nine cards).

### 3. Removal, unlisting, soft delete

- [x] Schema v8 (`listing_status`, `removed_at`) and three admin-only contract fields; never asked of extraction.
- [x] Publisher: removals and listing status for an existing property only; refuses a type both kept and removed; revives a removed type when it is listed again.
- [x] One shared visibility rule applied to every buyer read, including the private matcher path.
- [x] Editors send removals; the row shows "Removing when published"; published unit types can be removed.
- [x] Owner-only List, Unlist, Delete and Restore on a published submission; the queue says when a listing is hidden.
- [x] 13 visibility integration tests, 7 listing tests, route and component tests; real-browser check on a throwaway property.

## Not done

- True erasure of a deleted property (retention policy needed).
- A schema-level guard against a future buyer read forgetting the visibility rule (a view or row-level security would make it structural).
- Buyer-facing "unlisted" states for saved properties (they simply disappear).

## Completion record

Completed 2026-09-20. Verification: lint, typecheck, prettier and the full suite (100 files, 1233 tests) pass; real-browser checks of the listing controls, removals and thumbnails.
