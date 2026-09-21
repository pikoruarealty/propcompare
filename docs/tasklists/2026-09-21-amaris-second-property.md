# Tasklist: Amaris as the second real property, without a paid run

**Status:** done 2026-09-21. **Note on order:** this tasklist was written after the work, not before, which `AGENTS.md` asks the other way round. The work only touched draft tables and the normal publish path; nothing was outside the rules.
**Owner:** Bhavarth
**References:** `AGENTS.md` (only the publish transaction writes live tables), `docs/schema/schema.v1.md` (`property_submissions`, `property_submission_fields`, `ocr_extraction_jobs`, `property_submission_media`), `docs/ocr-routing-contract.v2.md`, `docs/tasklists/2026-09-20-gujrera-regulator-sync.md`, `docs/tasklists/2026-09-20-confirm-pages-and-queue.md`, `DECISIONS.md` 2026-09-21

## Why

OpenRouter credit was not available, so no brochure could be categorized or extracted. The owner asked for the saved Amaris extraction (2026-09-02) to be loaded and for the brochure's pictures to be taken through the existing page-image mechanism, so two real properties exist for the visual pass and the comparison.

## Non-goals

- No provider call. Nothing that spends money.
- No new table, column or write path; no direct write to a live catalog table.
- Not a re-extraction: the saved answer is from the older pipeline (one unit type of an estimated twelve, no unit-aware prompt). It is a stand-in until credit is added and the brochure is re-run.
- Extracting single pictures from a busy brochure page (whole-page images only, as designed).

## Checklist

- [x] Find the saved answer: `.local/ocr-checkpoints/0fc03ee4-….json` (4 scopes: project, amenities, specifications, Tower A Type A; 15 fields, 1 unit type). The Amaris brochure was already uploaded as draft `47d3a1c4-…` (69 pages) with an unrun extraction job.
- [x] Replay the saved answer through `retryOcrExtractionPersistence` (the worker's own persistence function), never through the adapter, so no provider can be called. The routing manifest was rebuilt from the saved answer's own four scopes and pages, with every other page marked ignored. Script: `.local/replay-amaris.ts` (not committed; one-off). Result: 16 values, all `needs_review`, each with page evidence.
- [x] Fetch the RERA record in the admin panel with the registration number the owner gave, and use RERA's values (registration number in full, possession date 30 Nov 2029, progress 0%, status under construction). RERA lists four blocks and twelve carpet areas; Block A's 2,160 sq ft matches the brochure's 2,159.9 sq ft for Tower A Type A.
- [x] Sanity check the old extraction's units: the 19 room sizes add up to 2,055 sq ft, 95% of the 2,159.9 carpet area, so feet, not metres.
- [x] Take pictures from the brochure with the existing "use as image" route: photographs from pages 5, 11, 19 and 28; floor plans from pages 39 and 41 tied to the unit type. All credited to the developer, public by default.
- [x] Reject the extracted `developer.name` ("Adani Realty") so the existing developer profile is not renamed by the publish.
- [x] Publish through the owner's one-step Publish (14 values confirmed as they stood, named first). Buyer page, browse, comparison and dossier checked in a real browser.

## Known gaps (stated, not hidden)

- Only Tower A Type A exists as a unit type; RERA lists eleven more carpet areas that no brochure extraction has covered.
- The brochure says 80 units of the type; RERA lists 40 flats at 2,160 sq ft in Block A (Block B has the same size). The count may be Towers A and B together. Left as extracted; to be settled by the owner's spot-check.
- No legal entity is recorded for the developer, so RERA's promoter name is unmatched.
- The amenity list (15) is the brochure's; RERA states only a swimming pool.

## Acceptance

Amaris is live with its photographs and plans, a full RERA registration number and the RERA-sourced facts credited, and no price. Verified: buyer dossier, browse card, landing hero list and comparison against Kimana in Chrome.

## Completion record

2026-09-21: done as above. Follow-ups: re-run the extraction with credit (the unit-aware prompt, all twelve types) and replace the stand-in through a normal edit; owner spot-check of the 80-unit figure.
