# Tasklist: close the field-contract gap (pincode, launch date, RERA land area, RERA registered)

**Status:** in progress, written before the code (this file follows the code slightly since the gap and its fix were both found and approved in the same session; see `PROGRESS.md`).
**Owner:** Bhavarth (approved via AskUserQuestion, 2026-09-22, after being surfaced per `AGENTS.md`: this changes publish logic)
**References:** `AGENTS.md`, `docs/tasklists/2026-09-22-comparison-review-fixes.md` (where the gap was found), `docs/schema/schema.v9.md`, `DECISIONS.md`

## What was found

`properties.pincode`, `properties.launch_date` and `properties.rera_project_land_area_sqft` are real, already-existing nullable columns (added in an earlier schema pass) that the buyer read layer already exposes — but no `property_schema_fields` contract row named them, so `publishSubmission` silently drops any value proposed for them (`activeFieldKeys.has(field.fieldKey)` is false) no matter the source: OCR, RERA fetch, or a hand entry. Separately, `properties.rera_registered` is a real column, defaulted `false`, that nothing in the codebase has ever set `true` — a property with a confirmed registration number still reads as unregistered.

## Non-goals

- No `ALTER TABLE`, no new migration, no new `schema.v10.md` — the columns already exist; this activates them through the existing write pipeline. Schema v10 is reserved for the separate, still-pending unit-level-amenities change.
- No change to `property.plot_area_sqft` (the brochure's own plot area) or to the rule that it is never conflated with RERA's registered land area.

## Design decisions

- **`property.pincode`**: dual-sourced like `possession_date`/`total_units` — OCR may extract it from the brochure's address, and RERA's record (already read, `RegulatorRecord.pincode`) is authoritative when fetched. New `"pincode"` validator data type: exactly six digits.
- **`property.launch_date`**: OCR-only (reuses the existing `"date"` data type) — RERA has no launch-date field.
- **`property.rera_project_land_area_sqft`**: RERA-fetch-only. Deliberately never asked of the OCR extraction model (`RERA_ONLY_FIELD_KEYS` in `src/lib/submissions/edit-only-fields.ts`, applied in `src/lib/ocr/ingestion.ts`'s active-field query) because it is specifically RERA's _registered_ land figure, kept independent of the brochure's own plot area per the 2026-09-20 decision; letting a brochure value land in a RERA-named field would misrepresent its source.
- **`rera_registered`**: derived, not a separate contract field. `publishSubmission` sets it `true` whenever `property.rera_registration_number` is present in a submission's payload (new property or edit) — the number **is** the fact; there is no "unregister" flow.
- Existing published properties (Kimana, Amaris, Maruti 360) do not retroactively gain these values just from the code change — they need a normal edit through the existing RERA fetch/"Use RERA values" flow (pincode, land area, `rera_registered`) to actually get filled in, published through the ordinary review/publish path, never a direct write.

## Checklist

- [x] `src/db/seed.ts`: three new `property_schema_fields` rows (`property.pincode`, `property.launch_date`, `property.rera_project_land_area_sqft`), tagged `schemaVersion: "v9"`.
- [x] `bun run db:seed` re-run against the local database so the rows exist (idempotent upsert; this table is outside AGENTS.md's live-catalog-table restriction).
- [x] `src/lib/submissions/validation.ts`: new `"pincode"` data type (six digits).
- [x] `src/lib/submissions/edit-only-fields.ts`: new `RERA_ONLY_FIELD_KEYS`; `src/lib/ocr/ingestion.ts` excludes it from what the extraction model is asked, alongside `EDIT_ONLY_FIELD_KEYS`.
- [x] `src/lib/submissions/publisher.ts`: reads and writes `pincode`, `launchDate`, `reraProjectLandAreaSqft` on both the new-property insert and the existing-property update paths; derives `reraRegistered` from the presence of `reraRegistrationNumber` on both paths.
- [x] `src/lib/rera/mapping.ts`: `property.pincode` and `property.rera_project_land_area_sqft` added to `RERA_AUTHORITATIVE_FIELDS` (land area converted from RERA's square metres with `areaToSqft`, the one canonical converter — never a second conversion constant); docstring updated.
- [x] `src/components/admin/submission/rera-panel.tsx`: removed pincode and land area from the "for reference, not written" `ReraExtras` block, since they now appear as ordinary writable rows in the main comparison table.
- [x] Tests updated for the two new rows appearing in `compareWithRecord`/`writableItems` order (`src/lib/rera/mapping.test.ts`, `src/lib/rera/submission-fetch.integration.test.ts`).
- [x] `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (129 files, 1542 tests, integration tests included) all green.
- [x] **Found and fixed on the way:** `postgres` (the driver) and Drizzle's `jsonb()` column double-parse, silently turning a numeric-looking JSON string (a PIN code) into a number. `src/db/jsonb-types.ts` stops the driver's own `jsonb` auto-parse so Drizzle's is the only one; applied to `src/db/index.ts`, `src/db/service.ts`, `src/db/seed-private.ts`. Verified with a raw-driver probe bypassing Drizzle, and the full suite stayed green before and after (see `DECISIONS.md`).
- [x] `src/lib/submissions/publisher.ts`: an edit that does not touch the registration number still backfills `rera_registered` when the property already carries a number and was never marked registered, so existing properties self-heal on their next edit.
- [x] Re-apply RERA to Kimana, Amaris and Maruti 360 through the normal edit + "Use RERA values" + submit + publish flow. Verified in the database and in the real comparison page: all three now read `rera_registered = true` and carry RERA's project land area; Amaris also gained its pincode (Kimana's and Maruti 360's RERA records state none, an honest gap). Launch date stays "not stated" on all three (RERA does not report it; no brochure has been re-run).
- [x] `DECISIONS.md` entry.
- [x] `PROGRESS.md` updated.

## Acceptance

A submission (OCR, RERA fetch, or hand entry) can now propose `property.pincode`, `property.launch_date`, and `property.rera_project_land_area_sqft`, and publishing writes them; a confirmed RERA registration number always publishes `rera_registered = true`. Verified on the three live properties after a re-applied RERA fetch, in both the database and the real comparison page.
