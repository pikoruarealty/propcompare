# Tasklist — RERA carpet area per unit type, and the rooms-versus-RERA cross-check

**Status:** built and verified 2026-09-20 (owner said yes); ready for review
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `2026-09-20-zoom-and-carpet-area.md` (section 3), `2026-09-20-gujrera-regulator-sync.md`
**References:** `docs/schema/schema.v8.md` (`unit_areas`), `src/lib/units/measurements.ts`, `DECISIONS.md` 2026-09-20 (carpet area is not calculated from room sizes; prices in regulator responses never enter our database; units are exact)

## What the owner asked

Take carpet area per flat from RERA, group it into unit types, and offer it as the carpet-area value for the admin to confirm; and show an admin-only "rooms add up to X sq ft; RERA says Y" cross-check that is never stored.

## What GujRERA exposes (checked live, 2026-09-20)

- `POST /formthree/public/get-inv-details-for-view` with `{ blockName, formThreeId }` returns one row per flat. `blockName` is the registration's block name as form-one prints it (Kimana: `A+B`, not `A` or `B`); an unknown name returns an empty list, not an error.
- Each row carries `flatNo` (`A-301`), `carpetArea` (a number, **square metres**: 369.54 is 3,978 sq ft), `usage`, `status`, and also **prices, received and balance amounts, the buyer's name, a mobile number and KYC ids**. Only `flatNo`, `carpetArea` and `usage` are ever read.
- Kimana: 76 flats, four carpet areas: A 369.54 (36 flats, A-301 to A-2002), A 572.59 (2), B 277.26 (36), B 463.24 (2).

## Design

- **Record:** the adapter groups flats by (block letter from the flat number, carpet area in square metres) and keeps only `{ block, carpetAreaSqm, flatCount, firstFlat, lastFlat }`. Per-flat rows are not stored. A flat number is public, not personal data. If the list cannot be read, that is a recorded gap, never "no carpet areas". Non-residential usage is dropped.
- **Units:** the group keeps square metres; the one conversion to square feet is `areaToSqft(value, "sqm")` in `src/lib/units/measurements.ts`, rounded to two decimals, at the point of proposing. Nothing is converted twice.
- **Matching a group to a unit type** (`src/lib/rera/carpet-area.ts`, pure): the candidate groups are those of the block named in the type's name ("Block A", "Tower B", "Wing C"); with no such word, all groups. One candidate: take it. Several: the one nearest a reference figure, which is the type's own carpet area if it has one, else the sum of its room sizes; with no reference, nothing is proposed. A nearest group more than 40% away is not proposed. A nearest-match is labelled as such so the admin checks it. The reference only chooses _which_ exact RERA figure to offer; no area is ever derived from room sizes.
- **Proposal:** a comparison item "Carpet area by unit type" whose proposed value is the full unit-type list with the carpet basis set (the publisher upserts each type by name and each area by basis, so nothing else moves). It is written by the same "Use RERA values" action and by the scheduled refresh as `needs_review`. Types RERA cannot be matched to are left untouched.
- **Cross-check (admin only, computed, never stored):** per unit type, "rooms add up to X sq ft; RERA says Y (±n%)", flagged when the gap exceeds 30%. Rooms only (not balconies or foyer), the sum used in the 2026-09-20 finding. A wrong unit gives a gap of about 90% and is caught at once; ordinary extraction noise (−15% to +18% on Kimana) is shown without a flag.

## Non-goals

- No area is calculated from room sizes and stored.
- No super built-up or built-up figures (RERA's per-flat list has carpet area and the exclusive balcony area only; balcony has no basis in our schema).
- No prices, statuses, names or mobile numbers, ever.
- No change to the publish transaction.

## Checklist

### Implementation

- [x] `RegulatorRecord.carpetGroups`; adapter reads the flat list per block, groups it, records a gap on failure (`gujrera.ts`, `types.ts`, `submission-fetch.ts` defaults).
- [x] `src/lib/rera/carpet-area.ts`: grouping, matching, proposal, cross-check.
- [x] `compareWithRecord` returns the unit-type item; `writableItems` and the apply action carry it; the scheduled refresh proposes it.
- [x] RERA panel: the unit-type table with "we hold", "RERA says", match note, and the rooms cross-check.

### Tests

- [x] Adapter: the saved Kimana list groups to four; a poisoned fixture (names, mobile numbers, prices) never reaches a record, a job or the panel; a failed or empty list is a gap.
- [x] Matching: Kimana's six real unit types and room totals map to the right four groups; block words; single candidate; no reference; the 40% limit; case and punctuation.
- [x] Units: 369.54 sq m converts to 3,977.71 sq ft once.
- [x] Integration on real Postgres: apply writes `unit_variants` with the carpet basis, keeps rooms and other areas, publishes through the normal path and changes only the carpet area.
- [x] Panel component: rows, match note, cross-check flagged and unflagged.
- [x] Live GujRERA and Kimana's real unit types (read only) and the admin RERA panel in a real browser: the four figures and six matches are shown and applied to a throwaway edit draft, which was then deleted; the live listing is unchanged (no unit areas written).
- [x] Found and fixed while testing: a record fetched before this change said "RERA lists no carpet areas" when it had never asked, and now says the flat list was not read; `loadLiveValues` listed removed unit types (fixed, tested).

### Documentation

- [x] `DECISIONS.md`, `PROGRESS.md`, `docs/app-flows/admin.md`, the sibling tasklist, `docs/production-readiness.md` (terms review outcome).

## Acceptance

On Kimana, "Fetch again" shows four RERA carpet areas and proposes 3,978 / 3,978 / 6,163 / 2,984 / 2,984 / 4,986 sq ft for its six unit types with the nearest-match note where a block has two areas; "Use RERA values" writes them; the rooms cross-check reads each type against RERA; nothing goes live until reviewed and published; no price, name or phone number is stored anywhere.

## Completion record

Built 2026-09-20 on `task/phase-2a-completion`. Follow-ups: Amaris live (its registration number is not in the repo; each listed block is asked for, tested with a stand-in); property type and land area stay unmapped.
