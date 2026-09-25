# Tasklist — Godrej fill-in, unit types' BHK and layout, terrace, map link order, promoter history

**Status:** done (2026-09-25).
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `docs/tasklists/2026-09-23-unit-variant-amenities.md`, `docs/tasklists/2026-09-24-rera-second-pass.md`, `docs/tasklists/2026-09-24-location-section.md`, `DECISIONS.md` (2026-09-23 "don't discard what was read"; 2026-09-24 "RERA data, second pass"; 2026-09-25 unit type amenities), `AGENTS.md` (controlled vocabularies, one live representation, units exact, publish transaction the only live writer).

The owner's asks, in chat 2026-09-25: add the terrace so a unit type that has one can show it; restore everything Claude read from the Godrej Altus brochure; fill BHK and layout; search-by-name map link first; read the promoter's history from RERA.

## Why the Godrej facts were not in the draft

The paid read ran at 14:29 IST on 2026-09-23 and schema v12 (the 20 specification fields, plus nearby-place and vastu facts) landed at 15:00. The model put what it read that had no field into `unmappedRawEvidence`, and nothing has ever promoted an unmapped item to a field that later became active. So 37 read facts (construction specifications, connectivity, vastu, clubhouse and courtyard area, plot number) sat in the saved answer and never reached review.

## Why BHK and layout were blank

The extraction prompt only lets the model set `bhkTypeKey` when a plan's own heading prints the configuration and forbids `layoutTypeKey` altogether (a rule from a paid run: never infer from a drawing). Nothing then read the unit type's printed name. Maruti 360's names print "4 BHK Duplex" and "5 BHK Penthouse", Godrej's print "3 BHK Premium", Kimana's "Penthouse", yet all are blank.

## Steps

1. [x] **BHK and layout from the printed name, in code.** A pure function reads a unit type's name: "N BHK"/"N BHLK" (1 to 4 to that key, 5 and above to `5bhk_plus`, "studio"), and the words penthouse, duplex, simplex for layout. It only ever fills a key the model left out and only from words the name prints; it never counts rooms. Used at OCR persistence (so every future brochure) and by step 3.
2. [x] **Promote unmapped facts to fields that are now active** at OCR persistence: an unmapped item whose field key is an active field and whose value fits the field's type becomes a candidate (needs review, evidence kept), never overwriting a field the model did fill. The Godrej draft gets the missing ones added without touching what the owner has already reviewed.
3. [x] **Existing unit types.** BHK and layout from the name for Maruti 360 and Kimana Towers, and the Godrej draft's unit types, as reviewable edits (never a direct write to a live table).
4. [x] **Terrace** in the amenity catalog (seed); Maruti 360's two penthouses record a private swimming pool and a private terrace as unit type amenities, as an edit submission for review.
5. [x] **Map link order.** The proposed map link is a search by the project's name, locality and city first; the coordinates link from RERA's boundary is offered as the alternative when that search is not right.
6. [x] **Promoter history.** The RERA adapter follows the summary's `promoterId` to `/user_reg/promoter/promoter{id}` and keeps only the group's years of experience in Gujarat, completed and ongoing project counts (RERA prints them "by Group Entity"); shown in the comparison and the dossier's RERA section. No contact details, PAN, address or e-mail.
7. [x] Tests, docs (`DECISIONS.md`, `PROGRESS.md`), verification.

## Not doing

- Not touching what the owner has already confirmed in the Godrej draft, except adding BHK to its unit types (returned to needs review).
- Not reading the promoter's areas constructed (RERA reports an area for "completed projects" even where the completed count is 0, so it is not trustworthy enough to show).
- Not making a paid provider call.
