# Tasklist — owner feedback after testing RERA fetch and edit (round 1)

**Status:** built and verified 2026-09-20 (follow-ups listed below)
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `2026-09-20-gujrera-regulator-sync.md`, `2026-09-20-edit-published-properties.md`
**References:** `docs/app-flows/admin.md`, `docs/app-flows/buyer.md`, `docs/api/api-spec.v1.md`, `docs/schema/schema.v7.md`, `docs/design/design-tokens.md`, `DECISIONS.md` 2026-09-20

## What the owner reported

1. The developer list shows Team 0 and Properties 0 for a developer that has a published property. What are those numbers?
2. The queue shows two "Kimana Towers" rows, and the second is labelled "Manual" although it was an edit. It should read as an edit, and one property should not be several rows.
3. RERA should fill more of the project details (possession status, towers, floors, plot area), and amenities should be checked, including on other projects such as Amaris.
4. Fields that keep their published value should show the value, with a small "unchanged" mark, not the sentence "Unchanged. Keeps what is published."
5. On the buyer property page, photos and floor plans are shown together and too large. Separate them into expandable sections, show small cards, and open a pop-up carousel on click.

## Answers and findings

1. **Meaning:** _Properties_ is the number of properties in our own database linked to that developer (not how many they have built); _Team_ is the number of developer accounts linked to the profile. **It was a bug**: both showed 0 for everyone, because Drizzle drops table names in a single-table select and the subquery compared its own columns. Fixed, with a regression test that fails without the fix.
2. The two rows are two submissions (the brochure that created the property, and the edit). The edit is bound to the property but nothing marked it as an edit.
3. Measured against GujRERA for Kimana Towers and Amaris (`DECISIONS.md`):
   - **Amenities:** RERA has **no amenities list**. The only amenity-like data is a swimming-pool flag with dimensions (Amaris: yes, 22.6 × 9 × 1.2 m; Kimana: blank). A blank flag means "not stated", never "not offered".
   - **Towers and floors:** RERA lists _blocks_ and _slabs_. Amaris has blocks A to D with 14 slabs each, which reads as 4 towers, but Kimana's two towers are one block named "A+B" with 24 slabs. Block counts are not tower counts and slabs are not storeys, so these are shown as information and **not written**.
   - **Plot area:** RERA gives the project's land area (7,628 sq m for Kimana). Our plot-area field is deliberately the brochure's plot area, independent of RERA's land area, so RERA's figure is shown for information and not written.
   - **Possession status:** RERA has no status field, but it has declared progress. A stated rule can derive it: progress below 100 is _under construction_; 100 is _ready to move_. "Nearing possession" is a judgement and is never derived.
   - Also available and shown as information: project description (Amaris: "4BHK and 5BHK (Penthouse)"), covered parking count, pincode, land area.

## Checklist

### 1. Developer counts

- [x] Fix the two subqueries; regression test with non-zero counts and a second developer.

### 2. Queue: one row per property, edits labelled

- [x] Mark a submission as an edit when it changes a property that already exists (bound at creation, or not the property's first publication).
- [x] Show one row per property (its newest live-track submission); rejected edits appear only under the Rejected filter; new drafts unchanged.
- [x] ~~Source column reads "Edit" for edits.~~ Superseded after owner feedback: an "Edit" label hid that the listing was live and replaced the data source. The queue now has a Change column (New listing / Update to a live listing), the data source beneath it, and "Current listing stays live" for a draft update.
- [x] On a submission, list the earlier versions of the same property, so the original brochure submission stays reachable.
- [x] Tests: queue read model (integration), page/component.

### 3. RERA record: more of what RERA knows

- [x] Record gains: declared amenities (only affirmative), land area, project description, blocks, covered parking, pincode.
- [x] Possession status derived by the stated rule, marked "derived from RERA progress".
- [x] Swimming pool proposed as an amenity when RERA flags it, merged into the current set, never removing anything.
- [x] Panel shows the extra facts as information, with land area in square feet as well as square metres.
- [x] Tests: adapter (Kimana and Amaris shapes), mapping, panel; real-browser check.

### 4. Show values, with an "unchanged" mark

- [x] Load published amenities, specifications, unit types and developer details as live values.
- [x] Rows show the value with a small "Unchanged" mark; "Add"/"Edit" start from the published value.
- [x] Tests: component and integration.

### 5. Buyer media: sections, small cards, pop-up carousel

- [x] Photos and floor plans in separate expandable sections; floor plans grouped by unit type.
- [x] Small cards; click opens a dialog carousel (keyboard: arrows, Escape), showing the credit.
- [x] No storage path in the page; images still through `/api/v1/media/{id}`.
- [x] Tests: component (sections, expand, carousel, credit); browser check on Kimana.

### Documentation and verification

- [x] `DECISIONS.md`, `PROGRESS.md`, API spec if a contract changes; lint, typecheck, prettier, full suite.

## Also built after further owner feedback the same day

- [x] Room dimensions are editable (rooms, balconies, foyer), in a Rooms tab per unit type.
- [x] The edit screen is tabs (RERA, Project, Developer, Amenities, Specifications, Unit types, Images), and the unit-types editor is tabs inside tabs.
- [x] Published unit types have fixed names and no Remove; new types can be added and removed.
- [x] Queue vocabulary: Change (New listing / Update to a live listing), data source line, and "Current listing stays live".

## Follow-ups (not done)

- Removing an amenity or a unit type from a live listing (needs an owner decision and a publisher change).
- Real thumbnails for the buyer gallery (cards load the full picture, lazily).
- Kimana's room dimensions look like metres stored as feet: check against the floor plans.
- The queue page itself has no automated test (its read model does); the real-browser check covered it.

## Completion record

Completed 2026-09-20. Verification: lint, typecheck, prettier, and the full suite (95 files, 1084 tests) pass; real-browser checks of the buyer gallery (`scripts/verify-dossier-gallery.mjs`, 14/14) and of the admin queue, versions, RERA re-fetch and unit-type editor on Kimana Towers.
