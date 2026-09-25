# Tasklist — floor-plan pages tied to their unit types automatically

**Status:** done, verified 2026-09-24
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** `docs/tasklists/2026-09-23-floor-plan-unit-discovery.md` (reverted to one call per floor-plans scope), 2026-09-23 caption persistence (`OcrRoutedPage.label`)
**References:** `DECISIONS.md` 2026-09-24 (this), 2026-09-22 (Maruti 360's floor plans matched by hand from captions), `src/lib/submissions/brochure-page-media.ts` ("Use as image"), `docs/design/comparison.v1.md` (floor plan row)

## Scope

Anamika High Point and Maruti 360 both reached publication with zero floor-plan images because "Use as image" has to be run by hand on every confirmed floor-plan page, typing the unit type each time. This ties each extracted unit type to its own floor-plan page(s) automatically and offers them as **needs-review candidates**, so an admin approves a picture instead of hunting for it.

The tie is made from the router's per-page caption (read off the page's own printed heading), not the model's cited page numbers. Reviewing Anamika against the rendered pages showed the model's citations were one page too high for both Block B & E unit types, while every router caption was right. The citation is used only to choose among several pages that carry the same caption.

## Non-goals

- No auto-approval or auto-publish. Every image is private and `needs_review`, uploaded by nobody (`uploaded_by` null); only the `property_submissions` publish transaction can make one live.
- No positional or ordering guesses. A unit type with no page whose caption names it is left for a manual choice.
- No change to the extraction prompt or routing contract, and no provider call.

## Implementation checklist

- [x] Checked the model's cited pages against rendered Anamika pages 14 and 15 (they are wrong for B&E; the captions are right).
- [x] `src/lib/submissions/floor-plan-auto-map.ts`: `matchFloorPlanPages` (pure) and `autoMapFloorPlanImages`.
- [x] `addBrochurePageImage` gains `asCandidate` (private, `needs_review`) and a nullable uploader.
- [x] Hooked into `retryOcrExtractionPersistence`, after the extraction is stored, best effort (a failure is logged, never fails the extraction).
- [x] Tests: the matcher on Anamika's real captions and citations; "2 BHK" not read as "Type 2"; tie and nesting cases; integration test for candidate rows and idempotence.
- [x] `src/db/backfill-anamika-floor-plans.ts` (dry run by default): opened edit draft `720fcf56-3e9f-416e-a108-f5c1f90c6c8a` with five candidates.
- [x] typecheck, lint, full suite (135 files, 1608 tests).

## Acceptance criteria

- A new extraction leaves each discovered unit type's floor-plan page in the submission's pictures as a needs-review candidate with the unit type filled in.
- Nothing is public until an admin approves it and publishes.

## Completion record

2026-09-24. Anamika's draft holds five candidates (Block A p20; B & E Type 1 p14, Type 2 p15; C & D Type 1 p17, Type 2 p18), all needs-review and private. Not run against a fresh paid extraction (no provider call was made); the hook is covered by the matcher and integration tests only. Maruti 360 is not backfilled here: its floor plans were already matched by hand and are live.
