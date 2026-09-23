# Tasklist — bound floor-plan extraction output by unit, not by hoping the scope is small enough

**Status:** code, tests and documentation done, verified 2026-09-23. One item held: the real-world re-run of the failed Godrej job needs the owner's go-ahead (paid provider call).
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** nothing new — reuses the existing `unit_variant` scope kind's prompt/parsing exactly as-is
**References:** `DECISIONS.md` 2026-09-02 ("OCR extraction provider is Claude Sonnet 5... per-scope (not whole-brochure) requests to bound completion-token risk"; the entry above it, on why grouping a unit's pages belongs to extraction, not routing, because "a cheap router classifying small page excerpts can't do this reliably"), `src/lib/ocr/adapter.ts`, `src/lib/ocr/routing.ts` (the "only one floor-plans scope" contract rule)

## The failure this fixes

`extraction 04098e3b-617c-4578-974b-3bf4220c89ac` (Godrej Properties, submission `f4c0f67e-dc78-4a9f-bf2a-ff42708fd131`) failed `output_length` on its `floor-plans` scope (9 pages). The 2026-09-02 decision bounded risk by sending one request per _scope_ instead of one for the whole brochure, but every scope call still shares one fixed `max_tokens: 32_000` (`DEFAULT_MAX_COMPLETION_TOKENS`) regardless of how many pages or units are in it. The floor-plans prompt asks for full room-by-room detail for _every_ discovered unit in _one_ response, so output size scales with page/unit count and complexity — not something a page-count threshold can safely predict (Maruti 360 succeeded with 10 pages; this Godrej brochure failed with 9, because it evidently has more or more elaborate units per page).

## Why not just pre-split the pages by count

`routing.ts` forbids more than one `floor_plans` scope in a manifest, by design: a duplex or penthouse's lower and upper levels must be read _together_ for the model to merge them into one unit rather than fragmenting it into two (`DECISIONS.md` 2026-09-02, the Kimana duplex-fragmentation bug this fixed). Splitting the 9 pages into two blind page-count groups risks cutting a duplex in half and silently reintroducing that exact bug. The router's own per-page captions can't safely substitute for this either — the router captions each page _independently_, one at a time, so it has no way to know two pages belong to the same unit; the 2026-09-02 decision already tested this exact idea at the routing stage and rejected it for that reason.

## The fix: two passes, both reading the full page range together

1. **Discovery** — one request over all of a `floor_plans` scope's pages together (same `createScopedPdf`, full quality, no compression), asking only for which pages belong to which unit — no room detail. Output is small regardless of page count, so it doesn't hit the ceiling.
2. **Per-unit extraction** — for each discovered unit, one request scoped to just that unit's own pages, reusing the _existing_ `unit_variant` scope kind's prompt and parsing unchanged (`"Extract exactly one unit variant... combine all excerpt pages into this one variant"`). Each call's output is bounded by one unit's detail, not the whole scope's.

This needs no schema or routing-contract change: the human-confirmed, stored routing manifest still has exactly one `floor_plans` scope. The two-pass split happens entirely inside `createOpenRouterOcrAdapter`'s handling of that one scope — it builds an internal, in-memory "effective manifest" (the stored one, with each `floor_plans` scope replaced by N synthetic `unit_variant` scopes) that only `extract()` itself ever sees; `parseOcrRoutingManifest`'s "one floor-plans scope" check is never run against it, because it's constructed directly rather than round-tripped through parsing.

A page a discovery call leaves unclaimed by any unit is not silently dropped: it becomes its own small fallback `floor_plans`-kind scope (the original, unchanged full-discovery-and-extract prompt), covering just the leftover pages.

## Non-goals

- Not changing the page-router (`page-router.ts`) or its captions at all.
- Not relaxing `routing.ts`'s "one floor-plans scope" contract — the fix stays entirely inside the adapter's internal handling.
- Not adding a page-count threshold or heuristic gate — the two-pass approach applies unconditionally to every `floor_plans` scope, since page count alone doesn't reliably predict risk (see above).
- Not fixing the two 2026-09-22 router follow-ups (persisting the caption, matching a simple amenity spread against the catalog) — unrelated, still queued.

## Implementation checklist

- [x] `src/lib/ocr/adapter.ts`: factored the raw "send this PDF + this prompt, get JSON back" HTTP/retry logic out of `callScope` into a lower-level `callModel(pdfBytes, filenameHint, promptText, maxTokensOverride?)`; `callScope` is now a thin wrapper calling it with `createScopePrompt`.
- [x] A discovery prompt (`createFloorPlanDiscoveryPrompt`) and a small, strict parser (`parseFloorPlanDiscoveryResponse`) for its response shape (`{"units": [{"variantName": string, "pageNumbers": [number, ...]}]}`), validating every page number is one of the scope's own pages, allowing a page to appear in more than one unit's list, and never silently dropping a page that ends up in no unit.
- [x] Inside `extract()`: `expandFloorPlanScope` expands each `floor_plans` scope into synthetic `unit_variant` scopes (via discovery) plus, if any pages are left unclaimed, one fallback `floor_plans`-kind scope for just those pages. This runs inline, in document order, inside the same loop that processes real scopes (not as a separate up-front pass) so checkpoint/billing order stays natural. `effectiveManifest` (the confirmed manifest with expansions applied) is built incrementally via a shared array reference and used everywhere `request.manifest` was used inside `extract()`.
- [x] Checkpointing: the discovery call's own response is checkpointed (before its shape is validated, same "saved before it's checked" guarantee every other scope gets) and reused on retry.
- [x] Billing: the discovery call and each per-unit call get their own usage-ledger entries (their own scope keys).
- [x] Tests: `adapter-resilience.test.ts` and `ocr.test.ts`'s floor-plans coverage rewritten for the two-call shape. New tests added: a page left unclaimed by discovery still gets extracted via its own fallback scope, not dropped; discovery naming a page outside the scope surfaces a clear `OcrContractError` (and is still checkpointed); discovery returning JSON with no `units` array surfaces a clear error.
- [x] **Found and fixed on the way, not in the original checklist:** `OcrProviderExtractionResult` gained `effectiveManifest`, and `src/lib/ocr/ingestion.ts`'s persistence path now resolves a unit variant's `scopeKey` against it instead of the confirmed manifest — without this, every floor-plan-discovered unit variant would have silently vanished at persistence. See `DECISIONS.md` 2026-09-23 for the full account.
- [ ] Real-world check: re-route and re-queue the failed Godrej job (`04098e3b-617c-4578-974b-3bf4220c89ac`'s submission) through the fixed pipeline and confirm it completes. Sanity-check discovery's grouping accuracy by comparing it against Maruti 360's already-published, human-verified unit/page mapping before trusting it on a brochure with no existing ground truth. **Held: a real paid provider call, needs the owner's go-ahead first.**

## Documentation

- [x] `PROGRESS.md` — new entry.
- [x] `DECISIONS.md` — a dated entry: this is exactly the kind of extraction-pipeline design decision the project has recorded at each turn (2026-09-02's two entries this tasklist references), and it changes how a paid provider call is shaped, which `AGENTS.md` asks to be surfaced.

## Acceptance criteria

- A floor-plans scope whose full detail would exceed the completion-token ceiling in one request now completes across several bounded requests instead of failing.
- No duplex/penthouse fragmentation: pages belonging to the same unit are never split across two different extraction calls.
- No page is silently dropped if discovery does not assign it to a unit.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` all pass.

## Verification commands

```
bun run typecheck
bun run lint
bun run format:check
bunx vitest run
```

## Completion record

**2026-09-23 — Code, tests, and documentation done.** `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bunx vitest run` (133 files, 1592 tests) all pass. A real persistence-time bug (unit variants silently dropping) was found and fixed on the way — see `DECISIONS.md`. Not yet done: the real-world verification against the actual failed Godrej job, which is a paid provider call and is held for the owner's explicit go-ahead per the standing "confirm before any paid run" rule.

**2026-09-23 — Follow-up: the real-world run above found a cost regression, fixed in the same branch.** The owner approved the re-run; it spent $1.7334 total on the Godrej submission before dying on an unrelated network error, because (1) the discovery call was not actually cheap (same page images, same default reasoning budget as a real extraction, no smaller model) and (2) the per-unit fan-out billed a shared page's image once per unit discovered on it (17 units from 5 pages; page 7 alone billed 5 times) instead of once per page. The deeper cause: the floor-plans prompt lost a mirrored/repeated-unit dedup rule this project already fixed once, on 2026-09-02 (Kimana Towers), and never carried into production — this week's discovery prompt went further and told the model to treat mirrored units as separate. Full account and the three-part fix (reinstated merge rule, cheap discovery model, page-set-deduped fan-out) in `DECISIONS.md`'s 2026-09-23 follow-up entry. The Godrej job's existing checkpoint predates this fix and needs resetting before its next retry, held for the owner's go-ahead.
