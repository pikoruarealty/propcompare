# Progress

## 2026-09-25 (7) - Units per floor and towers read from RERA, prices per unit type with RERA as the fallback, prices in the Units tab

**Done (`DECISIONS.md` 2026-09-25 "Units per floor and towers are read from RERA..."):** (1) **Units per floor** counted per tower from GujRERA's flat numbers (kept in the RERA snapshot), else from a floor plan that is a whole floor, else not stated; no division anywhere. (2) **Towers** from RERA's block names, proposed as `property.total_towers` on each RERA check. (3) **Prices:** typed first, and each unpriced unit type falls back to RERA's project range; the inputs are in the Unit types tab and work on a published property, applying at once. (4) The rate-limit item for the events endpoint was added to `docs/production-readiness.md`, beside the purge schedule and privacy-policy notes already there.

**Verified:** typecheck, lint, format check, targeted suites (components, comparison, properties, RERA, pricing, matching, analytics, buyer, units and submissions: 118 files, 1562 tests; the full suite was not run because the OCR worker was up), and the real adapter against GujRERA for Anamika (5 towers, 4 a floor on 29 floors) and Kimana (2 towers, 2 a floor on 19), plus a one-off count for Amaris and Maruti 360 (4 and 2). No live property shows these yet: they arrive with the next RERA check applied from the RERA panel. Not looked at in a browser.

## 2026-09-25 (6) - Less is open to a signed-out visitor; the dossier puts Location before RERA

**Done (`DECISIONS.md` 2026-09-25 "A signed-out visitor sees less"):** the comparison's differences-first summary is withheld by the server and drawn as placeholder lines with a sign-in link; the dossier is open only down to the unit types' names (specifications, location detail, the RERA record beyond the registration badge, and developer detail are now withheld by `lockDossier` and drawn as named placeholders); the dossier's sections run Specifications, Location, RERA; `AGENTS.md`, the comparison design and the API spec state the new rule.

**Verified:** typecheck, lint, format check and the targeted suites (components, comparison, properties, analytics and RERA: 84 files, 1108 tests; the full suite was not run because the OCR worker was up), including tests that the locked comparison carries no summary line even when the model has one, that the locked dossier carries none of the withheld values, and that the page draws the placeholders in the new order. Not looked at in a browser.

## 2026-09-25 (5) - First-party analytics and the admin Analytics screen (comparison slice 4, schema v20)

**Done (`docs/tasklists/2026-09-25-comparison-analytics-slice-4.md`, `DECISIONS.md` 2026-09-25 "First-party analytics built", `docs/schema/schema.v20.md`):** the owner answered the four taxonomy questions and widened the brief. (1) **Schema v20 (migration `0024`):** `analytics_events` (app role select, insert and the retention delete; update revoked) and two monthly rollups (upsert, delete revoked). (2) **`POST /api/v1/events`:** random visitor and visit cookies, per-event field checks, slugs resolved to listed properties, crawlers and GPC/DNT refused, always 204. (3) **Emit points:** dossier view and visible time, add to and drop from compare (tray and table), comparison opened, sections opened, unit-type switches, focus chips, share, save comparison, save property, dossier unlock, enquiry (with the compared set), intake completed (band of the stated ceiling, priorities, bedrooms, city), and visible time on the comparison. (4) **`/admin/analytics`**, in the admin nav: live overview, daily trend, funnel, sign-in gate, most compared pairs with their time and which side got the enquiries, per-property table with its most frequent rival, comparison depth, sources, budget bands, devices and intake. (5) **Retention:** `bun run analytics:purge` rolls months past 13 into counts and deletes the raw rows. (6) **Isolation test:** only the admin console, the recorder and the retention job read the data.

**Verified:** typecheck, lint, format check, the full suite (172 files, 2015 tests, run with no OCR worker up), and real-database tests for recording, cookies, refusals, every dashboard figure on a known set of events, and retention. Migration applied locally. Not looked at in a browser.

**Not done:** the daily schedule for the purge (production-readiness item), rate limiting on the events endpoint, a developer-facing view (Phase 4), and the privacy policy text that must name all of this (listed in `docs/production-readiness.md`).

## 2026-09-25 (4) - Enquiries go to the admin first and can be forwarded or closed; units per floor is the whole floor's; the price categorization was checked

**Done (`docs/tasklists/2026-09-25-phase-3-close-enquiries-units-per-floor.md`, `DECISIONS.md` 2026-09-25 "Enquiries reach the admin first...", `docs/schema/schema.v19.md`):** (1) **Enquiry flow (schema v19, migration `0023`).** New `forwarded` status and `enquiries.forwarded_at`; the admin inbox offers "Forward to {developer}", "Mark contacted" and "Close" (all reversible) and shows when it was forwarded. The buyer is only handed `new`. The developer's view is not built (portal on hold; what they may see of the buyer is the owner's privacy call). (2) **Units per floor:** a project row "Units per floor (calculated)" (units divided by towers and floors, "about", not stated when any input is missing) and a dossier fact; the per-unit-type row is relabelled "This unit type's units per floor". (3) **Price categorization:** the matcher tests (102) pass and the matcher and buckets were run on the live data (see the decision): works as designed, but no unit has a typed price yet, so no unit is in a bucket and matching is as coarse as RERA's project ranges; Maruti 360 has no range and never matches. (4) **Tasklists reconciled:** four that said "in progress" with every box ticked are now done (2a submission flow, submission media, comparison review fixes, field-contract gap); the rest have real open items and were left.

**Verified:** typecheck, lint, format check, the full suite (167 files, 1993 tests, run with no OCR worker up), migration `0023` applied to the local database, and the matcher run on the live data. Not looked at in a browser.

**Not done:** comparison analytics (slice 4), which needs the owner's answers on identity, retention, consent and what counts as a choice; the landing page's richer content (needs the owner's scope); the developer's view of forwarded enquiries (Phase 4).

## 2026-09-25 (3) - Godrej Altus filled from the saved read, BHK and layout read from names, terrace added, map link and promoter history changed

**Done (`docs/tasklists/2026-09-25-godrej-fill-terrace-maps-promoter.md`, `DECISIONS.md` 2026-09-25 "Godrej Altus filled..."):** (1) **Unmapped facts promoted** at OCR persistence to specifications that are active now (`unmapped-promotion.ts`), free and general; applied additively to the owner's Godrej draft: 19 new needs-review fields with their pages (13 construction specifications, connectivity, hospitals, schools, vastu, clubhouse and courtyard area), the 26 already-reviewed fields untouched. `clubhouse_area` added as a synonym. (2) **BHK and layout from the unit type's printed name** (`type-from-name.ts`), at OCR assembly; the Godrej draft's 13 unit types got their BHK (back to needs review); draft edits created for Maruti 360 (six unit types) and Kimana Towers (two penthouses' layout), each proven by a dry-run publish that rolled back, live tables unchanged. (3) **Terrace** added to the amenity catalog; Maruti 360's two penthouses carry a swimming pool and a terrace in that draft edit. (4) **Map link:** the name search leads, RERA's boundary pin stays as RERA's value. (5) **Promoter group history** (years in Gujarat, projects completed and ongoing) read from `/user_reg/promoter/promoter{id}`, kept in the RERA snapshot (no migration), shown as comparison rows and dossier lines. Contact details, PAN, address and built areas are never read.

**Verified:** typecheck, lint, format check, the full suite (165 files, 1978 tests, run with no OCR worker up), including real-database tests that promotion lands through the persistence step and that every key the name reader can return exists in the real vocabularies; and the real adapter run once against RERA's live record for Anamika (no gaps; promoter Constera: 11 years in Gujarat, 0 completed, 1 ongoing; snapshot valid; no contact detail, PAN or address in the record). Not looked at in a browser.

**Not done:** nothing is published: the Godrej draft, the Maruti 360 and Kimana Towers edits all wait for the owner's review. Anamika's snapshot has no promoter history until its RERA check is next applied. The masterplan legends from the Godrej read (facility names) are not mapped anywhere.

## 2026-09-25 (2) - The deleted Godrej Altus flipchart extraction restored for free, and two more specifications retired

**Done:** (1) **Godrej Altus restored (no provider call).** The submission was deleted outright, which cascades to its fields, evidence and job and removes its stored files, but the paid run's raw answers are kept on disk in `.local/ocr-checkpoints/`. The finished checkpoint (`582fc1d5-...`, 37-page flipchart, all four scopes answered) was used: the PDF was re-stored through `createBrochureSubmission`, and the saved answers were replayed through the current pipeline with an adapter whose network layer throws (zero requests made), into a new draft submission for Godrej Properties Limited (`518e04b4-ce4e-4034-9b3a-539b220eed43`): 15 fields including all 14 amenities, and 13 unit types, all `needs_review`. No usage event was recorded. The original checkpoint file was not written. (2) **Retired `lifts_per_tower` and `parking_levels`** (`docs/tasklists/2026-09-25-retire-lifts-and-parking-specs.md`, `DECISIONS.md` 2026-09-25): migration `0022` and the seed switch the contract fields off, the dossier and `loadLiveValues` no longer read out a retired specification, and a retired field's `needs_review` candidate no longer blocks a publish.

**Found:** the earlier record said 36 fields for the Godrej submission; the saved answers give 15 through the current pipeline. The saved answer's 37 "unmapped" items (vastu, nearby hospitals and schools, clubhouse and courtyard area, plot number, and 13 construction specifications) were left unmapped because the run predates schema v12 (that run 14:29, the v12 commit 15:00, 2026-09-23); nothing promotes an unmapped item to a field that later became active, so they are not in the submission. Many rooms in the floor-plan answer carry a name but no measurement and are left out on ingestion (that is what the model returned, not a mapping loss). Maruti 360's saved floor-plan answer shows both penthouses have a swimming pool and a terrace on the upper floor plan; live, only the 4 BHK Penthouse has them (as rooms), and the 5 BHK Penthouse lost them because the model gave them no measurement.

**Verified:** typecheck, lint, format check and the full suite (161 files, 1953 tests, run with no OCR worker up), including real-database tests that a retired field's candidate does not block a publish, a live field's still does, and a stored retired value is kept but not read out to the dossier or an edit; the restored submission was checked in the database (15 fields, 13 unit types, no usage event).

**Not done:** mapping the saved unmapped Godrej items to the v12 specification fields (a small free step, awaiting a go-ahead); recording the Maruti penthouses' pool and terrace as unit-type amenities (needs a "terrace" catalog entry, an owner decision); Anamika's RERA snapshot (an admin step in the RERA panel). Migration applied to the local database; not pushed.

## 2026-09-25 - A unit type's own amenities can be recorded, published, shown in the dossier and compared

**Done (`docs/tasklists/2026-09-23-unit-variant-amenities.md`, `DECISIONS.md` "unit type's own amenities"):** (1) **Payload.** Each entry of the `unit_variants` value takes an optional `amenities` list of `{ key, status }` (catalog key, `available` or `explicitly_not_offered`); validation checks the catalog, refuses a repeat, `not_stated` and a non-list. No schema change: `unit_variant_amenities` is v11's table. (2) **Publish.** The publish transaction writes it: a list is the whole set for that unit type (what it leaves out is deleted, an empty list clears), and a unit type carrying no list is left alone. (3) **Review.** The unit-types editor has an Amenities tab per unit type; the review view lists them; `loadLiveValues` reports a unit type's live amenities so an edit starts from them, and the form round trip keeps a list it did not open. (4) **Buyers.** `GET /api/v1/properties/{slug}` returns `amenities` on each unit variant (stated rows only; `api-spec.v1.md` updated); the dossier has a "Private amenities" row in each unit type's section ("Not stated" when none) and a placeholder bar when locked; the comparison has a "Private amenities of the unit type" group after "Room by room", read from each side's chosen unit type, with the Amenities focus chip. A row nobody states is not shown, as elsewhere. The sign-in lock withholds the values (empty list; row names only in the comparison).

**Verified:** typecheck, lint, format check, and the full suite (161 files, 1950 tests, run with no OCR worker up), including new real-database tests for the publish write, the whole-set replacement, an edit with no list leaving them alone, an unknown amenity being refused, and the live-values and dossier read-back.

**Not done:** reading a unit type's amenities from brochures (needs the paid extraction prompts changed; awaits the owner). The catalog has no unit-only entries (private terrace, private pool), which is a vocabulary decision left to the owner. Not looked at in a browser. Committed on `task/phase-3-completion`, not pushed.

## 2026-09-24 (RERA clean-up) - Dead columns dropped, two specifications retired, promoter recorded from RERA, amenity flags read with the brochure primary (schema v18)

**Done (`DECISIONS.md` "RERA clean-up", `docs/schema/schema.v18.md`):** (1) **Columns.** `rera_last_verified_at` and the two carpet-area-range columns were dropped (null on every row, no writer); the RERA Verified badge and the dossier use the latest successful check's date, and the carpet-area range comes from RERA's own figure in the snapshot. (2) **Specifications.** `open_space` and `density_units_per_acre` are switched off (deactivated, reversible) in the migration and the seed; the dossier now states the calculated Density, shared with the comparison (`src/lib/properties/density.ts`). (3) **Promoter.** The RERA panel offers "Add as a legal entity" when RERA names a promoter no recorded entity matches (`addPromoterAsLegalEntity`, `POST .../rera/promoter`): name as RERA prints it, type read from its wording (other when unclear), no registration number. (4) **Amenity flags.** Form 1B and the pool flag are read; a "yes" adds only a swimming pool or landscaping, a "no" never changes the listing and only puts a check-the-brochure note on the amenities row. Live result on the four projects checked against the RERA pages.

**Verified:** typecheck, lint, format check, the full suite (161 files, 1932 tests, run with no worker up), the migration applied to the local database, and the real adapter against all four live GujRERA records.

**Not done:** promoter group history (needs the request the browser sends); `unit_variant_amenities`; retiring `lifts_per_tower` and `parking_levels`, which RERA now also states (left for the owner). Committed on `task/phase-3-completion`, not pushed. Not looked at in a browser.

## 2026-09-24 (RERA second pass) - What the regulator states is read, kept on the property (schema v17), compared, and shown

**Done (`docs/tasklists/2026-09-24-rera-second-pass.md`, `DECISIONS.md` "RERA data, second pass" and "as built", `docs/schema/schema.v17.md`):** (1) **Adapter.** GujRERA's Angular bundle was read for the endpoints its project pages call and the public ones were requested for all four live projects. The adapter now takes the latest quarterly filing's progress (the old certified endpoint was stale or empty for three of four projects), per-block progress, floors and lifts, open and covered area, units booked and available as on the flat list's date, per-carpet-area availability and exclusive balcony area, the carpet-area range, filing counts, plan authority, registration date, architect, engineer and contractor names with stated counts, covered parking, and the drawn project boundary with its centre. Land area is now the figure the site prints (layout land), which corrects Anamika's density. Money, contact details and RERA's own score are not read. (2) **Schema v17 (migration `0020_rera_snapshot`).** One `properties.rera_snapshot` jsonb written only by the publish transaction; the existing `latitude` and `longitude` columns got a writer; validation refuses any money or contact key at any depth. (3) **Mapping.** The snapshot is one reviewed item; latitude, longitude and the map link (a pin at the boundary's centre, else a Google Maps search from the name) are proposed as needing review and never overwrite a value already held; RERA's floor count is proposed for review with a note that a brochure may count podium levels. (4) **Comparison and dossier.** "Units per acre (calculated)" is now "Density"; new rows for open area, units available, lifts and units per lift, floors per RERA, covered parking and parking per unit, plan authority, registration date, filings, the team, and per unit type the units available in its carpet area and RERA's balcony area. A signed-out visitor keeps project facts and not the per-carpet-area groups. The dossier's RERA section lists the facts with their dates; its carpet-area range now shows (the columns had no writer). (5) **Admin.** The Location tab draws the map the link draws beside the link; the RERA panel shows the new facts, the boundary and availability. (6) **Found and fixed on the way:** `loadLiveValues` never reported the published pincode, launch date or RERA land area, so a RERA check would have proposed them again every quarter; the "already declined" comparison read JSON key order, which Postgres does not keep; a property whose last record predates these fields is checked once more. (7) **Field audit** recorded in `DECISIONS.md`.

**Verified:** typecheck, lint, format check, the full suite (159 files, 1900 tests), and the real adapter against all four live GujRERA records (no gaps; Anamika matches the RERA page: 580 units, 104 booked, 476 available as on 07/07/2026, 10 of 11 filings, open area 18,261.63 sq m). Not looked at in a browser. No live property has a snapshot yet: it arrives when the RERA worker's next check runs or when an admin fetches from the RERA panel and applies it.

**Not done:** promoter group history (the endpoint rejects every parameter tried); RERA's declared and not-offered amenities (source flags found, mapping to the catalog not decided); explicit "not offered" from RERA; progress history by quarter; per-stage progress and planned dates (kept out of the snapshot); a way to add a promoter as a legal entity from RERA's name. Committed on `task/phase-3-completion`, not pushed.

## 2026-09-24 (last, 4) - A single-facility amenities page is suggested from its caption instead of being read

**Done (`docs/tasklists/2026-09-23-single-facility-amenity-matching.md`, `DECISIONS.md` "single-facility pages"):** when page routing is confirmed, an amenities page whose caption exactly names a catalog amenity (or one of its synonyms) is kept out of the paid amenities read, listed in the manifest's new `singleFacilities`, and, when the extraction is saved, added to the `property.amenities` candidate as an unconfirmed suggestion with evidence labelled "Router-detected, not read by extraction". The review panel shows that evidence with the page's own image (a new admin-only `GET .../brochure-page/{page}`, rendered on demand and never stored). A caption that matches nothing, or two amenities, stays in the read; if skipping would leave nothing to extract, nothing is skipped. The routing screen reads such a page back as an amenities page with its caption.

**Verified:** typecheck, lint, the full suite (154 files, 1839 tests), format check clean, including a real-catalog test that "Swimming Pool" resolves to `swimming_pool`, and a synthetic-adapter extraction test proving the suggested page is not among the pages the read is given and the field stays `needs_review`. No paid run was made; no real brochure has been re-routed with this yet, so no real property's amenities changed.

**Not done:** the unit-variant amenities tasklist (`docs/tasklists/2026-09-23-unit-variant-amenities.md`) and the comparison analytics design were not started. Not looked at in a browser. Committed.

## 2026-09-24 (last, 3) - Comparison rows worked out from stated inputs, and category headings

**Done (`docs/tasklists/2026-09-23-comparison-derived-metrics.md`, `DECISIONS.md` "derived metrics"):** the comparison now shows land area (sq ft and acres), units per acre (calculated), units per floor, efficiency, balcony share of carpet area, the developer's completed projects listed here, and a catalog-category heading over each run of amenities and specifications. Each says "not stated" when an input is missing, and none carries a price, score or ranking. Three owner answers shaped them: land area and density fall back to RERA's registered land area and say "per RERA"; units per floor is the unit type's own stated value (the tasklist's project-level sum would read 12 on Kimana for a floor with about 4); balcony share divides by carpet area. The locked comparison keeps the category headings and still sends no value. A check against the four live projects found none has its own plot area and none stores a super built-up area, so land area and density appear (through RERA), and efficiency will show nothing until a super built-up area is stored.

**Verified:** typecheck, lint, format check (now clean for every file, including the two docs that were flagged), the full suite (149 files, 1805 tests). Not looked at in a browser. Not committed.

## 2026-09-24 (last, 2) - Private prices: RERA's project range, an admin's price per unit type, and budget matching that uses them (schema v16)

**Done (`docs/tasklists/2026-09-24-private-prices.md`, `DECISIONS.md` "price data", `docs/schema/schema.v16.md`):** (1) **What RERA gives, checked live.** GujRERA masks every per-flat price (`unitConsideration`, received and balance) as `******`; it does state a project's minimum and maximum cost in its search result. (2) **Storage (migration `0019`).** `private.rera_price_ranges` and `private.staged_unit_prices`, row-level security forced, service role only; the service role gains a column-level read of `properties.id` and `rera_registration_number`. (3) **RERA range.** `RegulatorAdapter.lookupPriceRange` reads the two numbers; each successful RERA check (draft fetch and scheduled refresh) keeps them in `private`, best effort; the record and `rera_fetch_jobs.fetched_payload` stay money-free (a poisoned-fixture test proves it). Ranges are now stored for Kimana, Anamika and Amaris; Maruti 360's RERA record states none. (4) **Admin entry.** An owner-only Prices tab in the review panel: a price in whole rupees per unit type (Indian grouping, "₹2.5 crore" preview), RERA's range as a reference, live price shown, "not priced" list, a note that prices are never shown to buyers. Routes `GET/PUT/DELETE .../prices` and `POST .../prices/apply`. (5) **Apply.** After the publish transaction commits, `publishSubmission` copies staged prices into `unit_price_history` (source `admin_manual`, ending the previous current price); a failure leaves the property published with the prices staged and a retry. This is the second code path allowed the service role (`AGENTS.md`, `ARCHITECTURE.md`, `src/db/service.ts` updated). (6) **Matching.** Unit-level as before; a property with no admin price on any unit type falls back to RERA's range; a property with some prices matches on those only, its unpriced unit types not at all.

**Verified:** typecheck, lint, the full suite (147 files, 1787 tests) including real-database tests for staging, apply (idempotent, price change closes the old row, unknown names), publish applying staged prices, cascade on submission delete, the app role being denied the private tables, and the matcher's override, fallback, band edges, unbounded and removed-unit cases. Migration applied to the local database.

**Not done:** no admin has typed a price yet, so no unit type has a live price; the four real projects can match a budget only on RERA's range. Nothing is shown to buyers (no bracket); that is a separate owner decision. Prices are owner-only in the panel (verifiers do not see the tab). Not looked at in a browser.

## 2026-09-24 (last) - The dossier is gated behind sign-in; the locked placeholder is animated; printed lists are lists; "RERA Verified" without the number; report popup built; comparison names stick

**Done (`docs/tasklists/2026-09-24-dossier-gate-and-readable-specs.md`, `DECISIONS.md`):** (1) **Dossier gate, enforced on the server.** A signed-out request for `/properties/{slug}` or `GET /api/v1/properties/{slug}` is handed `lockDossier(dossier)`: unit types keep name and BHK and lose every measurement, amenity answers go, floor plans and documents go, photographs are cut to three (withheld ids are not sent) and counted. The page is now rendered per request instead of statically regenerated, and the API response is `private, no-store`. (2) **Animated placeholder.** Tonal bars with a highlight sweeping across, staggered down the page, still under reduced motion; used on the dossier and on the comparison's locked rows, with the real labels kept. (3) **Readable lists.** A value printed as "A; B; C" is drawn one item to a line in two columns; long values sit full width; the comparison shows one item per line. (4) **"RERA Verified"** no longer prints the registration number (tooltip and RERA section keep it). (5) **Report a problem** popup with `reports@propcompare.example` and a prefilled `mailto:`; "claim this listing" removed from the task lists. (6) **Comparison:** the name row now sticks below the site header (it sat under it), and each column's plate is a photo carousel with a stack hint. (7) **Overflow:** review-panel values and notes wrap, free-text inputs grow.

**Verified:** typecheck, lint, the full suite (143 files, 1689 tests), including a database-backed route test (locked with no session, full with one). `format:check` flags only the two docs it already did.

**Found:** nothing in the application writes `private.unit_price_history`; only the budget matcher reads it and tests fill it. No review-panel field, extraction field or admin control takes a price, so budget matching has nothing to match on real properties. Recorded in `DECISIONS.md` (2026-08-31, 2026-09-20) as intended to stay private, but the way prices get in was never decided.

**Not done:** the photo preview count (3) and whether specifications lock are the owner's to confirm. None of this was looked at in a browser. The three queued tasklists (comparison-derived metrics, single-facility amenity matching, unit-variant amenities) and the analytics design were not started. Not committed.

## 2026-09-24 (late night) - The Location section: Google Maps link, small map, connectivity lists; nearby facts out of the specifications

**Done (`docs/tasklists/2026-09-24-location-section.md`, `DECISIONS.md`, `docs/schema/schema.v15.md`):** an admin can paste a Google Maps link in the review panel's Location tab (`property.google_maps_url`, `properties.map_url`, migration `0018`, https Google Maps links only). The dossier's Location section now shows the facts, a small map when the link can be drawn (a pin, coordinates, place text, or an embed link), an "Open in Google Maps" link, and connectivity, hospitals and schools as plain lists. Those facts are still stored as the v12 specification keys but are split out of the specifications in the dossier query, so they appear nowhere among specifications: not on the dossier, not in the comparison (which gains a Location and connectivity group), and in the review panel they sit under the Location tab. A short Google share link is kept as a link only; no map is guessed.

**Verified:** typecheck, lint, the full suite (141 files, 1663 tests), including a database-backed test of publishing the link and reading the split back. Migration and field seed applied to the local database.

**Not done:** Anamika has no map link yet (the owner pastes it; not guessed). Automating the link stays open with the geocoding decision. Not looked at in a browser. Two owner directions are recorded in `DECISIONS.md` but not built: the "Report a problem" popup with a placeholder email, and taking "claim this listing" off the task lists. Not committed.

**Found:** the OCR worker on the owner's machine polls the same database the test suite uses, and four test files queue OCR jobs then delete them; a running worker can claim one and fail with "OCR job not found" (no provider call, no cost). Not fixed.

## 2026-09-24 (night) - Main project photo built (owner-approved); stored-file safety fix on candidate delete

**Done (`docs/tasklists/2026-09-24-main-project-photo.md`, `DECISIONS.md`, `docs/schema/schema.v14.md`):** an admin can choose a project's main photo in the Pictures panel ("Make main photo", with a marker on the current one). It is a new field-contract entry, `property.main_photo` (`media_id`, seeded), naming a live photo or an approved public candidate; the publish transaction applies it, clears the previous main photo, and refuses a floor plan, another property's picture, a picture the same edit removes, or an unapproved candidate. Migration `0017` adds a partial unique index so a property can never have two live main photos. Cards, the comparison and the dossier already preferred `is_primary`, so they now show it. Related fix found on the way: deleting a picture candidate deleted its stored file even when a live picture or another candidate used the same file key; it now keeps a shared file, and drops a main-photo choice that named the deleted picture.

**Verified:** typecheck, lint, the full suite, and new integration tests against the real database for the publish rules and the index, plus panel tests. The migration and the field seed were applied to the local database.

**Not done:** no project has a main photo chosen yet, Anamika included (the owner's pick). Not looked at in a browser. Not committed.

## 2026-09-24 (evening) - Delete and archive submissions; four more Anamika facts; review-panel and comparison fixes from the owner's reports

**Done (`docs/tasklists/2026-09-24-delete-and-archive-submissions.md`, `DECISIONS.md`, `docs/schema/schema.v13.md`):** (1) **Delete/archive.** A submission never published is deleted for good (owner only) with its fields, evidence, images, extraction attempts and the files only it used; a published one is archived (`property_submissions.archived_at`, schema v13, migration `0016`) and moves to an Archived view with Restore. The default list is clean. Refused while a brochure read is running. (2) **Anamika, four more facts.** Scanning the checkpoint's 64 unmapped facts, not just the three already published, found four with real v12 fields, checked against the rendered pages 22 and 24: nearby connectivity (metro, airport, ring road and others, which the previous entry wrongly said the brochure did not print), parking levels, lifts per tower, podium. They are in draft `b30183d6` as needs-review fields with page evidence, not published. The checkpoint's own `location.distance_*` keys are shifted against the printed table and were not used. (3) **Review panel:** pictures open full size; a Location & connectivity tab; the developer's full amenities list moved to Amenities. (4) **Comparison:** Anamika's column showed a floor plan because the comparison took "the first media row", and publishing its floor plans put one at display order 0. One shared rule (primary photo, any photo, a floor plan only if no photo exists) now serves the cards, comparison and dossier; the plate is a 3:2 photo in its own row instead of an 80px strip in the sticky header; a photo strip per project closes the comparison (signed-in only, opens full size).

**Verified:** typecheck, lint, the full suite (see below), and the new removal integration tests against the real database. Routes checked live unauthenticated (`401`). Not looked at in a browser: the queue page, the review panel tabs, the comparison plate and strip.

**Found, not fixed:** the migration journal has a hand-set timestamp on `0014` that makes `drizzle-kit migrate` skip later migrations, and `0015` (v11's table) is in the database but not recorded as applied. `0016` was made to apply; `0015`'s record is unrepaired.

**Not done:** a separately designated main photo per project (needs a schema change and a publish-transaction change; recorded in `DECISIONS.md` for the owner). Draft `b30183d6` is awaiting confirmation and publish. Not committed.

## 2026-09-24 (later) - Anamika's location facts published; floor-plan pages now tie themselves to their unit types

**Done (`docs/tasklists/2026-09-24-floor-plan-auto-mapping.md`, `DECISIONS.md`):** (1) The Anamika backfill that was blocked on self-approval is applied, on the owner's direction: vastu compliance, nearby hospitals and nearby schools, copied from its paid checkpoint, published as revision `20d8a1de`. The script is now additive: it skips any key already holding a value. Confirmed live afterwards: towers 5, floors 31, 26 amenities and 5 unit types all as the owner left them. (2) Floor-plan auto-mapping, the previous session's open proposal: after an extraction persists, each discovered unit type's floor-plan page becomes a private, needs-review image candidate with the unit type filled in (`src/lib/submissions/floor-plan-auto-map.ts`). It keys on the router's page captions, not the model's cited pages: checked against rendered pages 14 and 15, the model's citations were one page too high for both Block B & E types while the captions were right. (3) Anamika: five candidates (Block A p20, B & E p14 and p15, C & D p17 and p18) are in edit draft `720fcf56-3e9f-416e-a108-f5c1f90c6c8a`, awaiting approval in the Pictures panel and publish.

**Verified:** typecheck, lint, full suite (135 files, 1608 tests, including the matcher on Anamika's real captions and citations and a real-database test of the candidate rows). A test exposed a real matcher flaw on the way ("2 BHK ... Type 1" also matched Type 2); fixed by requiring "type N" and "block X" pairs to be adjacent. `format:check` still flags `docs/schema/schema.v12.md` and `docs/tasklists/2026-09-23-comparison-derived-metrics.md`, neither touched.

**Not done:** the five candidates are not approved or published (deliberately: a rule chose them, a person approves them). The hook was not exercised by a fresh paid extraction. The comparison-derived-metrics tasklist (land area, unit density, units per floor, efficiency, balcony ratio, amenity category headings, developer completed-projects) is still not started, so none of it shows in `/compare`. Not committed.

## 2026-09-24 - The comparison sign-in gate now holds on the server; a saved comparison is recognised on return and can be unsaved

**Done (`docs/tasklists/2026-09-24-compare-server-gate-and-unsave.md`, `DECISIONS.md`):** two owner-reported bugs, both real. (1) **A shared `/compare` link showed detail without sign-in.** The 2026-09-22 gate only hid rows in the browser; fetching the page with no session showed the full rooms, amenities, specifications and RERA ranges of both properties in its own payload. `src/app/compare/page.tsx` now reads the session on the server and a signed-out request is handed only `lockComparison(model)` (`src/lib/compare/lock.ts`): column identity, the differences-first summary and each row's label. No cell, floor-plan reference or per-row differs/gap status is sent. `CompareScreen` takes its mode from what the server sent (`dossiers` or `locked`), not from a client session check; a locked visitor's unit-type pick or removal re-requests the page, and signing in remounts it with the full data. What is open and what is locked is unchanged. (2) **A saved comparison offered "Save this comparison" again on return.** The saved state was local `useState`. The button now reads the buyer's saved comparisons on load, matches by the signature `createComparison` already de-duplicates on, and shows "Saved" with an "Unsave" action, backed by a new `DELETE /api/v1/comparisons/{id}` (own comparisons only; an unknown or another buyer's id is `404`).

**Verified:** typecheck, lint and the full suite (134 files, 1600 tests, including a new integration suite for `DELETE` and a `lockComparison` test) clean. Against the running dev server: signed out, the `/compare` payload contains no `rooms`, `amenities`, RERA range fields, cells or floor plans; with a real signed-in session cookie it carries the full data and no sign-in prompt; save, list, delete, delete again (`404`) and delete signed out (`401`) all behave as specified. The throwaway buyer used for this was removed. `format:check` flags `docs/schema/schema.v12.md` and `docs/tasklists/2026-09-23-comparison-derived-metrics.md`, neither touched here.

**Not done:** the visual sign-in transition (signing in via the embedded form and seeing the rows appear) was not driven in a browser here, since the dev OTP is only logged to the separate `bun run dev` console; the code path is the existing `router.replace` + `router.refresh()` in `BuyerLoginForm`, and the page is keyed by mode so it remounts with the full data. Not committed.

## 2026-09-23 (late night) - Resolved single-facility-amenity-matching's remaining decisions; found and fixed five real extraction defects reviewing Anamika High Point; several admin-UI bugs fixed on the way

**Done (`DECISIONS.md`):** the tasklist's steps 2-3 (what "skip extraction" means, evidence, partial-page safety) are resolved with the owner: full skip from the amenities scope (real per-page cost savings), the router's caption becomes an explicitly-labeled unconfirmed suggestion (never auto-accepted), and the safety net is requiring the actual page image at confirmation rather than a hedging second extraction call. Not wired yet — a routing-contract change, its own task.

**Five extraction defects found and fixed**, reviewing Anamika High Point (already published) against its own paid checkpoint: (1) an under-exhaustive amenities read (20 of ~34 icons) traced to a prompt line that discouraged "counting" a list at all — fixed with an explicit exhaustiveness rule. (2) "31-Storey Iconic Towers" read as 31 towers (really 5, per the block legend) — fixed with an explicit storey-vs-tower rule. (3) A hard prohibition on ever assigning a BHK catalog key meant a plan's own printed heading ("4 BHK Classy Residences") couldn't populate it — relaxed to accept a BHK key only when it's a real catalog key (offered as `allowedValues`, same mechanism `property.amenities` already uses) and only from a printed heading; an invented key still fails the run. (4) v12's specification fields (added earlier tonight) were only offered to the specifications scope, so Anamika's vastu/nearby-landmark facts — printed on project-detail pages — had no key to land in and were dropped, same failure shape v12 itself was built to close; fixed by offering spec keys to `property_details` too, with dedup across scopes in `buildSubmissionFieldCandidates`. (5) Three of those now-recoverable facts (vastu compliance, nearby hospitals, nearby schools) backfilled into the live record through a new edit-submission script (`src/db/backfill-anamika-location-facts.ts`), copied verbatim from the checkpoint, dry-run by default — **not yet applied**, blocked on the auto-mode classifier requiring the owner to run `--apply` themselves.

**Admin-UI bugs fixed on the way, none pipeline-facing:** the unit-type tab reset to the first tab after every save (a content-keyed `InlineField` remounting on its own successful save, not just on an external change) — fixed with a `StableField` wrapper using an effect, not a ref mutated during render. A rejected image showed "Approve"/"Reject" (rejecting a rejected picture is a no-op) — now "Approve"/"Delete", with a new `deleteSubmissionMedia` path and DELETE route. `5 BHK+` label shortened to `5 BHK`; `ev_charging` added to the amenity catalog; "(calculated from the sides)" shortened to "(calculated)"; a tab list's native scrollbar hidden (still scrolls) via a new shared `.scrollbar-none` utility.

**Verified:** typecheck, lint, format:check, full suite (133 files, 1591 tests) clean after every change above.

**Not done:** the backfill script needs `--apply` run by the owner (blocked on self-approval, correctly — it publishes to live tables). An "1/1" counter the owner noticed with multiple unit types selected wasn't tracked down (unclear which component without a closer look). Anamika has zero floor-plan images published at all — confirmed as the same "Use as image was never run on the confirmed pages" gap already documented for Maruti 360, not a new bug, unresolved for both. The single-facility-amenity-matching wiring itself (now that its design is settled) is not built.

## 2026-09-23 (night, later) - Verified the amenity-caption fix live; widened two router category rules after a fresh brochure surfaced real gaps; left a third gap deliberately unfixed

**Done (`docs/tasklists/2026-09-23-single-facility-amenity-matching.md`, `DECISIONS.md`):** the caption prompt fix from earlier tonight is now verified live, not just reasoned. A fresh, previously-untested brochure (`anamika_hp_web_brochure (1).pdf`, 26 pages, categorization-only) turned out to have no single-facility marketing pages, so its own run didn't exercise the fix — but reviewing it surfaced two more router gaps worth closing: (1) a generic "30+ amenities"-style marketing page with no itemized list and no single facility named was falling through both branches of the `amenities` rule; (2) a location/connectivity page (nearby malls, hospitals, schools with distances) was unconditionally `other` and never reached extraction, even though schema v12 (added earlier tonight) now has real fields — `nearby_connectivity`, `nearby_hospitals`, `nearby_schools` — for exactly this. Both rules were widened in `page-router.ts`, on explicit owner direction after being shown the tradeoff (widen now vs. leave to manual flagging vs. a scoped tasklist). That widening needed re-verification against the three brochures whose categorization the owner had already hand-checked as accurate (Kimana Towers, Adani Amaris, Maruti 360) — re-ran all three; no low-confidence or unclassified pages on any of them, all previously-documented reference points held (Amaris specifications 64–65, its floor-plan/duplex-pair structure, Maruti 360's amenity page count staying at 10), and the widened rules visibly caught one new specifications page on each of Amaris and Maruti 360 (not yet visually spot-checked, since both are scanned image pages with no extractable text layer to verify programmatically). Re-running Maruti 360 also gave the caption fix its real proof: pages 14 and 15, whose taglines ("Rise above all else", "Leave a lasting impression") were never named in the prompt, now correctly return "Observatory" and "Banquet Hall" — genuine generalization, not pattern-matching the two banned examples.

Found and fixed on the way: `scripts/categorize-brochures.mjs`'s new caption-capture was reading the imageLayout label ("Image fills the page") off pages with no real caption, since both share the same CSS classes. Fixed by adding `data-slot="page-caption"` to the real caption's `<p>` in `page-review.tsx`.

**Deliberately not fixed:** Anamika page 11 prints per-BHK RERA carpet-area figures in a small sidebar beside a dominant lifestyle photo — the router misses it because a page's visual character, not its text, drives categorization. Investigated whether this data already has an authoritative source: `properties.rera_carpet_area_range_min_sqft`/`max_sqft` exists in the schema but has no writer anywhere in the codebase today, from either OCR or the GujRERA fetch mapping — the same "designed, never built" shape as `properties.latitude`/`longitude` before today's geocoding entry. Whether this figure's canonical source should be brochure OCR or the (not-yet-built) GujRERA mapping is an open architectural question, and no narrow, safe router rule exists for "a photo-dominated page with a valuable text sidebar" the way the other two gaps had — left for a future tasklist rather than patched reactively.

**Verified:** typecheck, lint, format:check, full suite (133 files, 1591 tests) clean after all changes. Not committed yet. Cost: the original prompt-fix verification plus the three-brochure regression check, all small categorization-only calls (~$0.03 total based on 2026-09-19's measured range for these same three brochures).

**Not done:** a visual spot-check of the two new specifications pages (Amaris 25–26, Maruti 360 page 16) to confirm they're genuinely location/connectivity content and not noise from the widened rule. The tasklist's decisions 1-3 (what "skip extraction" means, evidence handling, partial-page safety) remain open, unaffected by tonight's work.

## 2026-09-23 (night) - Closed schema v12's one open follow-up: `amenities_full_list` gets its own dossier block

**Done (`docs/schema/schema.v12.md`):** the "Not done here" note from schema v12 (`amenities_full_list` falling into the generic Specifications category list instead of its own section) is closed. Added `splitAmenitiesFullList` to `src/lib/properties/dossier.ts`, pulling that one field out of `dossier.specifications` before it reaches the generic category grouping; `dossier-screen.tsx`'s `CatalogSection` gained an optional `trailing` slot so the new block renders inside the same "Amenities" section as the catalog-matched list, not as a new top-level nav section. Deliberately the only v12 field with dedicated UI, since it is the only one the schema doc calls out as different in kind (dossier-only, never catalog-matched, never a comparison row) — the other 19 still render through the fully generic `specification_text` path.

**Verified:** typecheck, lint, format:check, and the full suite (133 files, 1591 tests, two new) clean. Not committed yet.

**Not done:** the two items schema v12's writeup separately flagged as still queued — `unmappedRawEvidence`'s general discard problem (explicitly an open product question, not scoped here) and the single-facility-amenity-matching prompt work (`docs/tasklists/2026-09-23-single-facility-amenity-matching.md`) — are untouched by this entry.

## 2026-09-23 (evening) - Found and fixed the real cost bug (hidden reasoning billing), reverted the two-pass floor-plan design it caused, fixed three data-loss bugs a rich brochure exposed, added schema v11/v12, reviewed a competitor

**Root cause found (`DECISIONS.md`):** `reasoning: { max_tokens, exclude: true }` does not disable reasoning — `exclude` only hides it from the response while it is still generated and billed at the output rate, and the `max_tokens` beside it maps to Anthropic's `budget_tokens`, a parameter Sonnet 5 removed, so the cap was silently ignored on every call since 2026-09-02. Measured against `ai_usage_events`: 55% of all-time extraction spend ($1.85 of $3.35) bought invisible thinking, and it was 100% of the budget on both `output_length` failures. Fixed with `reasoning: { enabled: false }`; `DEFAULT_MAX_COMPLETION_TOKENS` raised 32,000 → 64,000 (real ceiling is 128,000 — the 32,000 cap was self-imposed and never the real constraint).

**Reverted the 2026-09-23 (earlier) two-pass floor-plan design** (`expandFloorPlanScope`, the discovery prompt/parser, the per-cluster fan-out) — it existed to bound output that was never the actual constraint, cost an extra full page-read per brochure, and broke cross-page unit merging. Back to one call per `floor_plans` scope, reading all confirmed pages together, the shape that worked before any of today's churn. A same-session detour tried moving floor-plan discovery to a cheap model (`google/gemini-2.5-flash`); reverted too — it read no page images at all under OpenRouter's native PDF path (billed $0.0017 on 9 dense pages) and returned page titles instead of sellable units.

**Three data-loss bugs found reviewing a real 37-page extraction (Godrej Altus flipchart) against the actual brochure, all the same shape — a richer brochure than the schema anticipated, refused wholesale instead of degrading:** (1) one bad evidence page-citation discarded an entire field, including all 14 correctly-read amenities; citations are now validated one at a time. (2) All 269 rooms of a brochure that prints each dimension twice (feet-inches and metres) were discarded because the model returned `{dimension, size}` instead of `{length, width}`; a combined pair is now split. (3) Every area of every unit type was discarded as "duplicate bases" when a brochure printed the same basis in two unit systems; a repeated basis is now read as agreement, not contradiction (a genuine >1% disagreement still fails). Verified by replaying the real cached responses already on disk — no new provider call to test any of this.

**Schema v11** (`unit_variant_amenities`, owner-approved 2026-09-22): table + migration only, storage for a unit type's own amenities (a penthouse's private pool). Nothing reads or writes it yet — extraction field, dossier row, comparison row all scoped in `docs/tasklists/2026-09-23-unit-variant-amenities.md`, not built.

**Schema v12** (20 new `specification_text` fields, no migration): vastu compliance, connectivity to named landmarks, nearby hospitals/schools, clubhouse/courtyard area, plot number, 13 construction-spec facts — all things Sonnet read correctly on the flipchart brochure and had nowhere to put (`unmappedRawEvidence`, which nothing downstream persists). Owner direction on the 35-vs-14 amenities gap this surfaced: `property.amenities` (catalog-matched, v1) stays comparison's source of truth; new `property.specifications.amenities_full_list` shows everything the brochure printed, dossier-only, never a comparison row.

**Backfilled submission `651cf2b6` directly from its already-paid-for checkpoint** rather than re-running extraction for data already read once: 14 persisted fields → 36; `unit_variants`' 144 rooms and 26 area entries restored (previously persisted empty, predating this session's fixes); `property.amenities` populated for the first time.

**Floor-plan page captions now survive routing confirmation** — previously lived only in the draft manifest's ephemeral `suggestions` wrapper, lost unless "Use as image" happened in the same sitting as the original page review (the exact cause of Maruti 360's lost floor-plan captions, 2026-09-22). Now threaded into `OcrRoutedPage.label` and read back indefinitely.

**Reviewed a competitor (Propsoch, 8 screenshots)** against `docs/design/comparison.v1.md` and the real row definitions in `src/lib/compare/model.ts`: confirmed `properties.plotAreaSqft` has existed since schema v1 and was never rendered in `/compare`, and `amenity_catalog.category` is already loaded into every comparison row but used only to sort, never as a heading. Opened `docs/tasklists/2026-09-23-comparison-derived-metrics.md` for the zero-new-extraction slice (land area, unit density, units-per-floor, efficiency %, balcony ratio, amenity category headings, developer completed-projects count). Reaffirmed rather than reopened: no price, no score/rating (Propscore), no subjective labels (Investment Potential/Livability), no generated-narrative winner declarations — all conflict with comparison principle 7, which already has a rule-based, non-generated alternative (principle 3) Propsoch's version was invented to fake.

**Opened, not scheduled:** geocoding properties for independently-verified "nearest connectivity" distances and guided intake's locality+radius search. Found `properties.latitude`/`longitude` have existed since 2026-08-31 for exactly this, read all the way through the query layer, never written by anything — the same "designed, never built" shape as the `reviews` table. Confirmed GujRERA's own fetched records carry a free-text address, not coordinates, so this needs a geocoding step regardless of source. Provider choice (Google Maps Platform, paid vs. OpenStreetMap's free stack), real-travel-time vs. straight-line distance, and a curated-landmarks-table vs. live-API design are open owner decisions, recorded in `DECISIONS.md`, blocking any tasklist until chosen.

**Verified:** typecheck, lint, format:check, and the full suite (133 files, 1589 tests) clean after every change above. Four commits, no AI co-author trailers.

**Not done:** the Godrej Altus flipchart submission (36 fields, 13 unit variants, ready) has not been reviewed or published — that's the owner's next step in the admin UI. Schema v11's extraction/dossier/comparison wiring, the single-facility-amenity-matching prompt work, the comparison-derived-metrics slice, and the geocoding provider decision are all scoped but unbuilt.

## 2026-09-23 (later) - Floor-plan extraction no longer trusts a scope's page count to fit one response; found and fixed a persistence-time silent-drop bug on the way

**Done (`docs/tasklists/2026-09-23-floor-plan-unit-discovery.md`, `DECISIONS.md`):** a real extraction (Godrej Properties) failed `output_length` on a 9-page floor-plans scope — every scope call shares one fixed 32,000-token completion budget, and the floor-plans prompt asks for full room-by-room detail for every discovered unit in one response, so output size scales with a brochure's own complexity rather than page count (Maruti 360 succeeded with 10 pages; this one failed with 9). Fixed with two provider calls instead of one, both still reading the full page range together so a duplex/penthouse's levels are never split across two different requests (the exact bug a 2026-09-02 decision already fixed once, which ruled out both a blind page-count split and reusing the page-router's own per-page captions to group units — the router captions pages independently and structurally cannot know two pages are the same unit): a cheap discovery call says which pages belong to which unit, then one bounded extraction call per discovered unit reuses the existing `unit_variant` scope kind's prompt and parsing exactly as built. No routing-contract change — the confirmed manifest still carries exactly one `floor_plans` scope; the split happens entirely inside the adapter's internal handling of it.

**A real bug found while checking every consumer of the OCR scope machinery, not by a failing test:** the persistence path resolved a unit variant's scope by re-parsing the confirmed manifest fresh from the database, which has no idea about the adapter's internal synthetic scopes — every floor-plan-discovered unit variant would have silently vanished at persistence, looking like a successful extraction with quietly incomplete data. Fixed by having the adapter return the `effectiveManifest` it actually used and having persistence resolve against that instead.

**Verified:** typecheck, lint, format:check, the full suite (133 files, 1589 tests) — OCR test coverage rewritten for the two-call shape, order-preserving so checkpoint/billing order stays predictable across a mid-run failure.

**Not done:** re-routing and re-queueing the actual failed Godrej job through the fixed pipeline is a paid provider call, held for the owner's go-ahead per the standing rule. The two 2026-09-22 router follow-ups (persisting the floor-plan/amenity caption past page-confirmation, matching a simple amenity spread against the catalog directly) remain queued, unaffected by this entry.

## 2026-09-23 - Reviewed an externally-shared investor-metrics chat; opened the analytics-taxonomy design tasklist, recorded guardrails, discarded the rest

**Done:** the owner shared a ChatGPT investor/Shark-Tank metrics conversation about PropCompare and asked for a read against `AGENTS.md`, `docs/roadmap.md` and `DECISIONS.md`, with whatever was practical turned into tasklists/decisions. Most of it (TAM/SAM/SOM sizing, competitor traffic claims, pitch rehearsal) was discarded as non-engineering-actionable, the same disposition `PROGRESS.md` (2026-08-31) already gave an earlier VC report. Four things were adopted into `DECISIONS.md` (2026-09-23): first definitions for "activated user" and "completed comparison" (the latter tied to the 2026-09-22 comparison sign-in gate, not to opening `/compare`); a rule that any future comparison preference/"win-rate" index is developer-facing only, never a buyer-facing score (extends `docs/design/comparison.v1.md` principle 7); a rule that paid developer presence, if ever built, must never affect match ordering or comparison content; and data-coverage/data-quality KPIs (using `reraFetchJobs` and `property_schema_fields`, no new data needed) as the numbers to report instead of a raw listing count.

**Scheduled as a consequence:** `docs/tasklists/2026-09-23-analytics-event-taxonomy.md` — a paper-only design tasklist (event list, anonymous/signed-in identity model, retention, consent, the metric definitions above) that the 2026-09-19 decision already flagged as due "when beta approaches." Judged due now because Phase 3 is nearly closed and comparison slice 4 has been blocked on this taxonomy since it was written. No capture code, no schema change, no migration in this entry — `docs/design/comparison.v1.md` and `docs/roadmap.md` Phase 4 both updated to point at the new tasklist.

**Not done:** the tasklist's own blocking decisions (identity model, retention window, consent position, the final event list checked against real routes) are unresolved — that is the tasklist's own next work, not this entry's. The data-coverage/quality admin panel is named in `docs/production-readiness.md` but not scheduled. The `reviews` table (unused since 2026-08-31) was named as an explicit, un-scheduled deferral rather than left silent.

## 2026-09-22 (late night, 3) - "Report a problem" placeholder on every dossier

**Done (`docs/tasklists/2026-09-22-report-a-problem-placeholder.md`):** the second of the four 2026-09-22-approved items. A "Report a problem with this listing" link now sits beside "Back to all properties" at the foot of every dossier — the placement the 2026-09-20 media-rights decision already committed to (attribution plus a takedown route, ahead of developer consent). It opens a dialog stating plainly that a way to send a report is coming and that nothing is sent, saved, or recorded yet — exact scope as approved: no table, no storage, no contact address invented ahead of one being chosen.

**Verified:** typecheck, lint, format:check, and the full suite (133 files, 1589 tests, including a test asserting the dialog never calls `fetch`); a real-browser check on a live dossier (`the-kimana-towers`) confirmed the link, the dialog, and its exact copy.

**Not done:** the other two items from the same approval (comparison analytics, schema v11 for `unit_variant_amenities`) and the two router follow-ups remain queued.

## 2026-09-22 (late night, 2) - Major flow pivot: intake is the front door, not a nav item; comparison locks its detail behind phone sign-in

**Done, owner direction given directly mid-session (`DECISIONS.md`, `AGENTS.md`, `docs/design/comparison.v1.md`, `docs/app-flows/buyer.md` all updated in the same change; tasklist `docs/tasklists/2026-09-22-intake-first-landing-and-comparison-gate.md`):** this reverses the 2026-09-20 "no sign-in to compare" rule, which was written directly into `AGENTS.md`'s own comparison paragraph, not only the design doc — both were updated together so neither silently contradicts the other. **Phase 1:** `/intake` is off `BUYER_NAV`; the landing hero's primary call to action is "Tell us what you're looking for" → `/intake`, with "Browse everything instead" as the secondary path; the stale "No sign-in to compare." line is gone. **Phase 2:** `/compare` still needs no account to reach or to see the column identity (photo, name, locality, developer, chosen unit type) and the differences-first summary; every row group beneath them (Possession and timeline, the unit type's own detail, Room by room, The project, Amenities, Specifications, RERA) now renders locked — a real row label beside skeleton blocks — until the buyer signs in, with exactly one embedded phone-OTP prompt shown once, not per group. The unlock is a plain session check (the same one `SaveComparisonButton` already used), not the separate `dossier_unlocks` table. Intake's results already let a buyer open a dossier or add straight to a comparison (`CompareToggle` on `PropertyCard`), so nothing needed to change there.

**Verified:** typecheck, lint, format:check, and the full suite (132 files, 1585 tests — a new `compare-screen.test.tsx` covers the lock/unlock states specifically; `compare.test.tsx` and `buyer-actions.test.tsx`, which render `CompareScreen` for unrelated reasons, now mock a signed-in session since that is what they were actually testing). Real-browser checks in headless Chrome, signed out (`scripts/verify-intake-first-and-compare-gate.mjs`, kept in the repo): the nav change, the hero CTA, and every locked-state assertion on `/compare` (identity and summary open, every group locked, zero real rows, one sign-in prompt) all pass, with screenshots reviewed.

**Not done:** the reactive "signing in reveals the locked content without a reload" transition was not independently driven in a real browser — this environment cannot read the dev-only OTP code Better Auth logs to the separately-running `bun run dev` process's own console. Both static end-states (signed-out locked, signed-in unlocked) are verified; the transition between them relies on the same `authClient.useSession()` reactivity already used elsewhere in the app. **Phase 3 (the landing page's substantially richer content) is deliberately not started** — the owner's direction was clear that this should happen but did not specify what "richer" should contain, and that is not something to guess.

## 2026-09-22 (late night, 1) - The pre-login intake cookie: explicit opt-in, not silent capture

**Done (`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`, resolved and completed; schema v10, migration `0014`):** a buyer who has stated anything in guided intake and is not signed in sees "Sign in to keep this search" on the summary step — an explicit choice, not a background sync (the existing copy already promises nothing is sent without asking, and this keeps that promise: nothing leaves the browser until that button is clicked). Choosing it POSTs the current answers to a new narrowly-scoped `POST /api/v1/buyer/intake-handoff`, which sets an `httpOnly` cookie whose `Path` is scoped to nothing but the one claim route (narrower than the original 2026-09-18 design, which scoped it to "the login/signup routes"). On successful sign-in, `BuyerLoginForm` claims it via `POST /api/v1/buyer/intake-handoff/claim`, which writes one `buyer_intake_sessions` row now that a `userId` exists, clears the cookie, and hands the claimed answers back; `IntakeFlow` reapplies them as ordinary, fully editable starting state (a "Welcome back" note, cleared the moment anything is changed) via a one-shot in-memory relay — never re-read on a later visit, per the tasklist's own scope. Resolves the tasklist's stated "do not guess — ask" questions: the claim route is a purpose-built endpoint rather than a fork of Better Auth's own routes, and the owner's direction (given when asked) was that the answers should be applied as editable filters, not shown back as an inert "your last search."

**A real schema gap found on the way:** `buyer_intake_sessions.city` was `not null` in the original schema even though intake's city question is optional and nothing had ever written to this table before. Fixed as schema v10 (`docs/schema/schema.v10.md`, migration `0014_intake_sessions_city_nullable.sql`, applied locally) — a one-column nullability loosening, not a structural change. Flagged in the schema doc: this consumed the "v10" version number ahead of the separately owner-approved `unit_variant_amenities` work, which becomes v11 when it is built.

**Verified:** typecheck, lint, format:check, and the full suite (131 files, 1581 tests, including a new integration test suite against the real database for both routes: cookie round-trip encoding, session requirement, bhk-key resolution, open-ended range handling, and a tampered-cookie case that must not break sign-in).

**Not done:** the other three items approved 2026-09-22 (report a problem, comparison analytics, schema v10/v11 for `unit_variant_amenities`) and the two router follow-ups from 2026-09-22 (evening) are still queued, unaffected by this entry.

## 2026-09-22 (night) - Branches merged to `main`; a git-history incident found and fixed; the approved paid test run

**Done:** fast-forwarded `main` to `task/phase-2a-completion`'s history (every other local branch was already an ancestor of it, so nothing else needed merging) and pushed to `origin/main`. Continuing work moved to a fresh branch, `task/phase-3-completion`.

**Found and fixed on the way:** the merge put 9 old commits from a 2026-09-18 session on GitHub for the first time, and they carried a `Co-Authored-By: Claude` trailer — a violation of `AGENTS.md`'s rule, missed because commit trailers were never checked before pushing. The owner caught it from GitHub's Contributors panel. Fixed with the owner's explicit go-ahead: a `git filter-branch` message-only rewrite across all 122 commits on `main`, then a force-push; verified against `origin/main` directly (GitHub's Contributors panel is a separately cached feature and lagged the fix). Full account in `DECISIONS.md`.

**Approved, 2026-09-22:** the pre-login intake cookie, report a problem (placeholder only), comparison analytics (an events table, no user id, no IP, no price), and schema v10 (`unit_variant_amenities`, private amenities per unit type). None built yet.

**The approved paid categorization test: run.** Fresh upload of the Maruti 360 brochure, one "Categorize brochure pages" run ($0.0076, `google/gemini-2.5-flash`). Amenity pages found went from 1 to 10 — 4 of the 5 marketing spreads named in the original finding are now caught (pages 11, 13, 14, 15); page 17 is still categorized `other` (owner: not worth chasing). Floor-plan captions on pages 20–29 matched exactly, unaffected. The test submission (`a3e786e9-239e-4b0b-a750-532c663ed0e0`) is left in the database as a draft, not deleted, per the owner's standing instruction; not taken further (no extraction, no publish). Full account in `DECISIONS.md`.

**Not done:** the remaining Phase 3 items and schema v10 (all four approved above), persisting the router's floor-plan/amenity caption past page-confirmation, having the router match a simple amenity spread against the catalog directly, and the UI/flow refinement round.

## 2026-09-22 (evening) - Router prompt tweaked so single-facility amenity spreads are no longer missed

**Done:** `src/lib/ocr/page-router.ts`'s prompt now explicitly classifies a full-page single-facility marketing spread (one photo, captioned with a facility name, no list of other amenities) as an amenities page, not marketing imagery, and asks for a short caption naming the facility, the same mechanism already used for floor plans. Prompt-only; no paid call was made.

**Not done, proposed for later:** having the router directly match a simple single-facility spread's caption against the amenity catalog/synonyms, skipping a second extraction call for that page (the owner's idea, mid-session) — a real cost saving since the router already reads every page once, but it needs the catalog/synonym match wired in properly and a page listing several amenities together still needs the real extraction pass either way.

**Verified:** typecheck, lint, prettier, the full suite (129 files, 1542 tests).

**Next:** the approved paid categorization test on a fresh upload of the 360 brochure, to measure this prompt against the categories already confirmed — needs your go-ahead again since the prompt has changed since you approved it.

## 2026-09-22 (later still) - Maruti 360's floor plans are live, matched from the brochure's own captions; a second structural gap fixed on the way

**Done:** the last of the seven comparison-review findings is closed. The owner pointed out the floor-plan pages print their own unit-identifying caption at the bottom, and asked why matching wasn't done from that — turns out the router already asks the model for exactly this caption, it just gets thrown away the moment page routing is confirmed (never persisted past the draft stage; proposed as a follow-up, not built this round, see `DECISIONS.md`). Read three screenshots the owner sent to get the exact captions for pages 21, 24 and 27; the other 7 of 10 follow directly or by elimination (the count and sequence leave exactly one slot each, matching the six `unit_variants` already on record). Attached all ten brochure pages to their exact unit type via "Use as image" and published.

**A second gap found on the way:** there was no way to add brochure pictures to an edit of an _already-published_ property at all — the pages screen requires the submission being edited to own an OCR job, and a fresh "Edit this property" submission never has one. Fixed (`src/lib/ingestion/queries.ts`): it now falls back to the same property's most recent brochure from an earlier submission, the same cross-submission pattern already used for RERA checks. This was blocking, not just for Maruti 360 — any already-published property was in the same position.

**Verified:** typecheck, lint, prettier, the full suite (129 files, 1542 tests); confirmed in the database that all ten floor plans are live and correctly tied to their unit type (each an exact match against `unit_variants.variant_name`, so a typo would have been refused by the publisher, not silently misassigned).

**Not done:** persisting the router's caption past page-routing confirmation, so this class of problem does not recur on a future brochure — proposed, not built, see `DECISIONS.md`.

## 2026-09-22 (later) - The field-contract gap is closed; found and fixed a real jsonb data-corruption bug on the way

**Done (`docs/tasklists/2026-09-22-field-contract-gap.md`), after you approved building it:** `property.pincode`, `property.launch_date` and `property.rera_project_land_area_sqft` are now real, writable contract fields (the columns already existed; nothing could ever write them). Pincode is dual-sourced like possession date (brochure or RERA); launch date is brochure-only (RERA has no such field); RERA project land area is RERA-fetch-only on purpose, never asked of the OCR model, because it is specifically RERA's own registered figure and must stay independent of the brochure's plot area. `rera_registered` is now derived at publish time from whether a registration number is on record, rather than a dead column that defaulted false forever; an edit that does not even touch the number still backfills the flag if the property already has one, so old properties self-heal on their next edit.

**A real bug, found while re-applying this to Amaris:** publishing failed with "pincode must be a non-empty string" even though the stored value was genuinely a string. Root cause: the database driver (`postgres`) already parses `jsonb` into JS values, but Drizzle's own `jsonb` column parses it _again_, which silently turns a JSON string whose own text is also valid JSON — a six-digit PIN code, `"true"`, `"null"` — into a different type. Nothing else in the schema stores a bare scalar in a `jsonb` column, so this had never been seen before pincode. Fixed centrally (`src/db/jsonb-types.ts`, applied to every database client); confirmed with a raw-driver probe and the full suite (129 files, 1542 tests, integration tests included) stayed green before and after.

**Applied for real, not just in code:** Kimana, Amaris and Maruti 360 were each taken through a real edit (RERA re-fetch, "Use RERA values", publish). Verified in the database and on the live comparison page: all three now read "Registered" and show RERA's project land area; Amaris also gained its pincode (Kimana's and Maruti 360's RERA records genuinely state none). Launch date stays "not stated" on all three until a brochure is re-run.

**Verified:** typecheck, lint, prettier, the full suite (129 files, 1542 tests, integration tests included since Docker was up); real Chrome checks of the admin RERA panel and the buyer comparison page on all three properties.

**Not done:** launch date is still unfilled on the three live properties (needs a brochure re-run, not part of this task).

## 2026-09-22 - Six of the seven comparison-review findings fixed; the field-contract gap and Maruti 360's floor plans flagged for you

**Done (`docs/tasklists/2026-09-22-comparison-review-fixes.md`):** (1) **Derived facts.** The comparison now fills in possession status from RERA's declared progress (Kimana reads "Under construction" instead of blank, using the same rule the admin panel already states) and treats a property as RERA-registered whenever a registration number is on record (all three now read "Registered"). Both are display-only, scoped to the comparison table, no write and no schema change. (2) **Maruti 360's missing progress: not a bug.** Read its `rera_fetch_jobs.fetched_payload` directly: GujRERA's own record states `"gaps": ["construction progress"]` for its latest filing. The panel's "RERA silent" was already correct; nothing to fix. (3) **Floor plans:** the comparison now falls back to plans published with no unit type tied, instead of always saying "Not stated" when none match the exact type. **But Maruti 360 specifically has zero floor-plan pictures published at all** (only 2 photos) — ten brochure pages were routed and confirmed as floor plans during extraction but "Use as image" was never run on them; that needs a person to match each page to a unit type, so it is flagged below rather than guessed. (4) **The bottom tray no longer shows on `/compare`.** (5) **Rooms are one per line**, each with an area beside its dimensions: the room's own printed area if the brochure stated one, else the sides multiplied together, rounded, and labelled "calculated from the sides" — a narrow, room-only exception to "never derive an area basis from another" (carpet, built-up and super built-up are untouched; recorded in `DECISIONS.md`). (6) **Audit:** total floors was a real gap (the publisher already writes it; it was just never read back to buyers) and is now a comparison row; added Locality, City, Pincode, RERA land area and RERA carpet-area range rows (the last three are wired but stay correctly hidden until any property actually has that data); added an "Other rooms" row so dress/store/puja/servant/duct rooms are shown by their printed names instead of silently dropped. Launch date and per-type unit counts were already rows, not gaps. (7) **Section headers no longer show "N differs" / "N facts."**

**Verified:** typecheck, lint, prettier, and the full suite (129 files, 1542 tests, integration tests included since Docker was up); real Chrome checks of `/compare` on Kimana, Amaris and Maruti 360 together (all seven findings above confirmed on screen, no console errors).

**Not done, flagged for you:** (a) the field-contract gap from the review (`property.rera_project_land_area_sqft`, `property.pincode`, `property.launch_date` have no `property_schema_fields` keys, so a submission can never fill them for a real property, and `rera_registered` is never written true at publish time even when a number is confirmed) — this changes publish logic per `AGENTS.md` and needs your review before I build it; (b) Maruti 360's floor plans need an admin to run "Use as image" on brochure pages 20 to 29 and assign each to its unit type.

**Also noted mid-session:** on the router-prompt idea for amenity marketing spreads (the next item in the queue), you asked whether the router could extract a spread's headline itself instead of a separate extraction pass, since it already reads every page once. Agreed as the right shape: the router already pays for reading each page, so a candidate label for a genuinely simple "one headline, one photo" spread costs nothing extra, and it would still go through the amenity catalog/synonym match (never free text) and the normal admin confirmation before anything is written. A page listing several amenities together still needs the real extraction pass. I'll build this into the router-prompt tweak, before the approved paid test runs, so the test measures the improved version.

**State:** everything above is on `task/phase-2a-completion`, uncommitted as I write this entry (commit pending); nothing merged or pushed.

## 2026-09-21 (late night) - Comparison review findings and approvals: pending work, nothing built yet

**Approvals from the owner (this round):** (1) schema v10 for **private amenities on a unit type** (penthouse pools): approved. (2) the **paid categorization test** of the lighter copy on the 360 brochure (a few cents): approved. (3) **Report a problem**: keep pending; build a placeholder only (a dialog or contact page saying the contact email is coming), no storage, no table; the address is not chosen yet. Earlier approvals still to build: the **intake cookie** (defaults given on 2026-09-21) and **comparison analytics** (events table, no user id, no IP, no price).

**Owner's questions and findings on the comparison (three properties: Maruti 360, Amaris, Kimana) - all PENDING:**

1. **Derive related facts from each other.** Possession status reads "Not stated" on Kimana although its RERA progress is 67.7%. Rule already stated for the RERA panel (below 100% is under construction, 100% ready to move): apply it wherever status is empty and progress is known. Same idea for **RERA "Registration"**: `rera_registered` is false on all three properties although each has a verified registration number; a number on record should read as registered. Look for other related pairs.
2. **Progress missing.** Maruti 360 shows none: its RERA record returned no progress (the panel said "RERA silent"); check the fetched record (`rera_fetch_jobs.fetched_payload`) and the GujRERA quarterly filing to see whether it is there and the adapter missed it. Amaris shows 0% (that is what RERA states); confirm.
3. **Maruti 360 floor-plan row says "Not stated" wrongly.** The row only shows plans whose picture is tied to the compared unit type; Maruti's plans are probably tied to none or to another type. Check its `property_media`; show plans not tied to a unit type instead of "Not stated".
4. **The bottom compare strip should not show on the comparison page** (hide the tray on `/compare`).
5. **Room formatting:** one room per line, not separated by semicolons; and show the **area in sq ft** beside each room's dimensions (length times width, or the stored `area_sqft` if present; label it as calculated from the sides). This reverses my earlier "no area from sides" note for rooms only (carpet, built-up and super built-up are still never derived from each other); record it in DECISIONS.
6. **The table leaves out data that exists.** Audit each property against its extraction and brochure. Known gaps: total floors, land area, pincode, launch date, RERA carpet range, locality and city rows, "other" rooms (dress, store, puja, servant, duct) which the room-by-room rows drop, unit counts per type, balcony counts.
7. **Remove "1 differs" and "N facts" from the section headers.**

**Structural finding behind 6:** the field contract (`property_schema_fields`) has no keys for RERA land area, pincode, launch date or carpet range, so those columns on `properties` can never be filled from a submission (the RERA panel shows land area and pincode "for reference, not written"). Proposed: add `property.rera_project_land_area_sqft`, `property.pincode`, `property.launch_date` (and derive `rera_registered`) to the contract and to RERA's authoritative fields. **This changes publish logic, so it needs the owner's review** (AGENTS.md); existing properties then need an edit that re-applies RERA.

**Answer to "will the amenities miss happen on the next brochure?":** partly fixed. Amenities named on a project-details page (like a site plan) are now read automatically. Marketing spreads that only carry a headline and a picture (pages 11 to 17 of 360) depend on the categorizer labelling them amenities; the router prompt should be told to treat such spreads as amenity pages. Pending: tweak the prompt, then run the approved paid test on a fresh upload of the 360 brochure and compare with the categories already confirmed.

**Remaining queue, in order:** the comparison fixes above; the router prompt tweak plus the paid test; schema v10 unit-level amenities (extraction field, publish write, dossier and comparison "Private amenities" row); the report-a-problem placeholder; the intake cookie; comparison analytics; the UI refinement round; paid re-runs of Amaris and Kimana. Also still open: the 80-unit figure on Amaris, a legal entity for Adani, Adani's About text, Kimana's penthouse layout type ("Not stated").

**State:** everything up to this point is committed on `task/phase-2a-completion` (last code commit `7e38842`); nothing merged or pushed; typecheck, lint, prettier and the suite (129 files, 1,539 tests) were green at that commit. The dev server may be running on port 3000.

## 2026-09-21 (night) - Page review reworked after the first paid run: no more freezing, plain words, lighter categorization, amenities from other pages

**Done:** (1) **The freeze:** the screen refreshed itself every 4 seconds and each refresh re-signed the brochure link, so the viewer re-downloaded the 62 MB file. It now keeps its first link and the status panel polls a tiny status endpoint every 5 seconds (not while the tab is hidden), refreshing the page only when the status changes; checked in Chrome on the 360 brochure: 2 requests for the file, 15 thumbnails drawn, none failed. (2) **Progress you can see:** a spinner and a moving bar while pages are being read, and a spinner panel while categorizing. (3) **Wording:** no provider name and no "queue": Save your page choices, Read the pages, Start reading. (4) **Layout:** Use as image is a roomy dialog; the card says "Added · Review" on one line; the RERA comparison table keeps its tags on one line; thumbnail frames take the page's own shape and at most two pages are drawn at once. (5) **Lighter categorization:** the categorizer gets each page as a 1600 px JPEG in a new PDF (59.2 MB to 2.6 MB on the 360 brochure, one request instead of nine, site-plan labels still crisp). (6) **Amenities:** the 360 brochure's amenities were on pages the amenities step never saw (11, 13, 14, 15, 17, and the site plan on page 19, which had been routed to project details). The amenities step now also reads the project-details pages. Tasklist: `docs/tasklists/2026-09-21-page-review-ux-and-lighter-categorization.md`.

**To re-run only the 360 amenities (cheap):** open the pages screen, choose Edit pages if offered, add pages 11, 13, 14, 15 and 17 as amenities (page 19 is read through project details now), save the choices and read the pages again; the worker reuses the saved answers for steps whose pages did not change and asks only the amenities step. Not done by me: no paid call was made.

**Verified:** typecheck, lint, prettier and the full suite (129 files, 1539 tests); Chrome on the 360 pages screen (no console errors, 15 thumbnails drawn, none failed, 2 requests for the brochure); the lighter copy measured on the real brochure. Also found on the way: the 360 page-19 site plan carries the amenity labels, and reading a confirmed routing back had to be changed so the project-details pages keep their category (tested).

**Not done:** no paid call was made by me; the paid categorization test of the lighter copy is waiting for your go-ahead. Private amenities on unit types (penthouse pools) is a proposal only. Still open from before: the intake cookie, the "report a problem" dialog (needs the contact address), comparison analytics (schema v10 events table, approved), the UI refinement round, the Amaris and Kimana paid re-runs.

**Asks:** approve schema v10 for private amenities on a unit type (penthouse pools; see the tasklist), and give the go-ahead for a paid categorization test of the lighter copy on 360 (a few cents).

## 2026-09-21 (evening) - First paid categorization: a stalled request and two small bugs fixed

**Found:** the owner's categorization of the 360 brochure failed when the third window stalled for the full 240 seconds; two windows had answered (about $0.0017). A timeout was never retried, so the run failed and the answers were lost. **Fixed:** a stalled request is retried once (timeout now 2 minutes). Also fixed: brochure page thumbnails in the admin grid no longer sit in tall portrait frames (a permanent minimum height), and a test was leaving fake $0.0042 rows in the usage ledger; 38 of them were deleted after checking each was a stub (the real total is $0.80, not $0.96). No provider call was made by me at any point; the deduction the owner saw was their own run, and the stalled request may still have been billed after the client gave up. Tasklist: `docs/tasklists/2026-09-21-router-timeout-thumbnails-ledger.md`. Still to build once the owner says go: the intake cookie (with the defaults given), the "report a problem" dialog (needs a contact address), and comparison analytics (schema v10).

## 2026-09-21 (later) - Amaris live; comparison slices 2 and 3; Phase 3 buyer flows built; three items held for you

**Done:** (1) **Amaris is the second real property.** Its saved 2026-09-02 extraction was replayed through the worker's own persistence function (no provider call), RERA was fetched with your registration number and applied (Block A's 2,160 sq ft matches the brochure's 2,159.9), six brochure pages became credited pictures (four photographs, two floor plans tied to Tower A Type A) through the existing "use as image" route, and it was published through the normal Publish. It is a stand-in: one unit type of about twelve, older pipeline. (2) **Decisions recorded:** tagline "The right home is a comparison away."; amenity icons allowed; terms and privacy deferred to just before deployment (`docs/production-readiness.md`). (3) **Comparison slice 2:** room by room (kinds read from published names, sizes as stated) and floor plans side by side in the zoomable viewer. (4) **Slice 3:** focus chips that only reorder (in the address, preselected from intake priorities, never the range), Save this comparison, `/saved`. (5) **Phase 3 flows:** Save on the dossier, an enquiry form that records the phone-verified unlock and then the enquiry, and an admin inbox (`/admin/enquiries`) where an enquiry can be marked contacted or closed. Driven in a real browser: sign-in with a dev OTP, save, enquiry, saved comparison, `/saved`, and the admin inbox. (6) **AGENTS.md audit:** tasklists written (late, and marked so): `docs/tasklists/2026-09-21-amaris-second-property.md`, `2026-09-21-phase-3-buyer-flows.md`; DECISIONS, api-spec, roadmap and the comparison spec updated; no AI trailer on any commit; no live table written outside the publish; no schema change; sign-in and gallery shadows removed and the enforcement test widened to catch them.

(7) **Developer identity:** a public profile at `/developer/{id}` with the developer's listed projects, linked from the dossier and from each comparison column, so same-named developers can be told apart (cards keep the name as plain text). The brochure narrative is not shown yet, so About reads "Not stated" on Adani.

**Verified:** typecheck, lint, prettier, and the full suite (see the last run below); real-browser runs of the buyer flow, the admin inbox and the developer profile.

**Held for you (not built, not guessed):** the pre-login intake cookie (its tasklist requires answers first, and it stores the stated budget range server-side), report a problem and claim this listing (a `listing_reports` table is a schema change; claim belongs to the on-hold developer portal), and comparison analytics (an events table and a privacy position). Phase 3 is not fully closed until these are decided. Also open: the 80-unit figure on Amaris (RERA lists 40 flats per block at that size), a legal entity for Adani, the paid unit-aware re-run of Amaris and Kimana when credit is added, and the UI and flow refinement round you planned after Phase 3.

## 2026-09-21 - Admin flow driven in a browser; visual pass built (foundations, landing, cards, browse, dossier, comparison, intake)

**Done:** (1) **The admin flow works end to end in a real browser:** a throwaway property went from nothing (new developer, manual draft, inline fields saved on leaving each one, Next through each section, a unit type with an area, a picture) to published through the one-step Publish, which named the five unconfirmed values and asked; the buyer page rendered with no price. The previously stuck approved submission opens, is editable and offers Publish. The throwaway was soft-deleted (404 for buyers). Two small fixes from it: a new draft's picture list no longer says "proposed in this edit", and an already-approved picture no longer offers Approve. (2) **A design language** (`docs/design/no-vibecoded-tells.v1.md`) from the owner's 30-tells list, with a test for the mechanical rules. (3) **Visual pass:** foundations (type scale with a hero size and an italic accent word, tonal layers, no shadows, an xl button); the **landing page** (split hero with Kimana's real photograph, "Choose the right home, side by side." as a provisional tagline, a real excerpt of a comparison from published facts, "how you decide" as a numbered list, recently published cards, "read from brochures, checked against RERA" copy, the no-price band); **cards** (RERA-registered chip and Compare on the image); **footer** copy corrected; **browse**; the **dossier** (photograph plate with title over it, credit line, key-facts band, photos and floor plans open and larger, a sticky side stack with "N of M facts stated" and a jump list); **comparison** columns lead with a photograph; **intake** heading; skeleton loaders on the four data routes; em dashes removed from buyer copy. (4) A phone-width overflow on the dossier was found in the browser and fixed.

**Verified:** typecheck, lint, prettier and the full suite (120 files, 1484 tests); real-browser screenshots at desktop and phone width for the landing, browse, dossier, intake and compare pages (no page errors, no horizontal overflow).

**Not done / needs you:** the tagline is provisional; amenity icons are undecided (the amenity list stays text); terms of service and a privacy policy are not written (owner counsel); the comparison with two or more properties was not re-inspected visually (only one real property exists, and more with good pictures are yours to add); the intake step cards were not restyled beyond the heading. Still blocked as before: OpenRouter credit, the acceptance checks, publish-logic review, the RERA email, the merge decision. Next: comparison slices 2 to 4, developer identity where a name appears, then the Phase 3 remainder.

## 2026-09-20 (end of session) — Admin flow reworked; pending list and handoff

**Done this stretch:** (1) **The stuck-submission bug and editing at any stage.** Editing and reviewing (fields, pictures, RERA) now work in draft, submitted, in review, changes requested and approved; only published and rejected are closed (a published property is changed by "Edit this property"). (2) **One Publish for an owner**: from any of those stages in one action, each transition still recorded; anything unconfirmed is named first (409 with counts) and confirming it is a deliberate choice. (3) **Pictures an admin adds or picks from a brochure are approved and public by default** (still rejectable), so nothing waits on a review nobody can do. (4) **Inline fields**: no Edit button; each field is an input that saves when you leave it ("Saved"), status tags sit right-aligned on one row with the name, Confirm/Reject beside the status. (5) **A guided path**: a progress line and bar, "N/M" on each tab, a primary "Next: <section>" and a secondary "Save draft and leave" at the end of every section, "Go to publish" on the last. (6) **Version history moved to the end of the page.** (7) Earlier in the session: comparison slice 1, pictures taken off a live listing (schema v9), nothing admin-only, sign-in redirects, RERA carpet area, buyer GujRERA source lines, and more (see the entries below). **Verified:** typecheck, lint, prettier, the full suite (119 files, 1456 tests). **Not verified in a real browser:** the new admin flow end to end (only unit and integration tests); please try it (see `docs/testing/owner-acceptance-checks.md`, section B).

### Pending, everything, as of this handoff

**Blocked on the owner:** OpenRouter credit (no brochure can be categorized or extracted until it is added); adding 2 to 3 more properties with good pictures (Amaris suggested); choosing the hero tagline; running the three acceptance checks (developer name, scheduler draft, removed unit types) plus the new ones in `docs/testing/owner-acceptance-checks.md`; reviewing the flagged publish-logic changes; the email to inforera@gujarat.gov.in; the brochure spot-check and paid re-run of the unit-aware prompt (deferred by the owner); agreeing the merge to `main` and the push.

**Next to build, in order (tasklist `docs/tasklists/2026-09-20-visual-pass-and-admin-flow.md`):**

1. **Real-browser check of the new admin add flow** from nothing to published, plus the previously stuck submission (unit tests pass; nothing has been driven in a browser yet).
2. **Visual pass** (image-led, like Stitch; `docs/design/visual-direction.v1.md`): foundations (type scale, cards, chips, icons, hero treatment); the **landing page** (split hero, a large real property photo, expressive tagline, "how you decide" icon cards, featured properties with Compare buttons; copy must not say facts come from "developer submissions and RERA records": they come from developers' brochures and are cross-checked with the RERA register; make the landing lead the visitor to compare side by side); **browse cards**; the **dossier** (hero image with title and actions over it, gallery mosaic, key tiles, sticky side stack, amenity icons, facts-completeness ring, pictures not collapsed); the **comparison restyle**; **intake and shortlist**. The footer copy needs the same accuracy fix.
3. **Tagline:** "Compare homes, not brochures." was rejected (the data is extracted from brochures). Candidates: "Choose the right home, side by side." (with "side by side" in the accent colour), "Two homes. One clear decision.", "The right home is a comparison away."
4. **Comparison slices 2 to 4:** room-by-room, floor plans side by side; focus chips from intake, saved comparisons and the shortlist page; analytics (`docs/design/comparison.v1.md`).
5. **Developer names are not unique** (profiles separate them): the developer profile and project list should be visible wherever a name is shown (dossier, compare "Developer" row) so two same-named developers can be told apart.
6. **Unit types tab** still uses a Save button inside its open editor (areas and rooms are too large to save on blur); revisit if it should auto-save.
7. **Developer-facing screens** for their own edits, listing requests and pictures (the library is ready and tested; the developer portal is on hold by owner decision).
8. **Phase 3 remainder:** saved properties, enquiries with an admin inbox, "claim / report a problem / last checked" (partly done: buyer GujRERA source lines), the intake cookie claim, the OTP unlock; then Phase 4 (developer portal, analytics) and Phase 5 (admin MFA, SMS provider, backups, deployment; `docs/production-readiness.md`).
9. **Smaller:** run the RERA scheduler once against the live site through the tests above; RERA failure alerting by email (the queue already shows a notice); Amaris is not in the local database (its carpet areas were read live and matched; nothing applied); the `usage/ledger` integration test is intermittently flaky when other files write usage at the same moment (an existing race); `.local/` (scratch, screenshots, logs, storage) is now ignored by git.

## 2026-09-20 (late night, 6) — Pictures can be taken off a listing; nothing is admin-only

**Done:** an edit can now take published pictures off a listing (schema v9, migration 0013, applied locally): the edit's Images tab shows what is live and a "Take off the listing" / "Keep this picture" control on each; publishing hides them from every buyer surface (dossier, media route, browse card image); replacing is removing plus adding. **Nothing an edit can do is admin-only any more:** those fields are renamed "edit-only" (a description, not a permission); a developer can ask for any edit on their own property (own property only) and it waits for an admin to approve, proven by tests including a developer trying to approve their own request. **Developer names are not unique** (profiles separate them), so the duplicate-name guard is dropped. **Comparison:** the "show only differences" switch is gone. **Amaris:** read live with the RERA number you gave: four blocks, twelve carpet areas, no gaps (it is not in the local database, so nothing to apply). **Not built:** the developer-facing screens and routes for these requests (the developer portal is on hold); the tests you were to run (developer name, scheduler draft, removed unit types) are listed in the chat.

## 2026-09-20 (late night, 5) — The comparison exists (slice 1)

**Done:** a buyer with no account can press **Compare** on any property card or dossier (up to **three**), see them in a tray at the bottom, and open `/compare`: a summary of what changes between the choices, only the rows that differ (with "N identical facts hidden" and a switch to show them), missing facts said plainly, size bars, a GujRERA-checked marker, a sticky header, **unit type switching inside the table** (instant, the link updates), **collapsible sections**, and a phone layout that shows two at a time with the label above each value. The link is shareable. **Verified:** typecheck, lint and prettier clean, the full suite (see below), and a real browser on Kimana plus throwaway properties (deleted) at desktop and phone width. **Not built yet:** room-by-room and floor plans side by side, focus chips from intake, saved comparisons and the shortlist page, analytics. See `docs/tasklists/2026-09-20-comparison-experience.md`.

## 2026-09-20 (late night, 4) — Comparison marked as the product; its UI did not exist

**Finding:** the comparison feature has an API (sign-in required) and nothing else: no "Compare" button, no tray, no page. It had been left as a Phase 3 UI slice for Deep, and I listed Phase 3 as "next" without saying the product's core screen was missing. **Done now:** `AGENTS.md`, the PRD, the roadmap and `DECISIONS.md` state that comparison is the product and comes first; `docs/design/comparison.v1.md` specifies the experience (researched from Baymard and Nielsen Norman, and pushed beyond them: like-for-like unit types, differences first, an honest "what changes if you choose A over B", provenance, no price or score); a tasklist is written. Also this session: browser-style tabs with trimmed unit-type names, a real-database test of the media route (it found a 500 on a malformed id, fixed), RERA failure notice on the admin queue, and sign-in redirects.

## 2026-09-20 (late night, 3) — Media route tested for real; tasklists reconciled

**Done:** a real-database test of `GET /api/v1/media/{id}` (a live picture redirects to a signed link for its own object; unknown, removed-unit-type, unlisted and deleted pictures are 404). **It found a bug:** a malformed id (for example `abc`) made Postgres refuse the comparison and the route answered 500; it is now a 404. The edit-published, RERA-sync and submission-media tasklists no longer show finished work as open. **Still open, and needing your call:** a published picture cannot be removed or replaced by an edit (a soft-removal column on `property_media` would be needed, so a schema change), and renaming a developer to another developer's name is allowed (the planned duplicate-name guard was never built).

## 2026-09-20 (late night, 2) — Sign-in redirects

**Done:** opening `/admin/login` (or `/developers/login`) while signed in with the right role now goes straight on to the page you were headed for, or the portal home, and never honours an off-site `next`. Any `/admin/...` or `/developers/...` address, real or not, sends a signed-out person to that portal's login and brings them back afterwards. A signed-in admin at a made-up admin address sees a plain not-found. Checked in a real browser and by tests.

## 2026-09-20 (late night) — Buyer pages credit GujRERA

**Done:** the buyer dossier shows a muted "Source: GujRERA, checked 20 Sep 2026" under a fact, only when the regulator's record at the last successful check stated exactly the published value: registration number, construction progress, possession date and unit count. It never appears on a brochure-sourced or differing value, on possession status (derived by us), or when the record was never checked. The API's `rera` object gains `lastCheckedAt` and `sourcedFacts`. On Kimana all four facts are credited. **Verified:** typecheck, lint and prettier clean, the full suite (109 files, 1352 tests), and a look at Kimana's page in a real browser. **Still open:** the email to inforera@gujarat.gov.in about the Copyright Policy wording (yours to send).

## 2026-09-20 (night) — RERA carpet area per unit type, buyer configurations as tabs, GujRERA terms reviewed

**Terms:** I read GujRERA's Terms & Conditions, Copyright Policy, Disclaimer, Privacy and Hyperlinking pages in a real browser (the site is a JavaScript app) and its robots.txt (none). **Nothing forbids periodic reading**, and nothing mentions automated access. Reuse is allowed if the data is accurate, not misleading, and the source is acknowledged; the Copyright page says "after due approval" while the Disclaimer says no permission is needed. Two soft items: show "Source: GujRERA, checked on …" wherever RERA facts reach buyers, and email `inforera@gujarat.gov.in` for written confirmation. Details in `DECISIONS.md`; this is a reading of the pages, not legal advice.

**Carpet area (yes, built):** the RERA panel now offers each unit type RERA's carpet area, from the site's per-flat list (only flat number, carpet area and usage are read; prices, buyers' names and phone numbers are never kept). On Kimana, live: 3,977.70, 3,977.70, 6,163.31, 2,984.40, 2,984.40 and 4,986.27 sq ft for the six types, each shown with "rooms add up to X" against it (flagged only beyond 30%; never stored). It goes through "Use RERA values", and the scheduler proposes it as a draft. **Found and fixed:** removed unit types were still listed to edits.

**Buyer page:** the configurations are one card with a tab per unit type (checked at desktop and phone width on Kimana).

**Verified:** typecheck, lint and prettier clean; the full suite passes (107 files, 1338 tests). Checked by hand: the live adapter and the admin panel in a real browser on a throwaway draft (deleted; Kimana's live listing unchanged). **Not verified:** Amaris live (its registration number is not in the repo).

## 2026-09-20 (end of day) — Phase 2A is built; closing needs your review

**Done:** the quarterly RERA refresh. A worker finds each published property whose RERA record does not yet show the latest closed quarter's filing, checks GujRERA (weekly until it shows, with a growing delay after failures), and, if RERA differs from what is live, opens one draft edit "From RERA" with RERA's values marked "needs review". It never writes a live table, opens no draft when nothing differs or an edit is already open, and does not raise a change you already rejected. It is **off** until you set `RERA_WORKER_ENABLED=true` (or run `bun run rera:worker`). The versions list on a property's submission screen now shows what each published edit changed, was → now. The stale parent tasklist is reconciled and a closing tasklist written (`docs/tasklists/2026-09-20-close-phase-2a.md`). `bun run lint` now ignores `.local/` scratch files.

**Verified:** typecheck, lint and prettier clean; the full suite (105 files, 1288 tests) passes, with one exception seen in 1 of 7 runs: `usage/ledger.integration.test.ts` compares database-wide totals before and after and can be thrown off by another test file writing usage at the same moment (an existing race, not from this work, not yet fixed). Not run: the scheduler against the live GujRERA site (it is off), and a browser look at a scheduled draft.

**Needs you before the phase closes:** review of the publish-logic changes (removal, unlist and delete, `developer.name`, and the scheduler creating drafts); the field-by-field spot-check; your go-ahead for a paid brochure re-run to test the unit-aware prompt; a yes or no on RERA per-flat carpet area; then the merge to `main`. I have not merged or pushed.

## 2026-09-20 (late night) — Zoomable pop-up pictures; carpet area finding

**Done:** the buyer pop-up carousel zooms and pans each picture (buttons, wheel or trackpad pinch, double-click or double-tap, +, - and 0 keys, drag, two-finger pinch); checked in a real browser on Kimana's floor plans and at phone width; committed. **Carpet area:** it cannot be calculated from room dimensions. Against Kimana's real RERA figures the summed room sizes are off by -15% to +18% per unit type, and two flats with the same RERA carpet area sum differently, so a calculated value would be a guess dressed as a legal figure. **Proposed instead, waiting for your yes:** take carpet area per flat from RERA (exact, free) and show an admin-only "rooms add up to X, RERA says Y" cross-check that would have caught the metres bug. Details in `DECISIONS.md` and `docs/tasklists/2026-09-20-zoom-and-carpet-area.md`.

## 2026-09-20 (night) — Exact units, thumbnails, removal, and unlisting

**Done:** **Units are now exact.** Kimana's room sizes were metres saved as feet; the cause was structural (the extraction prompt named fields in feet, never asked for a unit, and nothing converted). Now the model reports what is printed plus its unit, one function converts to feet and square feet exactly, a number with no printed unit is left out (never assumed), and conversion happens once (proved by tests). Kimana's 171 rooms across 6 unit types were corrected through the publish path (the script refuses to run twice). The admin warns when sizes look like the wrong unit. Extraction also could never read plot area (a missing data type); fixed. The gallery cards use real thumbnails (88 KB instead of 1,551 KB on Kimana). An admin can remove amenities and unit types from a live listing, and an owner can unlist, soft-delete and restore a property: all soft, all through review and publish, and hidden from every buyer surface at once (schema v8).

**Verified:** lint, typecheck, prettier and the full suite (100 files, 1233 tests); real-browser checks of the listing controls, removals and thumbnails on a throwaway property (deleted afterwards) and on Kimana (unchanged apart from the corrected dimensions).

**Flagged for your review:** removals and listing status change publish logic and can hide a property from buyers (13 integration tests prove every buyer surface, but AGENTS.md asks for review); the earlier "additive amenities" rule was reversed at your direction. Details in `DECISIONS.md` and `docs/tasklists/2026-09-20-units-thumbnails-removal-listing.md`.

## 2026-09-20 (evening) — Owner feedback round 1: fuller RERA, editable unit types, tabs, queue terms, buyer gallery

**Done:** the RERA record now carries land area, project description, blocks, parking, pincode and a swimming-pool declaration; possession status is derived from RERA progress by a stated rule and a declared pool is added to the amenities (never removing any). Measured on Kimana and Amaris: RERA has **no amenities list** and its blocks and slabs are not tower and floor counts, so those are shown and not written. The edit screen is tabs; every field starts from its published value with a small "Unchanged" mark; unit types are edited in tabs with room dimensions (rooms, balconies, foyer) now editable, published types keep their names and cannot be removed; a developer's name can be corrected by an edit. The queue shows one row per property with a Change column (New listing or Update to a live listing), the data source beneath it, and "Current listing stays live"; a submission lists every version of its property. The buyer page shows photos and floor plans as separate expandable sections of small cards with a pop-up carousel. The developer list's Team and Properties counts were always 0 (a Drizzle subquery bug); fixed.

**Verified:** lint, typecheck, prettier, the full suite (95 files, 1084 tests); real-browser checks on Kimana (gallery 14/14; admin queue, versions, RERA re-fetch and the unit-type editor). My test drafts were removed and Kimana's live data was not changed.

**Flagged for your review:** the publisher now applies `developer.name` on edits of an existing property (AGENTS.md asks to surface publish-logic changes). Removing an amenity or a unit type from a live listing is not supported and needs your decision. Kimana's room dimensions look like metres stored as feet: please check against the floor plans. Details in `DECISIONS.md` (2026-09-20) and `docs/tasklists/2026-09-20-owner-feedback-round-1.md`.

## 2026-09-20 (later) — RERA fetch built and checked against the real GujRERA; edit a live property

**Done:** an admin can enter a RERA registration number on any draft, or on an edit of an already-published property, and fetch the record from GujRERA. The screen shows the record (promoter, registration and completion dates, latest quarterly filing, when it was checked) and each field beside what we hold, with "Differs from RERA" flagged and never blocking. "Use RERA values" (behind a confirmation) writes them as confirmed fields; the draft is still reviewed and published as usual. "Edit this property" on a published submission starts an edit that shows each published value and keeps everything not changed. Schema v7 (approved) added the regulator, project, submission, requester and error to `rera_fetch_jobs`. Regulators are adapters keyed by code, so another state is one new adapter.

**Verified:** typecheck, lint, and the new unit, database, route and component tests (see the run at the end of this session); `scripts/verify-rera-fetch.mjs` in Chrome against live GujRERA and Kimana, 16/16, with the live property untouched.

**Bugs fixed on the way:** the buyer email check rejected any address with an "s"; duplicate room names broke the dossier's keys; GujRERA needs legacy TLS renegotiation (allowed for that host only); a migration timestamp made drizzle skip 0011 silently; my first test run leaked test rows (cleaned).

**Not done:** the quarterly refresh worker, automatic `rera_scrape` submissions, the developer-facing entry, buyer "last checked", area and type mapping, editing unit types and pictures of a live property, and applying `developer.name` on publish. Details in both 2026-09-20 tasklists and `DECISIONS.md`.

**Note for your own test:** the dev server I used is stopped and the edit draft I made on Kimana is deleted; Kimana's live row is unchanged (no RERA number yet). The admin login is in the earlier chats: `admin@propcompare.test`, and the throwaway local password used by the verify scripts.

## 2026-09-20 — Work committed; edit-after-publish and GujRERA planned (no code yet)

**Done:** the previous session's uncommitted work is now three commits on `task/phase-2a-completion` (extraction worker and hardening; developer legal entities and "confirm all remaining values"; the first live property with buyer images and docs). Typecheck passes on the tip; the three commits were not each built in isolation. `next-env.d.ts`, `drizzle.config.ts` and `.tmp-ocr-live-smoke.ts` (generated or line-ending noise) and the `drizzle/meta/0000–0003` snapshots were left uncommitted.

**Planned, not built:** the owner is running their own brochure → database → live test first, so coding waits. Two tasklists were written from the owner's answers: `docs/tasklists/2026-09-20-edit-published-properties.md` (every detail editable after publish, through approval again; found that nothing creates an edit of an existing property and that `developer.name` is never applied by the publisher) and `docs/tasklists/2026-09-20-gujrera-regulator-sync.md` (admin-supplied RERA numbers, RERA wins with a visible "differs from RERA" flag, quarterly due-based refresh, regulator adapters so other cities can be added). Three decisions are logged in `DECISIONS.md` 2026-09-20; `ARCHITECTURE.md` has a short regulator-sync note.

**Researched:** GujRERA promoters file quarterly reports in fixed windows for all projects (1–7 Jan/Apr/Jul/Oct), with daily late fees since Jan 2025 and past extensions by order. Press sources only; the site's structure and terms were not inspected.

**Waiting on the owner:** the result of their end-to-end test; whether an admin may approve their own edit; approval of an additive `schema.v7` for `rera_fetch_jobs` when that work starts. After that, the earlier queue: buyer retention, enquiries and inbox, claim / report / last checked, intake cookie.

## 2026-09-19 (later) — The first real property is live, end to end through the UI

**Done:** The Kimana Towers (Sun VN Developers LLP) went from brochure upload to live on the buyer website entirely through the admin screens: upload, categorize, confirm pages, Claude extraction, review, approve, publish. Verified in a browser: it is in the browse list with its exterior picture, its dossier opens, all nine images (exterior render and eight floor plans, each tied to its unit type) load with their credit, and no price appears (`scripts/verify-property-live.mjs`, 7/7). Kimana's extraction found 6 unit types with full room lists; the brochure gave no property type, possession, RERA number, amenities or BHK types, so those are honestly "not stated" except property type (Apartment) and the legal entity, which were set by hand.

**Built along the way:** the extraction worker was proven with a real server kill (interrupted, then retried to completion); the real run exposed that a strict check threw away a paid answer, so raw answers are now saved before validation, retries reuse them, and messy output is mapped rather than rejected (free rehearsal with replayed real answers; a rolled-back publish dry run). "Confirm all remaining values" for review. Buyer card and dossier now show pictures. Publishing refreshes the cached buyer pages. Developer legal entities (schema v6 §3, migration 0010): record name, type and RERA promoter number, pick one per property during review, admin-only for now. Brevo confirmed delivering. The test data was cleared from the queue (19 drafts, 26 developer profiles).

**Cost:** Kimana Towers cost about $0.77 in provider spend, of which $0.27 was wasted before the safeguards existed.

**Verified:** full suite, lint, typecheck and prettier (see the run at the end of this session); browser checks in Chrome (and Brave for the worker) against a stand-in provider and the real one.

**Not verified:** the owner's field-by-field spot-check of Kimana (the AI assistant confirmed the values after checking the name, developer, locality and specification evidence). Corrections go through a new submission.

**Next:** buyer retention (saved properties and comparisons), enquiries with an admin inbox, "claim / report a problem / last checked", the intake cookie, and GujRERA once scoped. Tasklist: `docs/tasklists/2026-09-21-first-property-live.md`.

## 2026-09-19 — Extraction worker: the whole flow now runs through the UI

**Done:** queueing a brochure no longer stops at "queued". A worker starts with the app server (and can run alone with `bun run ocr:worker`), claims queued attempts safely (two workers never run the same one), runs the Claude extraction and writes the draft fields with evidence. The submission and page-review screens show waiting / reading / finished / failed and refresh by themselves; a failure is explained in plain words, with "Edit pages" or a confirmed "Try again" (new `POST /api/v1/admin/ocr-jobs/{id}/retry`). A run whose server died is failed as interrupted after ten minutes without a heartbeat, so nothing spins forever. The known cost gap is closed: spend from scopes that succeeded before a mid-run failure now reaches the ledger. Developer invite links are also emailed through Brevo when configured (still shown on screen), and `format:check` is clean again.

**Verified:** 883 tests, lint, typecheck, prettier clean. `scripts/verify-extraction-worker.mjs` ran upload → confirm pages → queue → failure → Try again → finished → draft with evidence in Chrome and Brave, 18/18, against a stand-in provider (`scripts/stub-ocr-provider.mjs`), so no paid call. Tasklist: `docs/tasklists/2026-09-21-extraction-worker.md`.

**Not yet verified:** a real Claude run, a real Brevo email, and a process killed mid-run.

**Next:** load the first real brochure through the UI (the paid run, with the owner's go-ahead each time), including the human accuracy spot-check.

## 2026-09-19 — Brochure pages as images

**Done:** the router now reports how imagery sits on each page (`imageLayout`), and the page grid has "Use as image": the chosen brochure page is rendered on the server (WebP, 1600 px, ~150–250 KB) into a private, unreviewed image candidate credited to the developer, and appears in the submission's Images list for review like any other. The same page cannot be added twice, even under a race. Whole-page rendering was checked on a real dimensioned floor plan (Kimana p8) and a colour plan (Amaris p40): both legible.

**Verified:** 6 integration tests (including simultaneous adds), 8 renderer tests, UI and route tests, and `scripts/verify-page-image.mjs` in Chrome and Brave, 16/16 — upload, add page 8, add again (already done), preview loads at full size, credit and unit type shown. Full suite, lint, typecheck and format clean. No paid call was made.

**Added dependencies:** `sharp`, `@napi-rs/canvas` (native binaries; listed in `serverExternalPackages`). Decisions in `DECISIONS.md` 2026-09-20. Extracting single pictures from a busy page stays deferred.

**Next:** the Claude extraction live run on confirmed pages (paid; owner go-ahead needed), then the human field-level accuracy check.

## 2026-09-19 — Page categorization validated live

**Done:** with OpenRouter credits restored, "Categorize brochure pages" ran through the real admin UI on Kimana (18 pages, 15 s), Amaris (69 pages, 58 s) and 360 (29 pages, 74 s). The owner checked the categories by hand and confirms they are accurate. Total spend about $0.027, all visible in the admin Usage tab, none shown beside the action. One correction to my earlier reading: the Amaris page lists I compared against were an earlier router run, not a human answer, so that comparison shows repeatability only. `scripts/categorize-brochures.mjs` now passes the file by path (Playwright refuses 50 MB+ buffers; 360 is 62 MB).

**Next:** the layout hint on imagery pages and a whole-page "use as image" action; then the Claude extraction live run on the confirmed pages, and the human field-level accuracy check.

## 2026-09-19 — Developer invites

**Done:** an owner can invite someone to an existing developer profile from the profile's new Team panel. The invitation is a one-time seven-day link shown once (no email service yet); the invitee sets a password at `/developers/accept-invite`, is signed in, and the link is dead. The owner can issue a new link, withdraw an invitation, or remove access, which also ends the person's open sessions. An existing account is never repurposed, only a hash of the token is stored, and every bad link gets the same plain answer. Decisions in `DECISIONS.md` 2026-09-20.

**Verified:** 11 integration tests (including two simultaneous accepts), 13 route tests, and `scripts/verify-developer-invite.mjs` in Chrome and Brave, 18/18: invite, a wrong link, the real link, mismatched passwords, sign-in, link reuse refused, admin sees active, removal ends the session.

**Note:** what an invited developer sees after signing in is still the holding page. The developer-facing upload and review screens are deliberately not built yet: under the pre-launch model we upload everything ourselves, so they can wait until developers actually join.

**Phase 2A now:** everything not blocked is done except extracting brochure photos into the image list (needs a server-side PDF image extractor — a dependency decision) and GujRERA (to be planned). Blocked on OpenRouter credits: the live categorization test, then the OCR live run and accuracy spot-check.

## 2026-09-19 — Reconciliation, media review and manual entry, finished

**Picked up from Codex:** its session (floor-plan OCR contract, confirmed routing before extraction, the `submission_media` schema and publish path — all committed) stopped while wiring the reconciliation screens. Its uncommitted backend compiled but had no tests and its screen took raw JSON for every field. Finished: the backend now has integration and route tests (including a race test for simultaneous submits and proof an upload cannot claim a brochure source); `requirePortalRole` is generic so admin pages read their permission level without a cast; and the screen is rebuilt — fields grouped as a listing reads, typed inputs from the approved vocabularies (numbers, choices, amenities by category, a real unit-types editor), image upload with credit and previews, and confirmations before approve, reject and publish.

**Verified:** full suite, lint, typecheck and format clean; `scripts/verify-manual-entry.mjs` runs the whole manual path in Chrome and Brave, 28/28. Publish is not exercised through the browser (it would put a test property in the catalog); it is covered by the publisher's integration tests.

**Still open in Phase 2A:** the live categorization test (waiting on OpenRouter credits), then the OCR live run and human accuracy spot-check; extracting brochure photos into the image list (needs a server-side PDF image extractor); the developer invite flow; GujRERA (deliberately separate, to be planned).

## 2026-09-19 — Human-confirmed brochure routing and OCR queue

**Done:** the admin page-review workbench now saves a complete human routing
decision before extraction: every page is project details, amenities,
specifications, floor plan, or explicitly ignored. The browser supplies those
page-level choices only; the ingestion routing-confirmation module builds and
validates the one v2 manifest server-side. A separate dialog then queues the
draft OCR attempt, revalidating and freezing the manifest. Both operations are
draft-only and conditional, so a concurrent or queued attempt cannot be
changed. Queueing does not call OpenRouter; it changes status to queued for the
existing worker to consume later. Queued pages remain inspectable but read-only.
No live catalog table, schema, publish-transaction logic, cost display, or
provider call was added.

**API:** the admin routing-manifest PUT route and OCR queue POST route are
implemented and admin-only. Upload already creates the draft attempt, so the
old source-document OCR-job route is superseded.

**Verified:** 715 tests across 63 files, lint, typecheck, targeted Prettier,
and diff checks pass. Repository-wide format:check still reports five
unrelated pre-existing files; no task file is unformatted.

**Next:** add OpenRouter credits and run live categorization validation on
Kimana, Amaris, and 360. Then queue controlled extraction through this flow.
The next code slice after that is OCR-draft review and admin reconciliation.

## 2026-09-19 — Floor-plan OCR contract v2

**Done:** the versioned routing-manifest contract now supports `v2` and one ordered `floor_plans` scope. The existing v1 manifest and pre-named, one-variant `unit_variant` scope stay fully supported. Claude receives all confirmed floor-plan pages together and may return zero or more distinct, evidence-backed variants; the adapter rejects duplicate variant names and AI-supplied BHK/layout lookup keys, then assembles the results into the existing `unit_variants` submission field with correct per-item evidence paths. No database migration, new table, direct catalog write, or change to `publishSubmission` was made. Contract reference: `docs/ocr-routing-contract.v2.md`.

**Verified:** focused OCR tests, lint, typecheck, and the full suite — **702 tests across 59 files** — pass. Targeted Prettier check passes. Repository-wide `format:check` remains blocked by five unrelated pre-existing files; they were not touched.

**Next:** a separately scoped confirm-pages and OCR-queue step will turn the admin's selected categories into a v2 manifest, require the separate paid-run confirmation (without showing a price), and queue extraction. This remains independent of adding OpenRouter credits; credits are only needed for the later live router/extraction validation.

## 2026-09-19 — Categorize brochure pages, and the admin-only usage ledger

**Done:** the page-review screen has a "Categorize brochure pages" action (a vision-model pass, stored on the draft attempt): each page gets a suggested category, confidence and imagery tags, pages worth reading are pre-selected, any page can be re-typed or deselected, and a brochure with no floor plans says its floor-plan step will be skipped. No cost is shown anywhere near it. Every paid request is recorded in a new append-only `ai_usage_events` table (migration `0008`, owner-approved) and shown in a separate admin-only **Usage** tab (totals with a "≥" lower bound when a cost was not reported, by brochure, developer, model, and recent requests). A test fails if anything outside admin and ingestion code touches the ledger.

**Verified:** 698/698 tests, lint and typecheck clean; the ledger is confirmed append-only for the app role. **Not yet run live:** the router has never called the real provider. That first run on Amaris, Kimana and 360 is next, now that spend will be recorded.

**Found:** local and CI database roles grant the app full CRUD on new tables by default, so append-only needs an explicit `REVOKE` (in the migration). Known gap: partial extraction spend is not recorded when a run fails part-way.

## 2026-09-19 — Brochure upload and the zoomable page viewer

**Done:** an admin can upload a brochure PDF for a developer (`/admin/submissions/new` → `POST /api/v1/admin/source-documents`); it is validated as a real PDF, stored through `StorageAdapter`, and creates the immutable source document, a draft submission and a draft OCR attempt with an empty routing manifest — no paid OCR runs. The page-review screen (`/admin/submissions/[id]/pages`) shows every page as a lazily rendered thumbnail, any page selectable or deselectable, and any page opens in a large viewer with zoom in/out/fit, previous/next and keyboard shortcuts. pdf.js runs in the browser only (legacy build, bundler-loaded worker), and only ever draws to visible canvases — it never reads pixels back, which is what would break under Brave Shields.

**Verified:** `scripts/verify-brochure-viewer.mjs` drives the real app (sign in, create developer, upload, grid, select, zoom, page, Esc) in Chrome, Brave and Edge — 48/48 checks pass, screenshots inspected (text is crisp at 200% in Brave). Full suite, lint and typecheck green. **Not verified:** Firefox and Safari (no access; tracked in `docs/production-readiness.md`).

**Notes:** run that script with Node, not Bun (Playwright's pipes hang under Bun on Windows). It leaves three "Verify Developer …" drafts in your local database — harmless, visible in the queue. `playwright-core` was added as a dev dependency (uses installed browsers, downloads none). pdfjs-dist v6 has no `isEvalSupported` option and `destroy` lives on the loading task — the code follows the installed types.

**Next:** assign each page to what it contains (project details, amenities, specifications, unit types incl. multi-page groups, ignore), auto-suggestions, then an explicit confirm step before OCR is queued; then manual entry and reconciliation.

## 2026-09-19 (late night) — Local storage driver

**Done:** `STORAGE_DRIVER=local` keeps objects on disk (`src/lib/storage/local-adapter.ts`, path-traversal-safe keys, HMAC-signed short-lived read URLs served by `/api/v1/local-files/*`, which is a 404 unless the local driver is selected). `gcs` remains the default; an unknown driver fails loudly. 31 storage tests. Approvals recorded in `DECISIONS.md` (invite design, pdf.js with a Brave-safe rendering rule, brand-level profiles). Also the base for a VPS move.

**Local env:** `.env` gained `STORAGE_DRIVER=local` and `LOCAL_STORAGE_DIR=.local/storage` (gitignored).

## 2026-09-19 (night) — Admin submission queue

**Done:** `/admin` now opens the submission queue (Stitch queue layout): status filters, property and developer, location, source (brochure / manual / RERA), date, status pill, and a read-only submission page listing proposed fields with confidence and review state. Read model `src/lib/submissions/queue.ts` derives names from the live property or the draft's own field candidates and never guesses — missing values show "Not stated". Also logged the paid-analytics-platform vision as beta-deadline future scope (`DECISIONS.md`, `docs/roadmap.md`, `docs/production-readiness.md`).

**Verified:** typecheck and lint clean; queue read model integration-tested; pages 200 signed in, 307 signed out, 404 for a bad id, unknown status filter ignored. Not seen in a browser with a session.

**Next:** brochure upload (needs a local storage adapter so it works without GCS), page-routing confirmation UI, manual-entry draft, then reconciliation and publish. The developer-invite design is still waiting on the owner.

## 2026-09-19 (evening) — Pre-launch operating model decided

**Decided (owner sign-off, `DECISIONS.md`):** we upload all properties ourselves under the real developer's canonical profile (no account needed); when the developer joins we invite their user to that profile, so nothing is ever transferred — and no hand edit of `properties` is needed, which the one-write-path rule would forbid. Manual entry sits beside brochure OCR (`manual_form` already exists; one shared reconciliation screen). Brochure floor plans and renders may be published with attribution and a takedown route (copyright exposure accepted, recorded). Enquiries go to an admin inbox; "Verified" means checked by PropCompare.

**Recorded:** the full friction list is in `docs/tasklists/2026-09-19-admin-portal.md` (operating-model section) and `docs/production-readiness.md`. **Found:** `publishSubmission` cannot change an existing property's developer — not needed under this model, noted for any future merge.

**Still waiting on the owner:** the developer-invite design (on-screen link, 7-day expiry, multiple users per profile).

## 2026-09-19 (later still) — Admin console shell and developer profiles

**Done:** `/admin` is now a real console: a sidebar shell after the Stitch "Editorial Desk" layout, a developer directory (`/admin/developers`), create-profile (`/admin/developers/new`) and a profile page. Profiles enforce one per RERA developer id. Every page and the create action re-check the admin role themselves. Logic lives in `src/lib/developers/profiles.ts` (10 tests, including Postgres integration). Tasklist: `docs/tasklists/2026-09-19-admin-portal.md`.

**Verified:** pages return 200 for a signed-in admin, 307 to login when signed out, 404 for an unknown id; typecheck and lint clean. Not yet seen in a browser with a session (screenshots of these screens are still owed).

**Waiting on the owner:** the invite design for developer users (slice 2 of the tasklist) touches auth, so it needs sign-off before I code it: on-screen invite link until email exists, 7-day single-use token, only existing tables.

## 2026-09-19 (later) — Buyer sign-out, signed-in header, name and optional email at first sign-up

**Done:** the buyer header now shows "Sign in" or "Hi, <first name>" with a Sign out control (`HeaderAccount`, a client-side session read so ISR pages stay static). A first-time buyer is asked for their name — required — and an email — optional — right after verifying their code (they arrive with a placeholder name, so anyone who closes the tab mid-way is asked again next login). The phone number is never shown in the UI. Better Auth's `changeEmail` is enabled for unverified accounts only, so a buyer's placeholder email can be replaced without a confirmation mail; verified (developer/admin) emails cannot change this way.

**Verified:** 641/641 tests; lint and typecheck clean; against the dev server, OTP verify → `update-user` (name) → `change-email` → `get-session` returned the new name and email.

**Not done / for Deep:** returning buyers seeing their activity needs screens for saved properties and comparisons. Both are in scope (backend routes `/api/v1/saved-properties` and `/api/v1/comparisons` are built and tested) but the buyer-facing pages are Deep's Phase 3 UI and do not exist yet. They are the retention feature, so they should not slip. Buyer email is stored unverified; nothing sends mail yet.

## 2026-09-19 — Login UI: buyer phone OTP, developer and admin email/password

**Done:** three sign-in screens on one shared frame (`AuthShell`, following the Stitch unlock-gate screen): `/login` (buyer — phone number, then a 6-digit code; the first verified code creates the account), `/developers/login` and `/admin/login` (email + password). A user's role is the presence of an `admin_users` or an _active_ `developer_users` row (`src/lib/accounts/roles.ts`); the portal sign-in checks it _before_ a session exists, so the wrong door never produces a session and every failure returns the same message. `requirePortalRole` is the authorization boundary and guards `/developers` and `/admin` (holding pages until their real screens land). Public email sign-up is disabled in `src/lib/auth.ts`; password accounts come only from `provisionPasswordAccount`. `bun run db:first-admin` (env `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD`) creates the first owner and refuses once any admin exists. `?next=` is validated by `safeReturnPath`.

**Verified:** full suite 627/627, lint and typecheck clean; end-to-end against the dev server — OTP send/verify created a buyer, `/api/auth/sign-up/email` refused, `/admin` and `/developers` redirect to their login when signed out, screenshots checked against the design tokens. CI now provisions Postgres (own commit).

**Not done:** the header's signed-in state (a client-side session read is needed to keep ISR pages static — coordinate with Deep); the pre-login intake cookie claim; SMS delivery in production (`sendOTP` still logs in dev and throws in production, no provider chosen).

**Note:** `test-support.ts` now provisions and signs in rather than signing up, since sign-up is off.

## 2026-09-18 — `GET /api/v1/media/{id}` resolves the buyer-facing media URL strategy

**Done:** the open decision the storage adapter work left on the table — how
a buyer's browser ever gets an image — is resolved. `StorageAdapter` gained
`getSignedReadUrl(path, { expiresInSeconds? })`
(`src/lib/storage/adapter.ts`), implemented in `gcs-adapter.ts` via GCS's V4
read-signing (default TTL 5 minutes). `src/lib/storage/index.ts` exports
`storageAdapter`, the one configured instance the app imports.
`GET /api/v1/media/{id}` (`src/app/api/v1/media/[id]/route.ts`) looks up
`property_media.gcs_path` via a new `getPublishedMediaObjectPath` query,
asks the adapter for a fresh signed URL, and `302`s to it — never
`Cache-Control`-cached, since signing costs no network round trip (computed
locally from the service account key) and each request gets its own
short-lived URL.

**Why a redirect route rather than baking the URL into the page:** the
dossier page uses ISR (`revalidate = 3600`), and the 2026-09-07 decision on
the media gate had explicitly rejected signed URLs for exactly this reason —
a URL baked into cached HTML can expire before the page re-renders. This
sidesteps that by never putting the signed URL in cached markup at all: the
cached HTML references the stable `/api/v1/media/{id}` path, and the actual
signed URL is generated fresh on every request that path receives. Full
reasoning, including why not a full byte-streaming proxy (deferred, not
rejected — the interface doesn't foreclose it) or a public bucket
(brochure/media separation is still unresolved), is in the 2026-09-18
`DECISIONS.md` entry, which supersedes the 2026-09-07 entry's signed-URL
rejection.

**Tests:** 21 new — `gcs-adapter.test.ts` (signed-URL request shape,
default/explicit TTL, error mapping), `queries.integration.test.ts`
(`getPublishedMediaObjectPath` returns `null` for a nonexistent id against
a real database — the "found" path isn't provable against real data yet,
since no sanctioned write path can create a `property_media` row until
developer upload lands; recorded, not worked around), and `route.test.ts`
(the route's redirect/error logic against mocked dependencies, no database
or GCS credentials required). Full suite: **586 passed across 43 files**.
`format:check`, `lint`, `typecheck` all pass.

**Not done:** actually wiring `PropertyCard`/the dossier to render
`<img src="/api/v1/media/{id}">` — those components deliberately show a
placeholder today, with tests protecting that on purpose, and there's
still no real media data to point them at. Left for once the developer
upload flow (Phase 2A completion tasklist) can create `property_media` rows.

## 2026-09-18 — Storage adapter layer built, GCS-backed; `source-loader.ts` retired

**Done:** `src/lib/storage/adapter.ts` defines `StorageAdapter`
(`upload`/`download`/`delete`) and `StorageAdapterError`, mirroring the
`OcrAdapterError`/provider-adapter convention already established in
`src/lib/ocr/adapter.ts`. `src/lib/storage/gcs-adapter.ts`'s
`createGcsStorageAdapter` implements it against `@google-cloud/storage`,
reusing the exact path convention (`gs://bucket/object`, or a bare path
resolved against a configured default bucket) and env vars (`GCS_PROJECT_ID`,
`GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`, `GCS_BUCKET`) the old code already
used — no change to `source_documents.gcs_path`/`property_media.gcs_path`
values or the schema. `src/lib/ocr/source-loader.ts`, the one prior direct,
uninterfaced GCS call, is deleted — confirmed zero callers and zero test
coverage before removing it, so this is a straight consolidation, not a
second path left standing.

**Why now:** the user is evaluating moving hosting off GCP to a Hostinger
VPS and asked for an adapter layer so a provider switch later means writing
one new adapter, not auditing every call site — the same reasoning already
applied to OCR provider choice in this codebase. See
`docs/tasklists/2026-09-18-storage-adapter.md`.

**Deliberately not decided here:** the buyer-facing URL-resolution strategy
(public bucket vs. signed URL vs. proxy route) — `download()` returns bytes,
not a browsable URL. That was flagged as an open, expensive-to-reverse gate
in the 2026-09-07 dossier-media-gate `DECISIONS.md` entry and stays open; a
`getSignedReadUrl`-style method belongs on this interface once it's decided,
not guessed at now. `docs/tasklists/2026-09-18-phase-2a-completion.md`'s
open-decisions section is updated to reflect what's resolved vs. still open.

**Tests:** 12 new (`src/lib/storage/gcs-adapter.test.ts`) — path resolution
(`gs://` form, bare-path-plus-default-bucket, missing-bucket and malformed-path
errors), each operation's call into a stubbed GCS client, error mapping (404 →
`object_not_found`, other failures → `provider_error`, never a raw SDK error
leaking through), and configuration validation. No real GCS connection
required. Full suite: **576 passed across 42 files**. `format:check`, `lint`,
`typecheck` all pass.

**Nothing calls `upload()` in real code yet** — that's the Phase 2A
completion tasklist's developer-portal brochure-upload step, which now has
an interface to build against.

## 2026-09-18 — Status audit: empty catalog, no ingestion/login UI; Phase 2A scope redefined to close the gap

**What was found, not assumed:** a direct check of the local database showed
every content table empty — zero `properties`, `developers`,
`property_submissions`, `ocr_extraction_jobs`, `source_documents`. The five
Phase 2B convergence properties were always script-created and never
persisted; this session's Docker reset removed even that. More load-bearing:
**no UI anywhere in this codebase can create a property.** The only path
that has ever worked is a maintainer running a one-off script that calls
`publishSubmission()` directly. Phase 2A's admin review/approval UI was
deferred at the 2026-09-07 Phase 2B integration point; Phase 4's developer
portal never started; and there is no login/signup screen anywhere, despite
today's Phase 3 buyer-account routes all requiring a session.

**Decision (user sign-off, recorded in full in `DECISIONS.md`):** rather
than keep seeding the real catalog through throwaway scripts, finish the
actual product path instead. The developer self-serve upload/review flow —
originally Phase 4 — is pulled forward and merged into finishing Phase 2A,
since the admin review step was always designed to be agnostic to whether
an admin or a developer created the submission
(`docs/app-flows/admin.md` step 9). "Finish Phase 2A" now means, in order:
login/signup UI (buyer phone-OTP, staff email/password — both implemented
in Better Auth, neither has a screen), the developer portal's
upload → routing → OCR-draft-review → submit flow, the admin
queue → reconciliation → approve → publish UI, and the never-started
`rera_fetch_jobs` scrape/cross-check job. The one item staying explicitly
deferred is the human field-level OCR accuracy spot-check on Adani Amaris
and Kimana Towers (`docs/tasklists/2026-09-02-ocr-provider-integration.md`'s
sole unchecked line) — it gets easier once the reconciliation UI exists, so
it's left for after rather than blocking this work.

**New tasklist:** `docs/tasklists/2026-09-18-phase-2a-completion.md` — the
ordered implementation plan, with three open decisions flagged rather than
guessed at: the brochure/media GCS storage strategy (already flagged
expensive-to-reverse in the 2026-09-07 dossier-media-gate `DECISIONS.md`
entry, and now actually blocking, since step 2 needs somewhere to put an
uploaded file), the page-routing UI's interaction model, and the admin
builder-profile creation/staff-invitation flow. `docs/roadmap.md`'s Phase
2A and Phase 4 sections, and `docs/app-flows/admin.md`/`developer.md`'s
status lines, are updated to match. Per the user's direction, once this
tasklist completes, the remaining work (Deep's Phase 3 UI wiring, Phase 4's
now-narrowed portfolio dashboard, Phase 5) continues in a new session
against an updated tasklist.

## 2026-09-18 — `discovery/matches` supports an unbounded upper end (requested from Deep's side)

**Done:** `POST /api/v1/discovery/matches` now accepts `maxUnbounded: true` in
place of `maxInr`, for a buyer with no stated upper limit.
`BudgetRangeMatchParams` (`src/lib/matching/budget-range.ts`) is now a
discriminated union — `{ minInr, maxInr }` or `{ minInr, maxUnbounded: true }`
— and `matchPropertiesByBudgetRange` resolves the unbounded ceiling with a
single SQL subquery (`select max(price_inr) from
private.unit_price_history where effective_to is null`) inlined into the
same `WHERE` clause as the existing comparison, so the resolved figure
exists only inside Postgres and this function never holds it as a value
that could be logged or returned — the same "nothing to leak because
nothing is selected" guarantee the matcher was built on originally.
`DiscoveryMatchParams` and `parseDiscoveryMatchBody`
(`src/lib/matching/http.ts`, `discovery.ts`) mirror the same union.
`maxInr` and `maxUnbounded: true` are mutually exclusive and one is
required — omitting `maxInr` alone, without the explicit flag, is a `422`,
never a silently-widened search. Full reasoning, including why no ±20%
multiplier applies to the resolved ceiling (it's already the true max, so
expanding it is a no-op), is in `DECISIONS.md`.

**Context:** this was Deep's own design decision, made while building the
intake UI against this endpoint — his interim UI sent an explicit large
stated `maxInr` and disclosed the span it searched in its own results
header (values it already knew), and asked for real backend support so
that hack could be replaced with a one-function change on his side
(`matchRequestBody`).

**Tests:** 15 new across five files —
`budget-range.test.ts` (validation-only: `maxUnbounded` with an invalid
`minInr`), `budget-range.integration.test.ts` (a unit priced far above any
bounded search still matches under `maxUnbounded`, the lower bound still
applies, no forbidden keys), `discovery.integration.test.ts` and the route's
own integration test (end-to-end, including a `422` when both `maxInr` and
`maxUnbounded: true` are given), and `http.test.ts` (body-validation edge
cases). Full suite: **522 passed across 39 files**. `format:check`, `lint`,
`typecheck` all pass.

**Documentation:** `docs/api/api-spec.v1.md`'s `discovery/matches` request-body
section and `docs/tasklists/2026-09-18-discovery-matches-endpoint.md`'s
completion record both updated.

## 2026-09-18 — Phase 3 backend complete: saved-properties, comparisons, enquiries, dossier-unlocks

**Done:** the four remaining Phase 3 buyer routes
(`docs/tasklists/2026-09-18-buyer-account-routes.md`), closing out all of
Bhavarth's Phase 3 backend scope. `src/lib/buyer/` holds the query layer
(`saved-properties.ts`, `comparisons.ts`, `enquiries.ts`,
`dossier-unlocks.ts`, shared `types.ts`), `src/lib/buyer/http.ts` validates
each route's body/query, and `src/lib/buyer/session.ts` is the first place in
this codebase that reads a Better Auth session from a Route Handler
(`auth.api.getSession({ headers, query: { disableCookieCache: true } })` —
bypassing the cookie-cache optimization so a revoked session can't still
authorize a write). All four routes live under `src/app/api/v1/`, require a
session (`401 unauthenticated`), scope every query by the session's own
`userId`, and are never cached. `dossier-unlocks` additionally gates on the
session's `phoneNumberVerified` flag (`403 phone_not_verified`) rather than
reimplementing OTP — Better Auth's existing `phoneNumber` plugin owns that.

**Two pre-existing, unrelated bugs surfaced and fixed as a side effect of
being the first code to read a session** (both recorded in `DECISIONS.md`
2026-09-18): `accounts` was missing a column (`issuer`) the installed Better
Auth version (1.7.2, "account identity is scoped by issuer") requires —
every `getSession`/`signUpEmail` call was failing outright with
`BetterAuthError: The field "issuer" does not exist`. Added
`issuer text not null` via migration `0007` (safe with no default — the
local `accounts` table had zero rows). Separately, `bun run db:generate`
failed with a snapshot-collision error because `drizzle/meta/0004_snapshot.json`'s
`prevId` pointed at the zero UUID instead of `0003`'s real id — a Phase 2B
merge leftover, distinct from the `created_at`/migration-tracking bug fixed
earlier today. Fixed with a one-line pointer correction; `db:generate` then
produced exactly the expected one-column migration.

**Tests use a real signed session, not a faked one.** New
`src/lib/buyer/test-support.ts` signs a throwaway buyer up through Better
Auth's own `auth.api.signUpEmail({ ..., asResponse: true })` and extracts the
genuinely signed `Set-Cookie` value, so every route's integration tests
exercise `requireBuyerSession` exactly as a real browser request would.
29 new tests across `http.test.ts` and four `route.integration.test.ts`
files cover: 401 with no session, ownership scoping (a second buyer never
sees or acts on the first's rows), 404 on a nonexistent/mismatched
property or unit variant, save/unlock idempotency, and the phone-verification
gate. Full suite: **507 passed across 39 files**. `format:check` (on
authored/touched files — the same repo-wide pre-existing drift noted in
earlier entries applies), `lint`, and `typecheck` all pass.

**Documentation:** `docs/api/api-spec.v1.md` now fully documents all four
routes (request/response shapes, error cases), with the error-codes and
caching tables extended accordingly. `docs/tasklists/2026-09-18-buyer-account-routes.md`
has the full implementation record.

**What's left in Phase 3:** all backend is now done. Remaining work is
entirely Deep's UI wiring (comparison feature, saved properties, OTP
dossier-unlock gate, enquiry submission, and pointing `/intake`'s handoff at
`POST /api/v1/discovery/matches`) plus the still-deferred pre-login intake
cookie flow (`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`, agreed
direction only, not implemented). `docs/roadmap.md`'s Phase 3 acceptance
line stays open until that UI work lands.

## 2026-09-18 — `/intake` now runs a real match; Deep's first Phase 3 UI slice is done

**Done:** guided intake's summary step no longer hands off to a placeholder. When the buyer has stated a range, it POSTs to `POST /api/v1/discovery/matches` and renders the matched published properties in place, beneath the brief. Tasklist: `docs/tasklists/2026-09-18-intake-matches-ui.md`.

**The shape of this was forced, not chosen.** The stated range may not reach a URL (`DECISIONS.md` 2026-09-07), `sessionStorage` was rejected on that same record, and the intake cookie is deferred — so nothing available today could carry the range to a separate `/matches` page. The results therefore render where the range already lives, in `IntakeFlow`'s client state. That also makes this the first screen to fetch its own HTTP route rather than call the read layer directly, which is the opposite of the 2026-09-07 browse-page decision; that decision concerns a Server Component reading published data, and there is no server render here that could hold a figure which must never exist server-side as anything but a request body. Both recorded in `DECISIONS.md`.

**New:** `src/lib/properties/intake-matches.ts` holds the answers→body arithmetic (lakh→INR, the carried `city`/`bhk`, the ±20% disclosure copy) and the `fetch` wrapper, which never throws — a network failure and a rejected request are both states the screen renders. It is deliberately separate from `intake.ts`: the contract names its bounds `minInr`/`maxInr`, `no-price.ts` matches `/inr/i` and runs in production, and the 2026-09-07 naming decision keeps those names out of the answer shape. A test asserts both halves — the answers stay clean, the body deliberately does not. `src/components/buyer/intake-matches.tsx` renders the four view states and reuses `PropertyCard`, `GridRow`, and the browse screen's empty-state vocabulary rather than inventing a second set.

**Behaviour worth knowing:** with no range stated there is no match to run — the endpoint requires both bounds — so the original `/properties` hand-off stands rather than a default range being invented. Changing any answer discards a rendered result and abandons any in-flight request, so a late response cannot paint matches for a brief the buyer has since edited. A failed search says it failed; it never renders as an empty catalog, and the endpoint's developer-facing `message` (which names `minInr` by its contract name) is never shown.

**Open follow-up for Bhavarth — a contract gap, not a defect.** The slider's top notch reads "₹5 crore or more", but `maxInr` is a required finite number, so "or more" has nothing to serialise to. The user's decision is that the open end should be bounded by the highest price in the published catalog — which cannot be done from the UI, because the client would have to be told a real price and `assertNoExcludedData` fails exactly that. It needs the endpoint to accept an unbounded upper end, resolved inside the service-role matcher and never returned. Until then the UI sends the stated figure and states the ceiling it actually searched, so the cap is visible rather than silent. The swap is isolated to `matchRequestBody`/`isOpenEndedTop`. Full reasoning in `DECISIONS.md` (2026-09-18).

**Tests:** 38 new — `src/lib/properties/intake-matches.test.ts`, `src/components/buyer/intake-matches.test.tsx`, and the rewritten hand-off section of `src/components/buyer/intake-flow.test.tsx` (the "makes no network call" guard was tightened rather than deleted: the questions and the brief still reach no server, and only the buyer's explicit action may). Full suite: **493 passed across 35 files**. `lint`, `typecheck`, and `format:check` on authored files all pass.

**Still blocked:** Deep's other three Phase 3 UI slices — comparison, saved properties, the dossier-unlock OTP gate, enquiry submission — wait on the four routes that do not exist yet.

## 2026-09-18 — Handoff to Deep: pull `task/phase-3-budget-range-matching`, backend is Bhavarth's for this phase

**Branch to pull:** `task/phase-3-budget-range-matching`, already pushed to `origin`. Do not base new work on `origin/main` — it is 4 commits behind this branch (it's missing both the Phase 3 continuation handoff docs and everything below). This branch contains everything from the merged Phase 2B baseline (`508291c`) plus this phase's work so far; nothing has been merged to `main` yet, and per `AGENTS.md` nothing will be until the whole phase's tasklists and verification are complete.

**What's ready to build UI against:** `POST /api/v1/discovery/matches` is implemented and tested — full request/response contract in `docs/api/api-spec.v1.md` (search for that route), implementation notes in `docs/tasklists/2026-09-18-discovery-matches-endpoint.md`. It takes `{ minInr, maxInr, city?, bhk?, page?, pageSize? }` in a POST body and returns the same `{ data, pagination }` shape as `GET /api/v1/properties` — no price, bound, or bucket ever in the response, and the request is not persisted anywhere.

**Scope split for the rest of Phase 3, settled today (see `DECISIONS.md` 2026-09-18):** `roadmap.md` previously said Deep "wires the built UI to real endpoints... following the contracts Bhavarth defines" without ever saying who builds the four remaining routes (`saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks`) — that gap is now closed. **All Phase 3 backend, including those four routes, is Bhavarth's.** Deep's Phase 3 scope is UI only:

- Comparison feature, saved properties, dossier-unlock phone-OTP gate, enquiry submission screens, against the four routes above once they exist.
- Pointing `/intake`'s handoff at `POST /api/v1/discovery/matches` instead of its current placeholder link to `/properties` (city + bhk only) — see the 2026-09-07 `DECISIONS.md` entry explaining why that placeholder exists; it was written explicitly to be replaced once matching shipped.

**Not built yet, so don't build UI against them as if they exist:** `saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks` — none of the four have a route, a schema decision beyond what's already in `docs/schema/schema.v5.md`, or a tasklist yet. If UI work depends on one of these before Bhavarth gets to it, that's a sequencing conversation to have directly rather than either side guessing at the missing contract.

**Also not built, deferred, informational only:** the pre-login intake cookie flow (`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`) — direction is agreed but nothing is implemented. If Deep's UI work touches the login/signup flow or intake's client state before that lands, read that tasklist first; it explains why raw budget figures are deliberately kept out of anything that persists or travels in a header today.

**Before starting UI implementation:** per `docs/tasklists/README.md`, Deep's slice needs its own scoped tasklist in `docs/tasklists/` (linked to the relevant app-flow/design/API references) before code — none exists yet for this UI work.

## 2026-09-18 — `POST /api/v1/discovery/matches` implemented; migration tooling bug fixed

**Done:** the HTTP route wiring the private budget-range matcher up to a buyer
response (`docs/tasklists/2026-09-18-discovery-matches-endpoint.md`). New
`src/lib/matching/discovery.ts` (`matchPublishedProperties`) composes the
service-role matcher with the public catalog read layer: it resolves matched
property ids via `matchPropertiesByBudgetRange`, then — via the app
connection only — loads published `PropertySummary` rows for those ids,
narrowed by optional `city`/`bhk` and paginated the same way
`listPublishedProperties` does. `ListPropertiesParams`/`listPublishedProperties`
were deliberately left untouched (that type is the guarded public contract
for `GET /api/v1/properties`); only the generic per-property-id loaders
(`loadBhkTypesByProperty`, `loadPrimaryMediaByProperty`, `bhkFilter`) were
exported from `queries.ts` for reuse. New `src/lib/matching/http.ts` validates
the POST body (`minInr`/`maxInr` required positive numbers with
`minInr <= maxInr`, optional `city`/`bhk`/`page`/`pageSize`) and a new
`invalid_request_body` `ApiErrorCode` was added to the shared envelope in
`src/lib/properties/http.ts`. The route itself
(`src/app/api/v1/discovery/matches/route.ts`) is stateless — no
`buyer_intake_sessions` write — and always `Cache-Control: no-store`, since
the buyer's stated range is per-request body input, not a cacheable resource.
`docs/api/api-spec.v1.md` now documents the route in full and corrects the
`POST /api/v1/intake-sessions` row, which this phase does not build (pre-login
capture goes through a cookie instead — see below).

**Design decision surfaced and resolved before implementation:** whether this
endpoint persists the buyer's stated budget range. Resolved (user sign-off,
recorded in `DECISIONS.md` 2026-09-18): the endpoint stays fully stateless.
Separately, pre-login intake answers (city, budget, configuration) will move
to a narrowly-scoped, short-lived, `httpOnly` cookie and get claimed into
`buyer_intake_sessions` at login, for buyer-behavior insight — direction
agreed, implementation deferred to its own stub tasklist
(`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`), since it touches the
auth/login flow, which `AGENTS.md` requires review for regardless of author.

**Tests:** 29 new — `src/lib/matching/http.test.ts` (body validation, no
database), `src/lib/matching/discovery.integration.test.ts` (range boundary,
city/bhk narrowing, honest empty result, no forbidden keys), and
`src/app/api/v1/discovery/matches/route.integration.test.ts` (the real route
handler, a real `JSON.stringify` round trip, cache headers, malformed-JSON and
invalid-body `422`s). Full suite: **455 passed across 33 files**. `format:check`
(on authored/touched files only — the same repo-wide pre-existing drift noted
in the entry below applies), `lint`, and `typecheck` all pass.

**Migration tooling silent-failure root cause found and fixed, separately from
the endpoint work.** `drizzle-kit migrate` had been silently exiting 1 with no
error text since at least the Phase 2B merge; root cause and fix are recorded
in the entry directly below and in `DECISIONS.md` (2026-09-18). `bun run
db:migrate` now succeeds cleanly and is idempotent on repeat runs.

## 2026-09-18 — Phase 3 private budget-range matcher implemented

**Done:** the service-only ±20% matcher from
`docs/tasklists/2026-09-01-phase-3-budget-range-matching.md`. New
`src/db/service.ts` holds the sole `BYPASSRLS` `propcompare_service` connection
(mirrors the `@/db` app-role module's guard pattern, refusing to start if
`DATABASE_SERVICE_URL` is unset or equals `DATABASE_URL`). New
`src/lib/matching/budget-range.ts` exports `matchPropertiesByBudgetRange(db,
{ minInr, maxInr })`, which validates positive `minInr <= maxInr` before
touching the database, then joins `private.unit_price_history` (current row
only, `effective_to is null`) to `unit_variants` and filters with
`price_inr between minInr * 0.80 and maxInr * 1.20` computed in Postgres
against the `numeric` column — never in JavaScript. It deliberately does not
use `private.unit_current_bucket`, per the 2026-09-01 decision that adjacent
buckets can't guarantee the exact tolerance at their edges. The result shape
is `{ propertyId, unitVariantId }` only; no price, bound, or bucket field is
selected, so there is nothing for `findForbiddenKeys` to catch — confirmed
directly by a dedicated shape test.

**Tests exercise the real boundary and the real role split.**
`src/lib/matching/budget-range.test.ts` proves validation happens before any
query (a throwing `Proxy` stands in for `db`). The database-backed
`budget-range.integration.test.ts` publishes each fixture through the real
`publishSubmission` transaction, writes its price via the service connection
(matching `publisher.integration.test.ts`'s existing pattern), and checks the
lower/upper inclusive boundaries plus the just-outside exclusions, the
no-price-leak shape check, and that the normal `propcompare_app` connection
is still denied on `private.unit_price_history`. Full suite: **426 passed
across 30 files** (14 new). `format:check`, `lint`, and `typecheck` all pass;
formatting was applied only to the newly authored files, since `format:check`
also flags ~45 pre-existing files across the repo that this task did not
touch — that drift is unrelated to Phase 3 and is left for whoever owns a
repo-wide formatting pass.

**No `DECISIONS.md` entry needed.** The implementation matches the
2026-09-01 "Buyer budget matching uses an inclusive ±20% expansion" entry's
worked example exactly and does not change the private service boundary.

**Migration tooling silent-failure root cause found and fixed.** `drizzle-kit
migrate` uses `drizzle-orm/postgres-js/migrator`'s `migrate()`, whose skip
logic is `select ... order by created_at desc limit 1` compared against each
migration's journal `when` value — not a hash lookup. The
`drizzle.__drizzle_migrations` row for migration `0005`
(`0005_military_red_skull.sql`) held its real apply-time timestamp
(`created_at = 1788353878280`), which is _earlier_ than `0005`'s own journal
`when` (`1788782563902`) — a mismatch left over from the Phase 2B journal
reconciliation described in the 2026-09-07 entry below. Every `db:migrate`
run therefore concluded `0005` hadn't been applied yet and tried to re-run
it, failing on `column "profile_narrative" of relation "developers" already
exists` — and `drizzle-kit`'s CLI swallows that error outright
(`renderWithTask`'s catch in `node_modules/drizzle-kit/bin.cjs` calls
`terminal.reject(err)` then `process.exit(1)` without ever printing `err`,
which is why nothing showed up on stderr). Migration `0006`'s GRANT was never
reached by any prior `db:migrate` run; it was live on the database only
because it had been applied out-of-band. Fix: `UPDATE
drizzle.__drizzle_migrations SET created_at = 1788782563902 WHERE id = 6`
(the metadata-only correction bringing that row in line with `0005`'s own
journal timestamp), then a normal `bun run db:migrate` applied `0006`
cleanly and recorded its row correctly. A second `db:migrate` run is now a
clean no-op, and the full suite (426/426) still passes. This was a metadata
correction to migration bookkeeping, not a schema or data change, so it
didn't need a `DECISIONS.md` entry.

## 2026-09-18 — Continuation handoff: Phase 2A follow-ups deferred; start Phase 3

**Repository state:** Local `main` was fast-forwarded to `origin/main` at
`508291c` (the merged Phase 2B baseline). Do not recreate or re-merge Phase 2B.
The five real local convergence properties, schema v5, migration `0006`, the
buyer read surface, and the OpenRouter OCR foundation are already present.

**Deferred, not done:** The remaining Phase 2A work is non-blocking for the
next buyer-delivery phase but remains required before operating an OCR-driven
admin ingestion workflow: (1) a human field-level accuracy review for Adani
Amaris and Kimana Towers, (2) the GujRERA fetch/cross-check job, and (3) the
admin page-routing, submission-queue, and reconciliation interfaces. The OCR
tasklist retains these unchecked; no OCR result may skip review or the sole
`property_submissions` publish transaction.

**Next bounded task:** Start Phase 3 on a fresh
`task/phase-3-budget-range-matching` branch. Read `AGENTS.md`, this entry,
`DECISIONS.md`'s private-price and ±20% entries, and
`docs/tasklists/2026-09-01-phase-3-budget-range-matching.md`. Update that old
tasklist before code if the now-available Phase 2B API/UI integration changes
its scope. The service-only matcher must query only current private price rows,
apply inclusive `[min × 0.80, max × 1.20]`, and return only published
property/unit identifiers—never exact prices, bounds, buckets, or derived
commercial values. Keep the normal application connection unable to query
`private`.

**Local-worktree note:** `.claude/` is unrelated and untracked. The four local
`drizzle/meta/0000`–`0003_snapshot.json` files became visible as untracked when
the Phase 2B `.gitignore` changed; preserve them unless their owner explicitly
asks to remove or add them. Before implementation, use
`docs/local-database-setup.md` to confirm the native/Docker Postgres service is
up, then run the tasklist's full migration, role-boundary, and test checks.

---

## 2026-09-07 — Phase 2B integrated locally with the Phase 2A schema-v5 and OCR baseline

**Done:** `origin/main` at `9b2726d` is merged locally into `task/phase-2b`; nothing was pushed and no pull request was created. The decision log preserves main's complete history under "Decisions taken by Bhavarth" and the Phase 2B decisions under "Decisions taken by Deep". This progress journal keeps every Phase 2B entry followed by main's complete prior history.

**Dependency and build-cache conflicts are resolved from sources of truth.** The merged `package.json` retains both main's OCR dependencies and Phase 2B's UI/testing dependencies, and `bun.lock` was regenerated rather than hand-merged; `bun install --frozen-lockfile` subsequently made no changes. The generated `tsconfig.tsbuildinfo` cache stays deleted and is ignored, so typecheck/build can recreate it locally without returning it to version control.

**Schema v5 is now represented by complete migration metadata.** Main's canonical `0005_military_red_skull.sql` was kept unchanged. Drizzle generated an identical candidate migration from the v4 snapshot, so only its `0005_snapshot.json` was retained and the journal entry was pointed at main's canonical filename. `bun run db:generate` now reports no schema changes. Migration `0005` applied successfully to the native PostgreSQL 18 database, the canonical seed added its four v5 field-contract rows, all five Phase 2B properties remained published, and the new nullable columns did not fabricate values for those pre-v5 records.

**The merged suite exposed and closed one Phase 2A privilege gap.** Migration `0003` had created `ocr_extraction_jobs` and `property_submission_field_evidence` after the application-role grants without granting `propcompare_app` the documented public-table CRUD rights. The OCR integration test passed with the admin connection, isolating the failure to privileges. Forward-only migration `0006_grant-app-ocr-tables.sql` grants CRUD only on those two tables to `propcompare_app`; service-role and private-schema access are unchanged. The same test then passed through the normal application connection.

**Verified on the integrated tree and migrated database:** `bun install --frozen-lockfile`, `bun run db:generate`, `bun run db:migrate`, `bun run db:seed`, `format:check`, `lint`, `typecheck`, and `build` pass. `bun run test` reports **412 passed across 28 files**. The production route table remains `ƒ /`, `ƒ /intake`, `ƒ /properties`, `● /properties/[slug]`, and the three dynamic API/auth routes. The intake slider still needs the previously recorded human drag/click check before the pull request is merged.

## 2026-09-07 — Phase 2B step 9 complete: real properties on the real pages, and the phase closes

**Done:** the convergence step. Five properties are published through the actual
`publishSubmission` transaction and every buyer page has been checked against
them on a running production server. `docs/roadmap.md`, this journal, and the
phase plan's completion record are updated; `api-spec.v1.md` was verified rather
than edited. Phase 2B is complete — all ten steps landed on `task/phase-2b`.

**The seed goes through the one write path.** A throwaway script built an
approved `property_submissions` row plus confirmed `property_submission_fields`
for each property and called `publishSubmission`; nothing touched `properties` or
any child table directly, because the one-write-path rule binds seed scripts as
firmly as it binds application code. The script was deleted after running, so
nothing about the seed is committed and `main` gains zero rows of data. The
properties are left in the local database by decision — steps 5–7 cleaned up
because they were testing, and this step is the deliverable.

**The set exercises the surface rather than filling it.** Riverstone Greens
carries all three area bases plus room dimensions; Satyam Skyline has a
carpet-only variant and a duplex; Aarambh Residency is deliberately sparse — no
specifications, one amenity; Vraj Bungalows publishes built-up and super built-up
with **no carpet at all**; Shivalik Plotting Scheme is a plot with **no unit
variants**. Three possession statuses and three property types across five
records.

**Verified against the real read layer, not just eyeballed.** Every filter
returns its expected count — `city=Ahmedabad` 3, `city=Gandhinagar` 2,
`bhk=3bhk` 2, `propertyType=plot` 1, `possessionStatus=ready_to_move` 2, and
`amenity=clubhouse+gymnasium` 2, which confirms amenity filters narrow rather
than widen. `findForbiddenKeys` reports zero forbidden keys across all five
dossiers and the listing. All five dossiers return `200`, a slug with no property
still `404`s, and no page renders a rupee figure. **The never-derive rule holds
on real data**: Vraj Bungalows shows built-up and super built-up and simply has
no carpet figure, rather than computing one.

**Guided intake has a real vocabulary for the first time.** Its configuration and
city questions were rendering the "nothing is published yet" message against an
empty catalog; they now offer Ahmedabad and Gandhinagar, and 2 through 5+ BHK,
drawn from the same `listFilterOptions` the browse filters use — which is exactly
why `/intake` was made `force-dynamic` in step 8.

**The landing strip promised in step 7 was built.** Step 7 deferred it on the
grounds that a content strip should be designed against real content rather than
an empty table; that condition is now met. `/` shows the six most recently
published properties through the existing `PropertyCard`, omits the section
entirely when the catalog is empty rather than rendering an empty shelf, and
calls it "Recently published" — a fact the data carries — rather than "featured",
which would be an assessment nothing here supports. This partly supersedes the
step 7 decision that kept `/` static, and the supersession is marked on the
original entry.

**A second silent-prerender bug, caught the same way as step 8's.** `/` had to
become dynamic, and the obvious choice was ISR. It is wrong here: a route with no
dynamic segment has no `generateStaticParams` escape hatch, so `revalidate`
prerenders at build and requires Postgres reachable during `next build` — the
constraint step 3 flagged and step 6 worked around on the dossier. **This was
measured rather than asserted**: building against an unreachable `DATABASE_URL`
succeeds with `force-dynamic` and fails with `revalidate = 3600`
(`Error occurred prerendering page "/"`, `ECONNREFUSED` on the listing count
query). `/` is now `ƒ (Dynamic)`.

**A contract gap was found and recorded rather than papered over.** No property
in the catalog can reach the `explicitly_not_offered` amenity state. The publish
transaction marks every unlisted amenity `not_stated`, and the active field
contract has only `property.amenities` — an array of keys that _are_ available —
so nothing can currently assert that a developer answered "we do not offer this".
The "Not stated" / "Not offered" distinction is implemented, tested and correct
on the render side; one of the two facts simply has no input path yet. That
belongs to the phase that owns developer submission. Writing those rows directly
would both bypass the publish transaction and fabricate a claim about a real
developer.

**Expected gaps, confirmed correct rather than fixed:** no property shows an
image, because media delivery was deferred out of 2B by a dated decision and
nothing can populate `property_media` this phase; and none shows the RERA
verified badge, because no code path sets `properties.rera_registered` — it waits
on the GujRERA cross-check job. Both render through the standard absence
vocabulary, exactly as designed.

**Decision audit, as the checklist requires:** 31 dated entries from 2026-09-02
and 2026-09-07 cover steps 0–8, and step 9 added three more — the landing strip
and its supersession, the convergence seed, and the `explicitly_not_offered` gap.
Every decision made during the phase has an entry.

**Verified:** `bun run test` reports **401 passed across 27 files** (396 from
step 8, plus 5 for the landing strip); `format:check`, `lint`, `typecheck`,
`build`, and `git diff --check` all pass. Final route table: `ƒ /`,
`ƒ /intake`, `ƒ /properties`, `● /properties/[slug]`, plus the three `ƒ` API
routes.

**The branch is not merged, and these numbers are the branch's, not a merged
result's.** `task/phase-2b` stays unmerged by decision — the merge into `main`
will be raised as a pull request. Two things found while closing the step that
the merge will have to handle: `origin/main` moved five commits ahead during the
phase (`4e998d1` → `9b2726d`) with Phase 2A OCR work, schema v5's four new
nullable `properties` columns, and migration `0005`, so a local database on
`0004` needs `bun run db:migrate` first; and three files will conflict —
`DECISIONS.md` and `PROGRESS.md`, where both sides added entries and both are
wanted, and `tsconfig.tsbuildinfo`, a tracked build cache whose untracking is
deliberately left to the pull request. Full detail in the phase plan's
completion record.

## 2026-09-07 — Phase 2B step 8 complete: guided intake, and the dead link closed

**Done:** `/intake` exists. Four optional questions — priorities, configuration,
city, and the range the buyer is working with — then a brief that restates every
answer and hands off to `/properties`. `src/lib/properties/intake.ts` holds the
vocabulary and the URL arithmetic, `src/components/buyer/intake-flow.tsx` is the
flow, `src/components/buyer/stated-range-slider.tsx` is the range control,
`src/components/buyer/intake-screen.tsx` is the screen, and
`src/app/intake/page.tsx` is the route. The `/intake` link the header has
carried since step 4, and the landing page since step 7, no longer 404s.

**"Persona priorities" had no definition anywhere in this repo, so one was
agreed rather than invented.** `buyer_intake_sessions.persona_priorities` is
unshaped `jsonb`; the PRD says "capture buyer priorities"; `buyer.md` says
"choose persona priorities"; the only concrete hint was a non-normative example
comment in `schema.v1.md`. Guessing here would have created a second de-facto
contract the moment Phase 3 built matching against it. Six keys were agreed with
the maintainer, each carrying a `grounding` line naming the published facts it
reads, shown to the buyer beside the option. A priority the catalog cannot
answer would be a question asked in bad faith.

**This is the first `"use client"` component in the buyer surface, and it
deliberately does not copy the browse screen.** Browse puts its whole filter set
in the URL so a filtered view is a shareable address. Intake does the opposite:
every answer lives in `useState` and none of it reaches the URL, storage, or a
server. A query string lands in browser history, in access logs, and in the
`Referer` header of every following request — which is as close as this
application could come to publishing a monetary figure. The client boundary is
drawn as tightly as it goes: the frame, the heading, and the standing copy all
still render on the server.

**Intake ends somewhere real without inventing a match.** Matching is Phase 3
and `POST /api/v1/intake-sessions` is an explicit non-goal, so the brief links
to `/properties` carrying only the two answers that map to filters the read
contract actually has — city and configuration. `handoffParams` names those two
fields one at a time rather than spreading the answers, so a future field cannot
reach the URL by an inattentive edit, and the summary says in words which
filters the link carries and that the stated range is not among them.

**The range is a slider, by the maintainer's explicit choice**, over the two
alternatives put to them. The concern raised against it — that a slider implies
precise rupee figures on a site that publishes none — was answered in the
control rather than overruled: it steps in five-lakh notches, its top end is
open-ended ("₹5 crore or more") so it never puts a ceiling in the buyer's mouth,
it reads back as "You said …", and nothing is ever shown as costing it. Preset
bands were rejected on the record; a preset list of ranges is a bucket in all
but name. It is built from two overlaid native range inputs rather than Radix's
`Slider`, so each handle is a real labelled control — Radix's measures itself
with `ResizeObserver`, which jsdom does not implement, and the one interactive
control in this phase would have been the one its tests could not drive.

**The client state is named to survive the production guard, not to dodge it.**
`no-price.ts` matches `/inr/i` and runs in production. Mirroring the column
names `budget_min_inr` / `budget_max_inr` in client state would trip it, leaving
a choice between weakening the product's central structural guard and carrying a
shape nothing could be handed. The state is `statedRange: { fromLakh, toLakh }`,
and a test asserts the whole answers object passes `findForbiddenKeys`.

**Both new guards were verified by planting a violation and watching them
fail.** A `fetch("/api/v1/intake-sessions", …)` added to the summary step failed
the "makes no network call at any point in the flow" test; appending the range
to the hand-off URL failed both the parameter-set assertion and the
unfiltered-catalog assertion. Both plants were reverted and the suite re-run.

**A real bug was found by running the build, not by reading the code.**
`next build` reported `/intake` as `○ (Static)`: `listFilterOptions` is a
Drizzle query rather than a `fetch`, so Next.js could not tell it was uncached
and `dynamic: "auto"` rendered the page once at build — freezing the questions
to whatever was published on build day, while `/properties` stayed dynamic
against the same query. Fixed with `export const dynamic = "force-dynamic"`;
the route table now reports `ƒ /intake`. Found by checking the route table
against the one recorded at step 7 rather than assuming a new page would behave.

**Verified:** `bun run test` reports **396 passed across 27 files** (357 from
step 7, plus 39 for this step); `format:check`, `lint`, `typecheck`, `build`,
and `git diff --check` all pass. The route table is otherwise unchanged from
step 7. Confirmed against the running production server: `/intake` returns
`200` and server-renders the first question, the standing exit, and the
"nothing is saved or sent" copy.

**Not verified visually:** no browser automation is available in this
environment, so the slider's overlay CSS — two transparent range inputs with
`pointer-events` re-enabled on their thumbs — was checked by confirming the
compiled rules are present in the production stylesheet
(`::-webkit-slider-thumb`, `::-moz-range-thumb`, both `pointer-events` values),
not by dragging it. Worth a manual click-through before the phase merges.

**Known and expected:** the catalog is still empty, so the configuration and
city questions render their "nothing is published yet" message rather than
options. That path is covered by a test, the flow still completes through it,
and step 9 is where real published properties arrive.

## 2026-09-07 — Phase 2B step 7 complete: the landing page, and the last of the scaffold

**Done:** `/` is the buyer landing page
(`src/components/buyer/landing-screen.tsx`, `src/app/page.tsx`): the
proposition, two entry points into browse and guided intake, four principles
describing how the catalog treats facts, a section on why no prices appear, and
the real scope of what is covered. The `create-next-app` scaffold that had
survived in `src/app/page.tsx` since Phase 0 is gone, along with the five
unreferenced starter SVGs in `public/` — which were being served publicly from
a property site.

**The landing reads no data, deliberately.** A strip of recently published
properties was the obvious alternative and would have reused `PropertyCard`
against the existing `newest` ordering honestly. But nothing on this page varies
by request, visitor, or catalog state, so the most-visited page in the product
prerenders at build with no database dependency — consistent with the reasoning
that kept build-time Postgres out of the dossier's ISR — and no "featured"
ordering is invented that the catalog could not justify. Worth revisiting in
step 9, when real published properties exist to design a content strip against
rather than an empty table.

**The page says only what the product can support.** Its four principles each
restate a rule enforced elsewhere in this codebase rather than making a promise:
areas are never converted between bases, facts are reviewed before publication,
gaps are stated rather than filled, and RERA is a cross-check rather than a
badge. Tests assert the page promises no shortlist, no saved properties, and no
side-by-side comparison — all three are Phase 3, and a landing page advertising
them would be describing a product that is not there.

**The price stance gets a section rather than a footnote.** A buyer who cannot
find a price will assume the data is broken unless told it is deliberate, and
the footer's single line was not enough to carry that.

**Calls to action come from `BUYER_NAV`.** The header has linked `/properties`
and `/intake` since step 4; the landing destructures the same constant rather
than restating the paths, with a test asserting the rendered hrefs match. Two
hand-written copies of a route are the smallest version of the divergence
problem this project exists to prevent.

**Verified:** `bun run test` reports **357 passed across 23 files** (345 from
step 6, plus 12 for this step); `format:check`, `lint`, `typecheck`, and `build`
all pass, with `/` reported as `○ (Static)`. Confirmed against the running app:
`/` and `/properties` return `200`, and `/next.svg` now correctly returns `404`.

**Known and expected:** `/intake` returns `404` until step 8 lands. The header
has carried that link since step 4, and nothing merges to `main` before the
phase boundary.

**A flaky test from step 5 was found and fixed.** The full suite failed once
during this step's verification and passed on a re-run — a re-run is not an
answer, so it was reproduced: `filter-options.integration.test.ts`'s ordering
assertion failed in three of five isolated runs. The cause was in the test, not
the code. It compared Postgres's ordering against JavaScript's own by
re-sorting the list, but Postgres orders by the database collation —
`English_India.1252` on this checkout, confirmed by querying `pg_database`
rather than assumed — which is case-insensitive, while JavaScript's comparison
operators use code-point order. The two disagree whenever values differ in
case, so a random fixture suffix beginning with a letter (`"North a1b2"` versus
`"North Locality"`) flipped the expected order. The assertion now checks the
relative order of two localities that differ at their first letter, which is
the same under any collation. Worth remembering more generally: a database's
ordering must never be asserted by re-sorting in the application language.
Confirmed with six consecutive clean runs of the integration files and three of
the full suite.

## 2026-09-07 — Phase 2B step 6 complete: the property dossier, and both blocking gates closed

**Done:** `/properties/{slug}` renders the full dossier
(`src/app/properties/[slug]/page.tsx`,
`src/components/buyer/dossier-screen.tsx`, `src/lib/properties/dossier.ts`):
identity and developer, possession and scale, unit variants with per-basis areas
and room dimensions, amenities and specifications with their explicit states,
media, RERA facts, location, and the developer's own record — organised
progressively rather than dumped as a table.

**Both open decision gates were resolved before any code was written, both by
deferral.** **Media delivery** moves out of Phase 2B: `property_media.media_type`
includes `brochure_pdf`, so buyer-facing media can itself be a brochure — the
document class that carries price lists — and `ARCHITECTURE.md` puts brochures
and buyer media in the same GCS storage, which makes "public bucket" a much
larger question than it looks. Nothing can populate media this phase anyway,
since the OCR field contract has no media field and no GCS SDK or credentials
exist. **`PropScoreDial`** is out of 2B entirely: no calculation is defined, and
a dial built from the current catalog would present a number the data does not
support — a decorative trust signal in its most damaging form, because a score
looks like a measurement.

**The dossier is incrementally statically regenerated.** `revalidate = 3600`
with a `generateStaticParams` returning an empty array, `dynamicParams` left at
its default — checked against the Next 16 docs bundled in `node_modules`, which
state that returning an array, even an empty one, keeps the route statically
rendered and that an empty one renders each path on first visit. This needs no
database at `next build`, which step 3 had already flagged as a blocker for
prerendering, and a newly published property is served on its first request
rather than 404-ing until a redeploy. `next build` confirms `● (SSG)`.

**Structured data describes a residence, never an offer.** schema.org
`ApartmentComplex` with no `Offer` and no price property, run through the same
`findForbiddenKeys` guard that protects API responses — an offer exists to state
a price, so modelling the page as one would force a choice between fabricating
one and publishing a conspicuously priceless offer. Amenities map honestly:
offered is `true`, explicitly refused is `false`, and unrecorded is omitted,
because no claim has been made either way.

**Two absence rules were decided here.** `rera_registered: false` renders "Not
stated", never "Not registered" — nothing sets the flag, so false means "no
registration recorded", not the accusation of non-compliance the other wording
would publish. And an unpublished area basis is never derived from a published
one; carpet area is not a fixed ratio of super built-up area, and a computed
number sitting beside published ones is indistinguishable from a fact.

**A table dump was caught by running the page, not by reasoning about it.** The
amenity catalog has 26 entries and publishing writes a row for every one, so a
real property rendered a wall of "Not stated" that buried its two real answers.
Stated facts now lead the section and the unrecorded ones sit in a `<details>`
whose summary names the count ("24 not recorded for this property"). Every row
is still in the markup, grouped and labelled, and it opens without JavaScript —
progressive disclosure, not concealment.

**Guards verified by planting violations,** per the standing rule: deriving
built-up area from carpet area at a 1.2 ratio failed both the unit test and the
rendered-screen test; adding an `Offer` to the JSON-LD failed five tests,
including the production exclusion guard.

**Verified:** `bun run test` reports **345 passed across 22 files** (282 from
step 5, plus 63 for this step); `format:check`, `lint`, `typecheck`, and `build`
all pass. Confirmed against real published data too: both dossiers, `200` on
each slug and `404` on an unknown one, the title, meta description, and JSON-LD.

**Also worth knowing:** the dossier is the first surface where `VerifiedBadge`
is reachable at all, since `PropertyDossier` is the only shape carrying the RERA
registration number that is its evidence. It still cannot appear in real data,
because nothing sets `rera_registered`.

## 2026-09-07 — Phase 2B step 5 complete: `/properties` is a real, filterable browse screen

**Done:** The first buyer screen mounted at a route. `src/app/properties/page.tsx`
renders published catalog data through `BrowseScreen`
(`src/components/buyer/browse-screen.tsx`), with the summary card
(`property-card.tsx`), the filter form and its removable filter chips
(`browse-filters.tsx`), the URL arithmetic behind every control
(`src/lib/properties/browse.ts`), and the filter vocabularies
(`src/lib/properties/filter-options.ts`). Every filter in the step 1 contract has
a control, plus pagination, both sorts, and two distinct empty states.

**The page calls the read layer directly rather than fetching its own API.** A
server component fetching its own HTTP route would need an absolute origin URL
it has no reliable way to know, add a network hop to every render, and hand back
JSON typed only by assertion. What the HTTP edge contributes is kept rather than
skipped: the page validates with the same `parseListParams` the route uses, so it
cannot accept a query the API would reject, and passes its result through the
same `assertNoExcludedData` guard, so a price reaching the read layer fails the
page as loudly as it fails the API. The route's `Cache-Control` policy is
untouched and still serves its own consumers.

**Filtering is a plain `GET` form, and the page canonicalises what it submits.**
There is no `"use client"` anywhere in this step. A `GET` form submits every
control it owns, so "Any city" emits `?city=` — which the contract rejects with
`422`, correctly, because over the API an empty value is a broken request rather
than an absent filter. The page drops empty values and explicit defaults and
redirects when that changed anything, so every filtered view is a clean,
shareable, bookmarkable address that works before any JavaScript arrives.
Canonicalisation drops only what a form could not help sending: a malformed
value still reaches validation and is still reported, and an unknown parameter
is still rejected as unknown. A rejected query shows the unfiltered catalog with
a notice carrying the API's own message, rather than a `422` body — the buyer
following a stale link did nothing wrong.

**Three absences on the card were decided, not overlooked**, and each is held by
a test that fails if reversed. **No image:** `gcsPath` is a storage path, not a
URL, and the media-delivery gate still blocks step 6; the card holds a neutral,
textless, `aria-hidden` frame, which makes no "no photo" claim because a
property may well have one this build cannot display. **No verified badge:**
`PropertySummary` carries `reraRegistered` but not the registration number
`VerifiedBadge` requires as evidence, so the card literally cannot construct a
verified fact — the badge stays with the dossier rather than widening the step 1
contract as a side effect of a listing-grid task. **No save or compare:** both
are Phase 3 and depend on routes that do not exist.

**Filter options are derived from published data, never from the catalog in
full.** Publishing writes a `property_amenities` row for every catalog amenity —
the selected ones `available` and the rest `not_stated` — so a status-blind
query would offer all 26, every unselected one of which returns an empty page
and reads as a broken screen. Verified by removing the status filter and
watching the count reach the full catalog, per the standing rule that a guard
which cannot fail proves nothing. The media reservation was verified the same
way, by rendering `gcsPath` as an `<img src>`.

**Possession dates are formatted by hand rather than through `Date`.**
`new Date("2027-01-01")` is UTC midnight, which renders as 31 December 2026 for
any reader west of Greenwich. Shifting a published date by a day is exactly the
kind of invented fact this product exists to avoid.

**Verified by running it, not only by testing it.** Against three properties
published through the real `publishSubmission` transaction: the grid, the
vocabularies, the sparse property rendering "Not stated", both empty states, the
AND semantics of two amenity filters, both sorts, and pagination with its inert
ends. The seeded rows were removed afterwards.

**Verified:** `bun run test` reports **282 passed across 20 files** (191 from
step 4, plus 91 for this step). `format:check`, `lint`, `typecheck`, and `build`
all pass, and `next build` reports `/properties` as `ƒ (Dynamic)`.

**Worth knowing:** running `next dev` rewrites the tracked `next-env.d.ts` to
point at `.next/dev/types/...` where `next build`/`next typegen` point at
`.next/types/...`. It is generated; restore it rather than committing the dev
variant.

## 2026-09-02 — Phase 2B step 4 complete: the buyer shell and the two trust primitives

**Done:** The shared buyer components, under `src/components/buyer/` —
`page-frame.tsx` (the shell plus `PageContainer`, `GridRow`, `PageSection`),
`site-header.tsx`, `site-footer.tsx`, `typography.tsx` (`DisplayHeading`,
`BodyText`, `Eyebrow`, `TabularValue`), `verified-badge.tsx`, and
`fact-value.tsx`. This is the buyer shell specifically; the developer and admin
portals are separate surfaces and this must not grow into one shell gated by
role.

**The two trust rules are enforced by shape, not by discipline.**
`VerifiedBadge` takes a verified _fact_ or `null` — no boolean, no `variant`, no
`children`, no `className` — so there is no way to call it that renders Soft
Gold decoratively, and `null` renders nothing at all. The fact is only derivable
from a RERA registration that carries an actual registration number, which the
badge then displays: the claim and its evidence are inseparable, which is what
`design.v1.md` means by an evidence path. `FactValue` owns the absence
vocabulary — "Not stated" for an unanswered question, "Not offered" for an
answered one — distinct in wording, styling, and explanatory title. A stray
value passed beside an explicit status loses to the status, so a contradiction
surfaces as a defect rather than rendering as though correct, and zero is
treated as a stated value rather than absence.

**The verified badge is currently unreachable, and that is correct.** Nothing
sets `properties.rera_registered`, which defaults to `false`, and the field
contract records against `property.rera_registration_number` that "OCR never
sets RERA verification or a verified badge". A trust signal that extraction
alone could produce would not be a trust signal. It waits on the GujRERA
cross-check path. Step 6's dossier must render correctly with no badge, exactly
as it must with zero media.

**The layout grid is now a token, not a habit.** `--layout-columns`,
`--layout-gutter`, `--layout-margin-mobile`, `--layout-margin-desktop`, and
`--layout-max-width` live in `globals.css`, and the page frame reads them
instead of hard-coding `px-12`. The documented 12-column / 24px / 48px / 16px
grid is therefore stated once; `design-tokens.test.ts` locks the values and
checks each sits on the 8px rhythm.

**A gap in the existing gold guard was closed.** The token test keeps Soft Gold
out of every shadcn colour slot, but nothing stopped a component naming
`--color-verified-gold` directly to make a card feel premium.
`src/components/verified-gold-reservation.test.ts` now scans the source and
fails if any file other than the token declaration and the badge itself
references it. Verified by planting a violation in the footer and watching the
guard fail with that file named — a guard that cannot fail proves nothing.

**Verified:** `bun run test` reports **191 passed across 15 files** (144 from
step 3, plus 47 component and token tests). `format:check`, `lint`, `typecheck`,
and `build` all pass.

**Left for step 7, deliberately:** `src/app/page.tsx` still holds the
`create-next-app` scaffold, so these components are covered by tests but are not
yet mounted in a rendered route.

## 2026-09-02 — Phase 2B step 3 complete: the two buyer read routes are live

**Done:** `GET /api/v1/properties` and `GET /api/v1/properties/{slug}` are
implemented over the step 2 read layer, at
`src/app/api/v1/properties/route.ts` and
`src/app/api/v1/properties/[slug]/route.ts`. Both are thin: parse, query,
respond. Everything with branches — parameter validation, the error envelope,
the cache policy, and the response builders — lives in
`src/lib/properties/http.ts`, because a `route.ts` imports `@/db`, which throws
at import time without `DATABASE_URL`, and the parameter contract should not
need Postgres to be tested.

**Caching was a real decision, not a default.** Three things were checked
against the Next 16 docs bundled in `node_modules` rather than assumed:
`cacheComponents` is off, so `GET` Route Handlers already run at request time;
`dynamic = "force-static"` cannot apply to the listing route at all, because a
force-static handler cannot read `request.nextUrl.searchParams` and that route
is entirely query parameters; and prerendering the dossier route would require
Postgres reachable at build time. So neither route exports a segment config, and
caching is expressed as HTTP `Cache-Control` for a shared cache — listing
`s-maxage=60`, dossier `s-maxage=300`, both with `stale-while-revalidate`, and
`no-store` on every error so a 404 cannot outlive the publish that resolves it.
Shared-cache only, no browser `max-age`, so changing a filter never returns
something the buyer's own browser is holding. Page-level ISR stays with the
dossier page in step 6, which is where SEO actually lives. `next build` reports
both routes as `ƒ (Dynamic)`, confirming it.

**One ambiguity in the step 1 contract had to be resolved rather than guessed.**
The error envelope's `code` field read as either the HTTP status restated or a
failure-class name, and the spec never said which. It is now a machine-readable
slug (`invalid_query_parameter`, `unknown_query_parameter`,
`property_not_found`, `internal_error`), with the HTTP status carrying the
status and `message` naming the offending parameter — and `api-spec.v1.md` has
been amended so the ambiguity does not survive the step.

**Validation repairs nothing.** The contract already said an over-large
`pageSize` is rejected rather than clamped, because a silent clamp lies to the
caller. The same reasoning was extended and documented: a non-repeatable
parameter given twice, an empty value (`?city=`), and a loose integer (`1.5`,
`1e2`, a leading space) are each `422` rather than coerced. The distinction the
routes turn on is unchanged and now tested from both sides — an unknown lookup
key (`propertyType=nonsense`) is a valid query answered with an empty page,
while a malformed value is a broken request answered with `422`.

**The exclusion-list guard now runs in production, not only in tests.**
`no-price.ts` existed from step 2 but was invoked only by tests, so a leak
introduced by a later `select()` would be caught only where a test happened to
walk. Every successful buyer response is now scanned immediately before
serialisation; a body carrying an excluded key fails with `500` rather than
being served with the key quietly stripped, and the offending paths are logged
server-side, never returned. It is tested against a planted leak first — a guard
that cannot fail proves nothing.

**Verified:** `bun run test` reports **144 passed across 10 files** — the 105
from step 2, plus 27 parameter-contract tests needing no database and 12
database-backed wire tests that call the real handlers, with real published
data, and scan the serialised response body for excluded keys. `format:check`,
`lint`, `typecheck`, and `build` all pass. Route test fixtures are published
through the real `publishSubmission` transaction, as in step 2.

**Branching changed at the user's instruction:** Phase 2B now uses one branch,
`task/phase-2b`, instead of one per step. The step branches were a single linear
chain wearing four labels, so collapsing them moved no commits and left `main`
untouched. `AGENTS.md`'s branch rule was amended to match.

## 2026-09-02 — Phase 2B step 2 complete: typed read layer, fixtures, and a working local database

**Done:** Built the buyer read layer under `src/lib/properties/`: `types.ts`
(the step 1 contract as TypeScript, describing the wire shape so numerics stay
strings and timestamps stay ISO), `queries.ts` (`listPublishedProperties` and
`getPublishedPropertyBySlug` as read-only Drizzle queries), `fixtures.ts`
(typed doubles including a deliberately sparse property), and `no-price.ts`
(the exclusion-list guard).

**Three implementation decisions worth knowing:** the database handle is a
function parameter rather than a module import, because `@/db` throws at import
time without `DATABASE_URL` and would otherwise force every fixture test to need
Postgres. BHK and amenity filters use `EXISTS` rather than joins, so a property
with three matching variants still counts once instead of inflating pagination
totals. And the exclusion-list guard is runtime code rather than a test helper,
so fixtures and database tests assert the same rule through one implementation —
and the guard is itself tested against planted leaks first, since a guard that
cannot fail proves nothing.

**Local Postgres is now running, routed entirely through env.** Docker could not
be used (Docker Desktop cannot start — WSL is not installed on this machine), but
a native PostgreSQL 18 install was already present on port 5432. Created the
`propcompare` database, the `private` schema, and the three roles, replicating
`docker/postgres-init/*.sql` plus the ownership grants the container otherwise
gets for free. Nothing is hard-coded: `.env` is gitignored and `.env.example`
remains the template, so a second developer points the same three variables at
their own instance. Documented in
[docs/local-database-setup.md](docs/local-database-setup.md), covering both the
Docker path and the native path. Verified the privilege split holds — the
application role is refused on `private`, the service role is allowed.

**Verified:** `bun run test` reports **105 passed across 8 files** — the first
fully green suite in this project. That includes 35 fixture-path tests needing no
database, 24 new read-layer database tests (pagination, every filter, both sorts,
slug-not-found, price-absence on real query output), and the 6 publisher
integration tests that had never once been runnable here. `format:check`, `lint`,
`typecheck`, and `build` all pass. Read-layer database tests seed their
properties through the real `publishSubmission` transaction, never direct catalog
inserts — the one-write-path rule binds tests too.

**Contract gained two rules it was missing**, found by implementing against it:
`primaryMedia` resolves to the `isPrimary` row, else lowest `displayOrder`, else
`null`; `bhkTypes` is the distinct set across a property's variants. Both are now
in `api-spec.v1.md` so the document and the code cannot drift.

**Defect found and fixed: the migration journal was never committed.**
`.gitignore` had excluded `drizzle/meta/` since the first Phase 0 baseline, so
`db:migrate` could not run on a fresh checkout. Reproducing it rather than
assuming showed the worse half: `db:generate` emitted a _second_ migration
numbered 0000, colliding with the existing one, and because migration 0001 is
hand-written SQL that drizzle-kit cannot regenerate, a regenerated baseline
silently drops the `propcompare_service` grant. Fixed by un-ignoring
`drizzle/meta/` and reconstructing the journal for all five migrations plus the
current schema snapshot — verified both ways: `db:generate` now reports no schema
changes, and `db:migrate` against an empty throwaway database applied all five
and produced a `pg_dump` structure identical to the working one. Also untracked
`tsconfig.tsbuildinfo`, a build cache that was committed and churns on every
typecheck.

**A privilege bug in this session's own setup, caught by that comparison.** The
hand-written local bootstrap had added `ALTER DEFAULT PRIVILEGES` as a
convenience, which granted `propcompare_service` write access to all 36 public
tables — the migrations grant it `SELECT` on `public.unit_variants` alone. The
migrations were already self-sufficient for privileges. The local database was
rebuilt through `db:migrate` and now matches the design exactly: the service role
holds zero write grants on public and one SELECT, and the app role is still
refused on `private`. Both corrections are recorded in `DECISIONS.md`.

**Next up:** step 3 — the buyer read routes (`task/phase-2b-api-routes`):
`src/app/api/v1/properties/route.ts` and `[slug]/route.ts` over this layer, query
parameter validation and coercion returning the documented `422` envelope, and
deliberate caching/revalidation.

## 2026-09-02 — Phase 2B step 1 complete: buyer read contract specified

**Done:** Both buyer read routes are now fully specified in
[docs/api/api-spec.v1.md](docs/api/api-spec.v1.md), replacing the one-line
summaries that blocked every screen in this phase. `GET /api/v1/properties`
documents its query parameters with types and match semantics, pagination, sort,
the `PropertySummary` shape, and its error cases;
`GET /api/v1/properties/{slug}` documents the full `PropertyDossier` shape —
property facts, developer, location, possession, RERA facts, unit variants with
per-basis areas and dimensions, controlled amenities and specifications carrying
their `not_stated` / `explicitly_not_offered` status, and media — plus ordering
rules and 404 behavior. Both routes moved from Planned to Specified in the route
table. Documentation only; no code changed.

**Decision gate resolved:** the v1 listing filter set is fixed at `city`,
`locality`, `propertyType`, `bhk`, `possessionStatus`, and repeatable `amenity`
— the full set matching `prd.v1.md`'s stated browsing dimensions, chosen over a
reduced set that would have deferred amenity filtering. `propertyType` and `bhk`
filter by lookup `key` rather than UUID, keeping listing URLs human-readable and
stable across a re-seed. Recorded as a dated `DECISIONS.md` entry.

**Two rules written down normatively so they cannot be re-invented later:**
presence of a row in `properties` _is_ publication — there is no status column,
and rows only ever arrive through the publish transaction, so "published" needs
no filter and no one should add one. And the exclusion list now binds both
routes at any nesting level: no `unit_price_history`, price, price-per-sqft,
private bucket, submission or review status, provenance, evidence, or OCR
confidence may appear in a buyer response.

**Judgement calls made while writing the contract**, all derived from existing
schema or documented rules: `pageSize` caps at 50 and rejects rather than
silently clamps; repeated `amenity` narrows with AND and matches only
`status = "available"`, since neither honest-incompleteness state is a claim the
amenity exists; `sort` offers only `newest` and `name`, as there is no price to
sort by; an unknown lookup key returns an empty result while a malformed enum or
page number returns `422`; and the dossier returns every associated
amenity/specification row regardless of status, so the client can render absence
explicitly instead of receiving a pre-filtered list.

**Verified:** `bun run format:check` passes. No other check applies — nothing
executable changed.

**Next up:** step 2 — the typed read layer and fixtures
(`task/phase-2b-read-layer`): exported TypeScript types mirroring this contract
exactly, `listPublishedProperties` and `getPublishedPropertyBySlug` as read-only
Drizzle queries, and fixtures satisfying the same types including a deliberately
sparse property.

## 2026-09-02 — Phase 2B step 0 complete: UI tooling baseline

**Done:** Installed dependencies and stood up the buyer-UI toolchain.
shadcn/ui was initialized on the Radix base and then reconciled onto the Soft
Daylight palette: the generator had written its own neutral grayscale token set,
bound Geist over Plus Jakarta Sans, set a 10px radius against the documented
8px, and invented a dark theme. Every shadcn semantic token in
`src/app/globals.css` now resolves to a documented Soft Daylight token or a
`color-mix()` tonal layer derived from one, and `src/app/layout.tsx` is back on
Cormorant Garamond + Plus Jakarta Sans. Added a second Vitest project (`ui`,
jsdom + Testing Library, `.test.tsx`) beside the existing node project
(`.test.ts`), which runs unchanged.

**Guardrail:** `--color-verified-gold` staying out of the component palette is
now enforced by `src/app/design-tokens.test.ts` rather than by convention — it
also fails if the generated grayscale palette or a non-8px radius is
reintroduced by a future `shadcn init`.

**Two pre-existing defects found and fixed:** `bun run typecheck` could never
pass on a fresh checkout, because `layout.tsx` uses the generated `LayoutProps`
type from the gitignored `.next/types` and CI has no build step — the script is
now `next typegen && tsc --noEmit`. And with no `.gitattributes`, a Windows
checkout materializes CRLF, failing `format:check` on all 65 files despite
correct formatting; `* text=auto eol=lf` fixes it without changing any stored
content. Separately, the first `bun install` silently produced eight empty
package directories from a corrupted cache, fixed by `bun pm cache rm` and a
clean reinstall.

**Verified:** `bun run format:check`, `bun run lint`, `bun run typecheck`, and
`bun run build` all pass. `bun run test` reports 40 passed across 5 files (33
pre-existing unit tests, 5 new token-contract tests, 2 button smoke tests). The
6 database integration tests still cannot run locally — Postgres is not up and
`DATABASE_URL` is unset — which is unchanged from before this step.

**Deferred deliberately, not silently:** dark mode (Soft Daylight documents no
dark palette, so the invented one was removed rather than kept), `--destructive`
(no documented error colour; a restrained placeholder is flagged in the CSS),
and chart/sidebar tokens (they belong to Phase 4 and admin surfaces).

**Next up:** step 1 — fully specify the two buyer read routes in
`docs/api/api-spec.v1.md`, including resolving the open filter-set decision
gate. No screen work begins before it lands.

## 2026-09-02 — Phase 2B planned; buyer read contract identified as a hard prerequisite

**Done:** Split Phase 2B into an ordered, independently reviewable ten-step
implementation plan
([docs/tasklists/2026-09-02-phase-2b-implementation-plan.md](docs/tasklists/2026-09-02-phase-2b-implementation-plan.md)),
each step taking its own short-lived branch. Recorded three dated `DECISIONS.md`
entries for choices made this session: the buyer read layer is implemented as
real Drizzle queries with fixtures as typed test doubles sharing the same
exported types (superseding the roadmap's fixture-only assumption, which
predated Phase 2A landing); shadcn/ui with Radix is adopted as the buyer
component foundation restyled to Soft Daylight tokens; and buyer UI is tested in
a jsdom Testing Library project alongside the existing node-environment tests.

**Blocker found before writing any code:** both Phase 2B routes
(`GET /api/v1/properties`, `GET /api/v1/properties/{slug}`) exist in
`docs/api/api-spec.v1.md` only as one-line summaries, with no request, response,
pagination, filter, or error semantics. The spec's own contract-change process
requires those to be defined before a consumer starts work, and the roadmap
assumes the read contract is fixed up front. Defining it is therefore step 1 of
the plan, and no screen work begins before it lands.

**Also noted:** `node_modules` is absent, so nothing currently runs until
`bun install`; Soft Daylight tokens are already wired into `src/app/globals.css`
from Phase 0; and three decision gates are open and recorded in the plan — media
delivery for `property_media.gcsPath`, whether `PropScoreDial` ships in 2B, and
the fixed v1 filter set for the listing route.

**Next up:** step 0 (tooling baseline — `bun install`, shadcn/ui, jsdom/Testing
Library) followed by step 1 (the buyer read contract), per the plan.

## 2026-09-07 — Schema v5 and OpenRouter OCR merged as a verified Phase 2A milestone

**Done:** The schema-v5 brochure-field work and the OpenRouter Claude Sonnet 5
OCR worker are ready to merge as a bounded Phase 2A milestone. The worker makes
one physically trimmed native-PDF request per confirmed non-ignored scope,
validates results against the active field contract, creates only reviewable
submission fields/evidence, and never writes a live catalog row. A parsed JSON
checkpoint is atomically written to the gitignored local checkpoint directory
after every successful scope and again before evidence persistence. A
persistence failure raises `OcrPersistenceError` with the already-paid parsed
result, which `retryOcrExtractionPersistence` can persist without another
provider call. Duplicate snippets mapping to the same field/page/value-path are
merged before insertion.

**Live verification:** An explicitly authorized Adani Amaris run completed
through the real OpenRouter/Sonnet provider and the real local Postgres worker.
Four trimmed excerpts (7.21 MB, 1.94 MB, 0.54 MB, and 1.80 MB) were sent instead
of the 44.09 MB source PDF. OpenRouter reported 31,378 prompt tokens, 29,149
completion tokens, 16,783 reasoning tokens, and **$0.354246** total cost. The
transaction completed with 16 `needs_review` submission fields and 25 evidence
rows. The smoke harness then deleted only its temporary submission/source/job
rows; the local checkpoint remained available and is gitignored. No brochure
PDF or raw OCR output was committed.

**Verification:** The live run above proves the real provider-to-Postgres path;
`bun run db:generate`, lint, typecheck, scoped formatting, and `git diff --check`
pass on this handoff. The task's focused adapter and ingestion tests cover output
mapping, malformed/length failures, incremental checkpointing,
duplicate-evidence consolidation, and submission evidence persistence. A fresh
full `db:migrate` and DB-backed test-suite rerun is currently blocked because
Docker Desktop/local Postgres is offline (`ECONNREFUSED`); repository-wide
`format:check` also reports pre-existing formatting drift outside this milestone.

**Still open (Phase 2A):** Human field-level accuracy comparison for Adani
Amaris and Kimana Towers; RERA fetch/cross-check; and the admin page-routing,
submission queue, and reconciliation interfaces. This merge is a Phase 2A
milestone, not Phase 2A completion.

---

## 2026-09-02 — OpenRouter OCR adapter implemented; human brochure spot-check pending

**Done:** Implemented the real Claude Sonnet 5 extraction adapter using
OpenRouter's streaming chat-completions API and native `file-parser` PDF engine.
The adapter downloads the private source document from GCS, creates one physical
PDF excerpt per confirmed non-ignored routing scope, validates provider output
against active `property_schema_fields`, assembles at most one candidate per
unit-variant scope, and flags unknown non-commercial facts as unmapped evidence.
Commercial fields or values hard-fail the attempt. The worker transitions the
versioned OCR job and transactionally creates `needs_review` submission fields
with page/value-path evidence; no partial evidence or live catalog write occurs.

**Failure policy:** Non-timeout network errors and HTTP 408/429/5xx retry once.
Invalid JSON, output-length exhaustion, timeouts, other non-stop finishes, and
evidence-persistence conflicts fail the attempt for human re-routing. No paid
provider request was made during implementation.

**Developer handoff:** Added `docs/ocr-adapter-usage.md` with environment setup,
the server-side call sequence, GCS path behavior, failure semantics, and a code
example for the other developer. Updated the architecture, admin flow,
documentation map, `.env.example`, and artifact-ignore rules.

**Verified:** `bun run format:check`, `bun run lint`, `bun run typecheck`,
`bun run test` (48 passed, 5 files), and `git diff --check` pass. Tests generate
synthetic blank PDFs in memory and use recorded synthetic provider responses;
the repository contains no brochure PDF or raw per-brochure OCR-result JSON.

**Outstanding:** Human field-level spot-checks against Adani Amaris and Kimana
Towers remain open from provider selection. The next bounded implementation is
the authenticated admin trigger/page-picker or the carried publish HTTP route.

---

## 2026-09-02 — Schema v5 brochure fields implemented and verified

**Done:** Added nullable canonical columns for `properties.total_floors`,
`properties.plot_area_sqft`, `developers.profile_narrative`, and
`unit_variants.units_per_floor` in Drizzle and migration `0005`. Extended the
active field contract with the three scalar fields and versioned the existing
composite `unit_variants` row to v5 so `unitsPerFloor` remains attached to its
variant rather than creating a parallel scalar representation. Submission
validation accepts the new numeric, integer, narrative, and nested variant
values; the sole publish transaction writes them for new properties and applies
the same omission-preserving additive-patch behavior to existing records.

**Verified:** Generated and applied migration `0005`, reseeded the active
contract, and confirmed a second `bun run db:generate` reports no drift.
`bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test`
(41 passed, 4 files), and `git diff --check` pass. The integration coverage
publishes all four values and confirms an update that omits them leaves them
unchanged; unit coverage confirms active-contract acceptance and rejection when
the applicable contract entry is absent.

**Next up:** Implement the scoped Claude Sonnet 5 via OpenRouter adapter in
`docs/tasklists/2026-09-02-ocr-provider-integration.md`. No paid brochure run is
authorized as part of that implementation without explicit confirmation.

---

## 2026-09-02 — OCR provider selected (Claude Sonnet 5); schema v5 and two follow-on tasklists scoped

**Done:** Completed the `docs/tasklists/2026-09-02-ocr-provider-selection.md`
bake-off (4 models x 3 real brochures via OpenRouter, native-PDF-engine
plugin). Claude Sonnet 5 was cheapest of the four ($0.253/brochure avg vs.
Opus 5 $0.561, GPT-5.6 Sol $0.632, GPT-5.6 Terra $0.654) with equivalent
structural output once requests were scoped per unit-variant rather than
whole-brochure. Recorded as a dated decision rather than spending the
available OpenAI key on a redundant run. Also resolved, by explicit user
decision, that total floors, units-per-floor, non-RERA-gated plot/land area,
and a developer-profile narrative belong in the canonical schema (matching
the original whiteboard schema) rather than staying `unmapped_raw_evidence`
indefinitely — written up as schema v5 (`docs/schema/schema.v5.md`).

Both decisions are recorded in `DECISIONS.md` (2026-09-02 entries: "OCR
extraction provider is Claude Sonnet 5..." and "Schema v5 adds total
floors..."). Two follow-on implementation tasklists are scoped and ready to
start, per `AGENTS.md`'s mandatory pre-implementation tasklist rule — neither
has been implemented yet:

- `docs/tasklists/2026-09-02-schema-v5-brochure-fields.md` — Drizzle schema/
  migration for the four new columns, field-contract extension, validation
  and publisher wiring.
- `docs/tasklists/2026-09-02-ocr-provider-integration.md` — turns
  `src/lib/ocr/adapter.ts` from a type-only contract (from the OCR routing
  foundation task) into a real Claude-Sonnet-5-via-OpenRouter extraction
  adapter, adapting the scratchpad's `run-comparison.ts` reference script.

**Not yet done:** No code for either tasklist has been written. Human
spot-checks of field-level (not just structural) accuracy on the Adani
Amaris and Kimana Towers brochures remain outstanding (carried over from the
provider-selection tasklist). `room_catalog`/synonym table design (mirroring
`amenity_catalog`) is unscoped future work. The HTTP route wiring for the
publish transaction (carried from the prior task) is still open.

**Next up:** Start `task/schema-v5-brochure-fields` (small, low-risk,
unblocks the extraction adapter's output contract) before
`task/ocr-provider-integration`, since the adapter should emit against the
final contract rather than needing a second pass after schema v5 lands.

---

## 2026-09-01 — Phase 2A submission review and publish transaction completed

**Done:** Implemented the review state machine (`src/lib/submissions/transitions.ts`,
`applySubmissionTransition`) enforcing role-gated actor permissions
(submitter/verifier/owner) and legal `from`-status sets per action, including
owner-only publish and rejection of duplicate publish attempts. Implemented
`publishSubmission` (`src/lib/submissions/publisher.ts`) — the sole
transaction permitted to write `properties`, `unit_variants`, `unit_areas`,
`property_amenities`, and `property_specifications`. It row-locks the
submission, enforces the transition guard, blocks publication while any field
is `needs_review`, discards rejected/inactive fields, validates the remaining
payload against the active field contract, and applies it as an additive
patch: new properties get explicit `not_stated` rows for every unmentioned
catalog item, existing properties leave unmentioned fields, amenities, and
specifications untouched. Unit variants upsert only by exact `variant_name`.
New-property slugs use a deterministic collision suffix
(`src/lib/submissions/slug.ts`) derived from the submission id, pre-checked
via SELECT rather than a caught unique-violation (no mid-transaction
SAVEPOINT). Every publish writes one `property_revisions` snapshot in the
same transaction and writes the validated payload back onto
`property_submissions.payload` as a computed cache.

**Verified:** 10 unit tests cover `transitions.ts`; 14 unit tests cover
`validation.ts` (no DB access, `src/lib/submissions/submissions.test.ts`). 6
integration tests against local Postgres
(`src/lib/submissions/publisher.integration.test.ts`) cover: new-property
publish with catalog backfill; the needs_review block with a no-partial-write
assertion; rejection of a non-approved submission; rejection of a duplicate
publish; an additive-patch update to an existing property with untouched
fields/amenities verified unchanged; and the deferred Phase 1 private budget
bucket mapping proof (inserts into `private.unit_price_history` via the
service-role client, queries the raw `private.unit_current_bucket` view, and
confirms the mapped bucket matches the seeded band). `bun run format:check`,
`bun run lint`, `bun run typecheck`, `bun run test` (39 passed, 4 files), and
`git diff --check` all pass.

**Next up:** wire `publishSubmission` and the transition function to the
actual `/api/v1/admin/submissions/{id}` HTTP routes (currently "Planned" in
`docs/api/api-spec.v1.md`), including auth/session-derived actor role. The
admin review UI and OCR provider adapter remain later Phase 2A/2B work.

## 2026-09-01 — Phase 2A OCR routing and evidence foundation completed

**Done:** Added canonical schema v3 and migration `0003`: OCR status now belongs
to versioned extraction attempts, each attempt retains its human-confirmed page
routing manifest, and submission fields can cite multiple document pages with
JSON value paths. The provider-neutral adapter validates only active contract
fields and guarantees that a confirmed multi-page unit scope produces at most
one unit-variant candidate.

**Legacy boundary:** historical property JSON is comparison-only evidence. It
has no production submission adapter. Every curator-selected brochure will be
rerun through the new pipeline before its output is eligible for reconciliation
or publication.

**Verified:** migration applied locally; Drizzle reports no schema drift;
format, lint, typecheck, nine tests, and `git diff --check` pass. No live catalog
record or private commercial record was written.

**Next up:** continue Phase 2A with a separate task for submission state
transitions, canonical payload validation, and the transactional publish path.
Provider selection, the admin page-routing UI, and RERA integration remain later
Phase 2A tasks.

## 2026-09-01 — Phase 1 lookup catalogs and private budget boundary completed

**Done:** Seeded 26 amenities with 51 controlled synonyms, 13 specifications
with 13 source-field synonyms, and the approved 26-row OCR field contract. No
property, unit, media, or price-history record was seeded.

**Security correction:** schema v2 moves the sole `budget_buckets` table to
`private` and keeps its classifier service-only. The private seed contains 16
fixed bands; the normal app role is denied access, while the service role can
use the classifier. The Phase 3 private ±20% matcher is unchanged.

**Verified:** the migration applied locally; both seeds ran twice with stable
counts; format, lint, typecheck, tests, and migration generation pass. An
app-role private bucket query is denied with PostgreSQL code `42501`; service
access succeeds without returning price data.

**Next up:** Phase 2A implements the submission/publish transaction and OCR
provider adapter. It requires the curator-owned manifest selecting the
confirmed 24 properties; do not reconstruct that set from legacy names or
filenames.

## 2026-09-01 — Legacy OCR corpus audited structurally; lookup seeding remains review-gated

**Done:** Per user authorization, read-only structural analysis covered 27 current and 69 current-plus-historical hashed legacy OCR jobs, excluding PDFs/images and retaining no source records in this repository. The current set has 26 mechanically distinct normalized name-and-city comparisons; all historical jobs produce 28. The user-confirmed usable source set is 24, which cannot be reconstructed safely from that weak identity comparison. The versioned [audit report](docs/data/legacy-ocr-structure-audit.2026-09-01.md) records the reusable evidence envelope, coverage, a candidate OCR contract, and a deliberately conservative amenity/specification taxonomy.

**Important finding:** the amenity extraction is too noisy to seed directly (789 distinct labels in the current jobs) and every current record has legacy `verified=false`. No actual property data, price, media, or catalog relationship was imported or seeded.

**Next up:** review and explicitly approve the catalog taxonomy, synonym mappings, specification keys, budget buckets, and exact `property_schema_fields` contract in [the lookup-data tasklist](docs/tasklists/2026-09-01-lookup-catalog-data.md). A Phase 2 curator-owned source manifest will be required to select the confirmed 24 properties for submission-based ingestion.

## 2026-09-01 — Phase 1 database foundation implemented and locally verified

**Done:**

- Created the full Drizzle implementation of canonical `schema.v1`: lookup tables, public catalog, governance/provenance, Better Auth extensions, buyer records, private price history, native enums, FKs, uniqueness, and indexes.
- Generated and applied the first schema migration plus a tracked follow-up grant migration to a fresh local Postgres 17 database.
- Closed an access-control gap before it became production debt: normal app, admin-migration, and future service-role connections are separate. The normal app role has no `private` schema usage; the dedicated service role has narrowly required `BYPASSRLS` access; `private.unit_price_history` has forced RLS with zero policies.
- Added a security-invoker `private.unit_current_bucket` view and enforced at most one current price per unit variant.
- Added an idempotent lookup seed command and seeded the explicit canonical property types (3), BHK types (6), and layout types (3). Amenity/specification vocabularies, budget buckets, and OCR field definitions are deliberately pending approved source data in a separate Deep-owned tasklist.
- Verified effective role behavior: restricted app role can read public lookups but is denied `private`; service role can query the bucket view; RLS is enabled and forced with zero policies. Added two schema-contract tests.
- Recorded the role-model and no-direct-fixture decisions in `DECISIONS.md`, so the Phase 1 proof does not create an exception to the publish-only catalog rule.

**Verified:** `bun run db:migrate` against fresh local Postgres; `bun run db:seed` twice with stable counts; `bun run format:check`; `bun run lint`; `bun run typecheck`; `bun run test` (2 passing tests); and `bun run db:generate` (no pending schema changes).

**Next up:** Deep completes [lookup catalog data](docs/tasklists/2026-09-01-lookup-catalog-data.md) from approved source material. Phase 2A then implements the publish transaction so a data-bearing private bucket mapping test can use a legitimately published fixture.

## 2026-09-01 — Shared product, API, role-flow, design, and tasklist documentation established

**Done:**

- Added `docs/README.md` as the documentation map, keeping root governance/history files in place and putting collaborative product/delivery documents under `docs/`.
- Added v1 PRD, API specification, buyer/developer/admin app flows, and a screen/component-oriented design guide. Each distinguishes planned behavior from implemented functionality and anchors to the canonical schema/trust boundary.
- Established `docs/tasklists/` as the mandatory implementation-plan checklist location and created the Phase 1 data-layer tasklist.
- Updated `AGENTS.md` so future human/Claude/Codex work creates and completes a linked tasklist; task work uses a short-lived branch, while phase baselines merge/push to `main`.
- Configured the `origin` remote as `https://github.com/pikoruarealty/propcompare.git`.
- Corrected the README's stale pre-scaffolding status by adding an explicit current-status section.

**Next up:** satisfy the local Postgres prerequisite in the Phase 1 tasklist, then begin schema/migration implementation against `docs/schema/schema.v1.md`.

Running log, most recent first. This is a journal, not a status dashboard — entries are appended, not rewritten.

---

## 2026-08-31 — Phase 0 scaffolding complete; roadmap published; schema gap found and closed

**Done:**

- Scaffolded the Next.js (App Router, Turbopack) + Tailwind v4 project with Bun as package manager/runtime, merged into repo root.
- Wired Drizzle ORM (`postgres` driver) and Better Auth (phone-OTP for buyers via the `phoneNumber` plugin, email/password for developer/admin staff), with the Better Auth Drizzle schema auto-generated to `src/db/schema/auth.ts`.
- Wrote `docker-compose.yml` + `docker/postgres-init/01-schemas.sql` for local self-hosted Postgres 17 with `public`/`private` schemas (`private` locked down via `REVOKE ALL ... FROM PUBLIC`, RLS policies deferred to Phase 1 migrations).
- Added lint/format/test tooling (ESLint via `eslint-config-next`, Prettier, Vitest) and a GitHub Actions CI skeleton (`format:check`, `lint`, `typecheck`, `test` on PR/push to main).
- Published `docs/roadmap.md` — the full phase-by-phase build plan with area-of-focus ownership between Bhavarth and Deep, linked from `README.md`.
- Found and closed a real documentation gap: the original whiteboard schema image included a `Reviews` entity and an unlabeled RERA-extract fields block that never made it into `schema.v1.md`'s first pass, and whose earlier resolution had never been written down anywhere — lost to context compaction. Re-derived from a re-shared photo of the whiteboard; resolved and written into `docs/schema/schema.v1.md` and `DECISIONS.md` (2026-08-31, second dated entry): added a `reviews` table (with verification fields, not a bare star-rating table), added RERA-extract project-level columns to `properties` (`rera_project_land_area_sqft`, `rera_carpet_area_range_min_sqft`/`_max_sqft`, `rera_construction_progress_percent`), and split layout forms (Penthouse/Duplex) into a new `layout_types` lookup separate from `bhk_types`.
- Reviewed an externally-produced VC/strategy report on the business; extracted two concrete future-schema candidates (verified reviews — now designed above; developer reputation/delivery-timeline tracking — still a Phase 2A+ candidate, not yet scheduled) and discarded the rest (TAM/SAM/SOM sizing, brand-naming, GTM sequencing) as non-engineering-actionable.

**Verified:** `bun run format:check`, `bun run lint`, `bun run typecheck`, and `bun run test` (via CI-equivalent scripts) all pass clean against the current tree.

**Not yet done / blocked:**

- Local Postgres has not been brought up — Docker Desktop's engine isn't running on this machine, and starting/diagnosing it was left to the user rather than done autonomously. Until it's up, the Better Auth API route and DB connection are unverified end-to-end (typecheck-only verification so far).
- Nothing has been committed to git yet — all Phase 0 files are untracked as of this entry.
- Phase 1 (Drizzle translation of `schema.v1.md`, first migration, `private` schema RLS policies, lookup seed data) has not started.

**Next up:** bring up local Postgres (user-directed), verify Better Auth end-to-end against it, make the first git commit, then start Phase 1 per `docs/roadmap.md`.

---

## 2026-08-31 — Project restarted from scratch; foundational decisions locked; repo documentation started

**Done:**

- Confirmed this is a ground-up rebuild of `pikorua-luxe-compare` (old project, stalled after ~5.5 weeks) — old code/schema/UI treated as requirements/lessons only, not reused.
- Locked tech stack: Next.js (App Router), Drizzle, self-hosted PostgreSQL, Better Auth, GCS.
- Locked v1 scope: full three-role platform (buyer / developer / admin), sequenced buyer-first (buyer experience + admin-run OCR ingestion ship before the developer self-serve portal).
- Locked geography (Ahmedabad/Gujarat only) and broadened target market (regular-to-ultra-luxury, up from luxury-only).
- Reviewed a Stitch UI export (16 screens + 2 design-token specs); resolved a role-mapping ambiguity (developer portal and admin/verification portal are separate surfaces, not one shell) and picked the canonical design-token spec ("Soft Daylight" v2 — Cormorant Garamond + Soft Gold verified badges).
- Walked through the user's whiteboard core-property-catalog schema, resolved all 10 open questions, and produced a finalized v1 schema covering the full system: core catalog, governance/ingestion (submission + provenance model), auth/roles, buyer experience, and a private/RLS-isolated commercial-data schema for budget bucketing. Rated 8.5/10 with two named, accepted risks.
- Initialized the git repository (`main` branch) and wrote the first documentation set: `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `AGENTS.md`, `docs/schema/schema.v1.md`, `docs/design/design-tokens.md`.

**Decisions made this session:** see `DECISIONS.md` (all dated 2026-08-31).

**Not yet done:**

- No code written yet — no Next.js app, no Drizzle schema files, no migrations.
- Auth/developer/admin/submission-workflow schema exists only as a written design (`docs/schema/schema.v1.md`), not yet implemented in Drizzle.
- No initial git commit yet (docs written but uncommitted as of this entry).
- Full role-by-role screen mapping across the Stitch export was resolved at a summary level, not screen-by-screen exhaustively (a few near-duplicate screens were never opened, per the user's own note that duplicates exist).
- OCR pipeline, RERA scrape job, and the discovery/comparison matching service are all designed on paper only — no implementation.

**Next up:** scaffold the Next.js + Drizzle project structure, translate `docs/schema/schema.v1.md` into actual Drizzle schema files and a first migration, and stand up the local self-hosted Postgres (Docker) environment.
