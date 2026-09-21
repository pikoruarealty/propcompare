# Tasklist: page-review UX, lighter categorization, and amenities that sit on other pages

**Status:** built and verified 2026-09-21 except the items marked open. Written before the code this time.
**Owner:** Bhavarth
**References:** `AGENTS.md` (no price shown; missing data stays "not stated"), `docs/api/api-spec.v1.md` (Admin API; `GET /api/v1/admin/ocr-jobs/{id}` was "Planned"), `docs/ocr-routing-contract.v2.md`, `docs/tasklists/2026-09-20-confirm-pages-and-queue.md`, `docs/tasklists/2026-09-21-router-timeout-thumbnails-ledger.md`, `docs/design/no-vibecoded-tells.v1.md` (admin follows the same restraint where it applies), memory rules "harden before paid runs" and "confirm before paid runs"

## Owner's findings (2026-09-21, first paid run on the 360 brochure)

1. The page-review screen polls by refreshing the whole page every 4 seconds. Each refresh signs a new link to the 62 MB brochure, the viewer treats that as a new document and downloads it again, and thumbnails never finish loading. The owner's PC froze.
2. Progress is hard to notice; it should be a spinner or skeleton, not a line of text.
3. Wording: "Queue Claude extraction" and "Claude is reading the confirmed pages" are not good UX.
4. The "Use as image" form (inline in a narrow card) crowds: Cancel overlaps, and "Added to the images. Review it" wraps badly.
5. The RERA comparison table is broken: status tags wrap onto two lines and their borders double up.
6. Categorization uploads 13 to 19 MB single pages and stalls; reduce the size but keep text readable.
7. The 360 brochure lists many amenities, but only "gymnasium" was extracted.

## Diagnosis of 7 (from the saved answer and the pages)

The extraction read exactly what it was given. The confirmed routing sent only page 12 to the amenities step, so it found the gymnasium sentence there. The brochure's other amenity spreads (pages 11, 13, 14, 15, 17: pool and spa, gym, observatory lounge, private dining) were ignored, and page 19, the typical site plan with the amenities printed as labels (children's play area, clubhouse, event lawn, multipurpose court), was routed to project details, whose step only extracts project facts. So the amenities on it were never read.

## Non-goals

- No change to which fields exist or to the publish transaction. No price anywhere.
- Not re-running any paid step without the owner's go-ahead.

## Checklist

### Polling and the viewer (the freeze)

- [x] The viewer opens the brochure once: a changed signed link no longer restarts it (checked in Chrome on the 62 MB brochure: 2 requests for the file, none repeated).
- [x] The status panel polls a small JSON endpoint (`GET /api/v1/admin/ocr-jobs/{id}`, admin only) every 5 seconds, pauses while the tab is hidden, and refreshes the page only when the status changes.
- [x] A clear busy state (spinner, moving bar, plain sentence) while waiting or reading, and a spinner panel while categorizing.
- [x] Tests: the endpoint (auth, malformed id, shape), the status panel (polls, refreshes only on change, stops when done), the viewer (link change does not reopen).

### Wording

- [x] Replace "Queue Claude extraction", "Claude is reading" and related text with plain steps: confirm the page choices, then read the pages.

### Layout

- [x] "Use as image" opens in a roomy dialog instead of expanding in the card; the card shows a short "Added · Review" line.
- [x] RERA comparison table: status tags stay on one line in their own column; no doubled borders.
- [x] Thumbnails: limit how many pages render at once (2), and the frame takes the page's own shape so a heavy brochure does not exhaust memory ("This page could not be shown").

### Lighter categorization

- [x] The router sends a lighter copy of the brochure: every page drawn to one JPEG (longest side 1600 px) and packed into a new PDF. Measured free on the 360 brochure: 59.2 MB to 2.6 MB in about 30 s, one 3.5 MB request instead of nine of up to 19 MB; the site-plan labels on page 19 are crisp. Unit-tested on a synthetic heavy page. **Open:** the paid run comparing categories against the owner's confirmed ones has not been made (needs the owner's go-ahead).

### Amenities on other pages

- [x] The amenities step also reads the pages routed to project details (overview and site-plan pages often list amenities), so nothing is lost by the single-category choice.
- [x] Tell the owner which 360 pages to add and how to re-run only the amenities step (the worker reuses saved answers for scopes whose pages did not change).

### Documentation

- [x] `docs/api/api-spec.v1.md`, `DECISIONS.md`, `PROGRESS.md`, this tasklist.

### Found afterwards (owner, same day): private pools on penthouses

The schema has `unit_variants.layout_type_id` (penthouse, duplex) and per-room dimensions, but **amenities exist only at property level** (`property_amenities`). A penthouse type's own swimming pool cannot be recorded on that unit type, and putting it on the property would say every home has one. **Proposal, awaiting the owner's approval (schema v10, additive):** a `unit_variant_amenities` table (variant, catalog amenity, status) reusing the existing amenity catalog and its `available / not_stated / explicitly_not_offered` statuses, written only by the publish transaction; a unit-type amenities field in the extraction; a "Private amenities" row in the dossier's unit type and in the comparison (penthouse against penthouse). Also open: Kimana's penthouse types show layout "Not stated" because the extraction never maps a layout type.

## Acceptance

Watching a run does not slow the browser or reload the brochure; the state of the run is obvious at a glance; the screens read in plain words and do not crowd; categorization requests are small; and an amenity on a project-details page is read.

## Completion record

_(fill in at completion)_
