# Tasklist: fixes from the owner's comparison review

**Status:** done 2026-09-22 (reconciled 2026-09-25: every checklist box is ticked, and `docs/roadmap.md` records all seven findings fixed or resolved). Written before the code.
**Owner:** Bhavarth
**References:** `AGENTS.md`, `docs/design/comparison.v1.md`, `docs/schema/schema.v9.md`, `PROGRESS.md` (2026-09-21 late night entry, "Comparison review findings and approvals"), `DECISIONS.md`

## Source

The owner reviewed the comparison on the three live properties (Maruti 360, Amaris, Kimana) and raised seven findings, recorded in `PROGRESS.md`. This tasklist covers the seven and the field-contract gap found alongside them.

## Non-goals

- No schema change, no publish-transaction change. Where a finding turned out to need one (item 2 in `PROGRESS.md`: land area, pincode and launch date have no contract keys to be written from a submission), it is surfaced for the owner's review, not built here.
- No paid run as part of this tasklist.

## Checklist

- [x] **1. Derive related facts from each other in the comparison.** Possession status: when nobody confirmed one but RERA's declared progress is on record, apply the same rule the admin RERA panel already states (progress under 100 is under construction, 100 is ready to move) — `displayPossessionStatus` in `src/lib/compare/model.ts`, scoped to the comparison table (not the dossier, browse or landing, which is a separate decision if wanted later). Registration: a property with a registration number on record reads as registered even when the `rera_registered` flag was never separately confirmed — `displayReraRegistered`, used for both the trust-group row and the column header's Verified badge.
- [x] **2. Maruti 360's missing construction progress: investigated, not a bug.** Its RERA fetch job's `fetched_payload` (`rera_fetch_jobs` id `07917840…`, linked via `submission_id` to the live property, read correctly by `latestRegulatorCheck`) carries `"gaps": ["construction progress"]` and `"constructionProgressPercent": null` — GujRERA's own page states no numeric progress for this project's latest filing (status "SUBMITTED", no percentage given). The panel's "RERA silent" was already correct. Amaris's 0% is also confirmed as what RERA states.
- [x] **3. Floor plans not tied to a unit type are shown instead of "Not stated".** `floorPlansFor` in `src/lib/compare/model.ts` falls back to plans published with no `unitVariantId` when none are tied to the compared type. **Found while checking Maruti 360 specifically: it has zero floor-plan media published at all** (2 photos only) — pages 20 to 29 of its brochure were routed and confirmed as floor plans during extraction (`ocr_extraction_jobs` routing manifest) but nobody ran "Use as image" to turn them into published pictures. This is an admin content step, not a code fix, and matching ten plan pages to Maruti 360's unit types needs a person's judgement — flagged for the owner rather than guessed.
- [x] **4. The bottom compare tray no longer shows on `/compare`.** `CompareTray` reads `usePathname()` and renders nothing there; the page already shows the same properties.
- [x] **5. Rooms: one per line, with area beside the dimensions.** `formatRoomDimension` (`src/lib/properties/dossier.ts`) now appends the room's own printed area if the brochure stated one, else the sides multiplied together, rounded, and labelled "calculated from the sides" — a narrow, room-only reversal of "an area basis is never derived from another" (carpet/built-up/super built-up remain untouched). `roomsText` in the compare model joins rooms with a newline instead of "; "; the screen renders it with `white-space: pre-line`. Recorded in `DECISIONS.md`.
- [x] **6. Audit: what the comparison table omitted that the record holds.** `total_floors` was a genuine gap — the field is written by the publisher (`property.total_floors`) but was never selected in `getPublishedPropertyBySlug` or exposed on `PropertyDossier`; now wired through (`types.ts`, `queries.ts`) and shown as a "Floors" row. Added rows for locality, city, pincode (project group), RERA land area and RERA carpet-area range (trust group). Added an "Other rooms" row for dress/store/puja/servant/duct-type rooms that `roomKind` deliberately never guesses into a kind, so they are shown (named as printed) instead of silently dropped. Launch date and per-type unit counts were already rows; not a gap.
- [x] **7. Removed the "N differs" / "N facts" count from section headers.** The visible heading is just the title and a chevron; the button keeps a distinct accessible name (`aria-label="… section"`) so it stays distinguishable from the focus chip of the same name. `docs/design/comparison.v1.md` updated to match.

## Not done here, flagged for the owner (`PROGRESS.md` item 2)

- `property.rera_project_land_area_sqft`, `property.pincode`, `property.launch_date` (and deriving `rera_registered` at publish time) have no `property_schema_fields` keys, so they can never be filled from a submission for a real property — only through the admin's own manual entry, if that exists for these fields. Adding them changes publish logic and needs the owner's review before it is built.
- Maruti 360's floor plans (finding 3): an admin needs to run "Use as image" on brochure pages 20 to 29 and assign each to its unit type.

## Verification

- [x] `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (129 files, 1542 tests) all green.
- [x] Real-browser check of `/compare` on the three live properties (Maruti 360, Amaris, Kimana): possession now reads "Under construction" on all three including Kimana (was blank), registration reads "Registered" on all three (was blank), the tray is absent on `/compare`, rooms render one per line with an area beside each, the new Floors/Locality/City rows show real values, land area/pincode/carpet-range rows are wired but correctly stay hidden (nobody has that data yet), "Other rooms" lists dress/store/duct/servant rooms by their printed names, section headers show only the title, and Maruti 360's floor plan row correctly says "Not stated" (it has none published) while Kimana's and Amaris's show their pictures. No page or console errors.
- [x] `PROGRESS.md` updated with this round's findings and fixes.
