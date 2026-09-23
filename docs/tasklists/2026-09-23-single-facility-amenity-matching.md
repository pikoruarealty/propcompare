# Tasklist — match a single-facility amenity spread straight against the catalog

**Status:** not started — design only, blocked on two owner decisions below
**Owner:** Bhavarth
**Branch:** none yet
**Depends on:** the router's single-facility amenities categorization, already built (`e2bfdc0`, `DECISIONS.md` 2026-09-22 "Refinements to the routing pass")
**References:** `DECISIONS.md` 2026-09-22 (the categorization-fix test result and its caveat), `src/lib/ocr/page-router.ts` (`createPrompt`, the amenities category and caption rules), `docs/schema/schema.v1.md` (`amenity_catalog`, `amenity_synonyms`), `AGENTS.md` ("Controlled vocabularies... go through their catalog + synonym tables — no free-text amenity/spec fields")

## Why this exists

A brochure's single-facility marketing spread ("Dive in for sheer bliss" over a pool photo) is now correctly categorized as an amenities page (2026-09-22). The idea raised the same day, not yet built: since the page shows exactly one facility, match it straight against `amenity_catalog`/`amenity_synonyms` from the router's own pass and skip sending that page through the full amenities extraction scope a second time. Two things stand between that idea and code, found while testing the categorization fix on a fresh run (`DECISIONS.md` 2026-09-22):

1. **The router's caption is not the facility name yet.** `page-router.ts` already asks for one ("add a short 'caption' naming that one facility as printed, for example 'Swimming Pool'"), but the actual test run returned the page's own marketing tagline instead ("Dive in for sheer bliss"). The instruction exists; it is not reliable. This needs prompt work — likely a clearer either/or instruction and few-shot examples distinguishing a tagline from a facility name, verified against a few more real single-facility pages before it's trusted.
2. **The "skip a second extraction call" wiring was never designed**, only proposed. If a page's caption matches the catalog directly, what actually happens?

## Decisions/ambiguities that block work

1. **What "skip extraction" means concretely.** Does a directly-matched amenity still need a human review step before it can reach `property_submissions` (the standing "reviewed publishing" rule), or does catalog-matched confidence count as reviewed? `AGENTS.md`'s controlled-vocabulary rule says amenities must go through the catalog either way — this decision is about whether the _extraction call_ is skippable, not whether the _review_ step is.
2. **Evidence.** Every extracted field carries a source snippet and page citation today. A router-matched amenity has a page number but no model-generated evidence snippet — decide whether the caption itself stands in as evidence, or whether this path is only allowed to pre-fill a suggestion that a human still confirms against the actual page image.
3. **Partial pages.** A page router-tagged as single-facility but that turns out, on the extraction pass, to also show something else (the router is recall-only per the 2026-09-02 decision, so it can be wrong) — decide whether a page ever gets skipped from extraction outright, or whether this only ever adds a pre-filled suggestion alongside extraction still running normally. The safer default, given the router's known false-positive rate on other categories, is the latter: this saves a human's typing, not a provider call, until the caption's reliability is proven.

## Non-goals (for now)

- Not touching multi-amenity list pages — this is single-facility marketing spreads only, the case the 2026-09-22 test isolated.
- Not building a `room_catalog`-style synonym table for anything else.
- Not skipping the extraction call for cost savings until decision 3 above resolves — the initial version may still call extraction and only use the catalog match as a pre-filled default, in which case "skip a second extraction call" is deferred to a follow-up once the caption is proven reliable.

## Proposed next steps (not started)

1. Tighten `createPrompt`'s caption instruction with 2-3 concrete before/after examples (tagline in the page vs. the facility name to return), and re-run the same categorization test against a few more single-facility pages to check reliability before trusting it.
2. Resolve decisions 1-3 above with the owner.
3. Depending on decision 3: either (a) pre-fill a suggested `property.amenities` entry alongside normal extraction, surfaced in the review UI with its source page, or (b) actually remove the page from what gets sent to the amenities extraction scope — a routing-contract change needing its own `DECISIONS.md` entry per `AGENTS.md`.

## Acceptance (once resolved)

A single-facility marketing page's amenity reaches the review screen pre-matched against `amenity_catalog` (or its own synonym), correctly attributed to that page, without the admin having to re-type or re-select it — and without weakening the "no free-text amenity fields" rule.

## Completion record

_(fill in at completion)_
