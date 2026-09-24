# Tasklist — match a single-facility amenity spread straight against the catalog

**Status:** done, verified 2026-09-24 (synthetic adapter only; no paid run, not looked at in a browser)
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** the router's single-facility amenities categorization, already built (`e2bfdc0`, `DECISIONS.md` 2026-09-22 "Refinements to the routing pass")
**References:** `DECISIONS.md` 2026-09-22 (the categorization-fix test result and its caveat), `src/lib/ocr/page-router.ts` (`createPrompt`, the amenities category and caption rules), `docs/schema/schema.v1.md` (`amenity_catalog`, `amenity_synonyms`), `AGENTS.md` ("Controlled vocabularies... go through their catalog + synonym tables — no free-text amenity/spec fields")

## Why this exists

A brochure's single-facility marketing spread ("Dive in for sheer bliss" over a pool photo) is now correctly categorized as an amenities page (2026-09-22). The idea raised the same day, not yet built: since the page shows exactly one facility, match it straight against `amenity_catalog`/`amenity_synonyms` from the router's own pass and skip sending that page through the full amenities extraction scope a second time. Two things stand between that idea and code, found while testing the categorization fix on a fresh run (`DECISIONS.md` 2026-09-22):

1. **The router's caption is not the facility name yet.** `page-router.ts` already asks for one ("add a short 'caption' naming that one facility as printed, for example 'Swimming Pool'"), but the actual test run returned the page's own marketing tagline instead ("Dive in for sheer bliss"). The instruction exists; it is not reliable. This needs prompt work — likely a clearer either/or instruction and few-shot examples distinguishing a tagline from a facility name, verified against a few more real single-facility pages before it's trusted.
2. **The "skip a second extraction call" wiring was never designed**, only proposed. If a page's caption matches the catalog directly, what actually happens?

## Decisions, resolved 2026-09-23 (see `DECISIONS.md` "Single-facility amenity matching: skip extraction...")

1. **What "skip extraction" means concretely — resolved: (a), actually skip.** The page is removed from what the amenities scope reads, not sent alongside a normal reading. This is a real cost saving (each page is a real image-token cost in that scope's request), not just less typing.
2. **Evidence — resolved.** The router's caption is the suggestion's evidence, but it is explicitly labeled as router-detected, never presented the same way as an extraction-verified snippet. The match is never auto-accepted into `property.amenities`; it is an unconfirmed suggestion until a human reviews it.
3. **Partial pages — resolved: full skip, no hedging extraction call**, on the condition that the review screen shows the actual page image beside the suggestion, not text alone. That visible-source requirement is what absorbs the router's known recall-only fallibility (2026-09-02) — a reviewer looking at the real photo while confirming "Swimming Pool" will notice a mislabel or a second amenity in fine print; a redundant model call would not add anything a visible-image human check doesn't already cover.

## Non-goals

- Not touching multi-amenity list pages — this is single-facility marketing spreads only, the case the 2026-09-22 test isolated.
- Not building a `room_catalog`-style synonym table for anything else.

## Proposed next steps

1. **Done, 2026-09-23:** tightened `createPrompt`'s caption instruction in `src/lib/ocr/page-router.ts` — the model must now return a plain noun facility name, with the two real observed taglines from the 2026-09-22 test ("Dive in for sheer bliss", "Elevate your fitness journey") named explicitly as counter-examples of what NOT to return, and an instruction to name the facility from the image itself when the only printed text is a tagline. Prompt-only change: no routing categories, confidence handling, or extraction wiring touched. Full suite (133 files, 1591 tests) passes unchanged — prompt wording has no unit-test coverage anywhere in this module, since the only real check is a live model call. **Verified live, same day** (`DECISIONS.md` 2026-09-23 "The router's caption prompt now names a facility..."): re-running categorization on Maruti 360 shows pages 14 and 15 — which previously returned taglines never named in the prompt ("Rise above all else", "Leave a lasting impression") — now correctly return "Observatory" and "Banquet Hall", proving the fix generalizes rather than just pattern-matching the two banned examples.
2. **Resolved, 2026-09-23:** decisions 1-3 above, with the owner.
3. **Done, 2026-09-24:** the routing-contract change itself — remove a router-tagged single-facility page from what the amenities scope reads, generate a catalog-matched (or synonym-matched) suggestion from its caption, surface it in the review UI beside that page's actual image, labeled as router-detected, requiring explicit confirmation before it can reach `property_submissions`. Needs its own `DECISIONS.md` entry per `AGENTS.md` once implemented, since it changes what pages reach an extraction scope.

## Acceptance (once built)

A single-facility marketing page's amenity reaches the review screen pre-matched against `amenity_catalog` (or its own synonym), correctly attributed to that page and shown beside its actual image, without the admin having to re-type or re-select it — and without weakening the "no free-text amenity fields" rule or the "reviewed publishing" rule (the match is confirmed, not auto-accepted).

## Completion record

Built in `src/lib/ocr/single-facility.ts` (matching, evidence label), `src/lib/ocr/routing.ts` (`singleFacilities` in the manifest), `src/lib/ingestion/routing-confirmation.ts` (skip at confirmation, catalog lookup), `src/lib/ingestion/confirmed-choices.ts` (read back as amenities), `src/lib/ocr/adapter.ts` (`withRouterAmenities`), `GET /api/v1/admin/submissions/{id}/brochure-page/{page}` and the review panel's `RouterSuggestion`. Tests: `single-facility.test.ts`, `single-facility-routing.test.ts`, `single-facility-ingestion.integration.test.ts`, `router-suggestion.test.tsx`, the brochure-page route test and a real-catalog case in `routing-confirmation.integration.test.ts`. Reasoning: `DECISIONS.md` 2026-09-24 (single-facility pages). Only a caption that exactly matches a catalog name or synonym is skipped, so a page with no match is still read.
