# Tasklist — wiring `/intake` to `POST /api/v1/discovery/matches`

**Status:** done — implemented and verified 2026-09-18
**Owner:** Deep
**Branch:** task/phase-3-budget-range-matching
**Depends on:** `POST /api/v1/discovery/matches` (done — see `2026-09-18-discovery-matches-endpoint.md`)
**References:** `docs/api/api-spec.v1.md` (`### POST /api/v1/discovery/matches`), `docs/app-flows/buyer.md` (steps 2–3 and the "No matching inventory" exception path), `docs/design/design-tokens.md`, `docs/prd.v1.md`, `docs/schema/schema.v5.md` (`buyer_intake_sessions`, for what is deliberately _not_ written here), `DECISIONS.md` 2026-09-01 (±20% range), 2026-09-07 (intake hands off to `/properties`; the stated range never leaves the device; `statedRange`/`fromLakh`/`toLakh` naming), 2026-09-18 (the endpoint is stateless; Phase 3 backend ownership)

## Scope

The first of Deep's four Phase 3 UI slices, and the only one whose backend exists today. Guided intake currently ends by linking to `/properties` pre-filled with `city` and `bhk` — a placeholder the 2026-09-07 decision explicitly wrote to be replaced once matching shipped. It has now shipped, so the summary step gains a real match action: it POSTs the buyer's stated range to `POST /api/v1/discovery/matches` and renders the returned published summaries in place.

The whole slice is client-side and stateless end to end. Nothing is persisted, nothing reaches a URL, and no price, bound, or bucket value is rendered or received.

## Non-goals (explicitly out of scope for this task)

- **No new route or page.** Results render inside `/intake`. See the design constraint below — there is no mechanism available today that could carry the stated range to a second address.
- **No backend change of any kind.** All Phase 3 backend is Bhavarth's (`DECISIONS.md` 2026-09-18). The one contract gap this slice found is written up below as a request, not implemented.
- **No save, compare, enquiry, or dossier-unlock control** on the match results. Those three routes do not exist; a disabled control promising them would be the decoration the 2026-09-07 card decision already ruled out.
- **No persistence of the buyer's answers**, including the pre-login intake cookie — deferred, `2026-09-18-pre-login-intake-cookie.md`.
- **No priorities in the request.** `PRIORITY_OPTIONS` maps to no filter the endpoint accepts, and inventing that mapping is the second de-facto contract the 2026-09-07 decision already rejected.

## The design constraint that fixes the shape of this work

The stated range cannot reach a URL (2026-09-07), `sessionStorage` was rejected on the same record, and the intake cookie is deferred. There is therefore no way to hand the range to a separate page, so the results must render where the range already lives: in `IntakeFlow`'s client state. This is not a preference between two viable designs — it is the only option consistent with the decisions already on the record. Recorded as a `DECISIONS.md` entry rather than left implicit here.

This also means the screen calls the HTTP route rather than the read layer, which is the opposite of the 2026-09-07 browse-page decision. That decision applies to a Server Component reading published data; this is a client component holding a figure that must never touch the server as anything but a request body. Also recorded.

## Blocking ambiguities — one found, resolved as a deferred contract request

**The open-ended top of the slider has no honest encoding in the current contract.** `RANGE_MAX_LAKH` reads as "₹5 crore or more" (2026-09-07, user's explicit choice), but `maxInr` is a required finite positive number. The user's decision (2026-09-18) is that the open top end should be bounded by the highest price in the published catalog, not by a literal ₹5 crore.

That cannot be implemented in this slice. The catalog's maximum price lives in `private.unit_price_history`, reachable only by the service-role connection; for the client to bound the request by it, the browser would have to be told a real price, which `assertNoExcludedData` fails in production. It has to be resolved server-side, inside the matcher that already holds that connection.

**Requested of Bhavarth, and since delivered.** The request was: `POST /api/v1/discovery/matches` accepts an unbounded upper end — `maxInr` omitted, or an explicit `maxUnbounded: true` — with `matchPropertiesByBudgetRange` resolving it against the catalog's current maximum current price, the resolved figure never returned. That landed the same day (`938f907`, `DECISIONS.md` 2026-09-18), with `maxInr`/`maxUnbounded` mutually exclusive and one required, so an omitted bound is a `422` rather than a silently wide search.

**Resolved.** The interim — sending the stated ₹5 crore and disclosing the resulting ceiling — is gone. `matchRequestBody` now sends `maxUnbounded: true` for a range left at the top of the scale, and the results header confirms there is no upper limit instead of apologising for one. The swap touched `matchRequestBody`, `isOpenEndedTop`, `describeSearchedSpan`, and one paragraph of copy, which is what isolating it was for.

## Implementation checklist

- [x] `src/lib/properties/intake-matches.ts` — the pure arithmetic between `IntakeAnswers` and the request body: lakh→INR conversion, the open-top predicate, the disclosure copy for the searched span, and the `fetch` wrapper that parses the shared `{ data, pagination }` / `{ error }` envelope. Kept out of `intake.ts` so the `Inr`-named body keys never touch the answers module that a test asserts is free of them.
- [x] `matchRequestBody(answers)` returns `null` when no range was stated — the endpoint requires `minInr`/`maxInr`, so "no range" is not a request it can serve, and the flow keeps the existing `/properties` hand-off for that case rather than inventing a range.
- [x] `src/components/buyer/intake-matches.tsx` — a pure presentational `IntakeMatchResults`: the results grid, the searched-span disclosure, the loading state, the honest empty state, and the failure state. No fetching, matching the `BrowseScreen` split.
- [x] Reuse `PropertyCard` and `GridRow` rather than a second card; reuse the browse screen's empty-state vocabulary rather than inventing a third.
- [x] `IntakeFlow` owns the request: the summary step's primary action becomes "See your matches" when a range was stated, and stays the `/properties` link when one was not. Paging re-POSTs with the next `page`.
- [x] An in-flight request is abandoned (`AbortController`) when the buyer changes their answers or starts again, so a late response cannot overwrite a newer view.
- [x] Results are cleared when any answer changes, so the grid can never describe a brief the buyer has since edited.
- [x] The summary's standing copy stops saying matching is Phase 3 and starts saying what the match actually did — including that the range is sent in the request body and not saved.

## Tests

- [x] `intake-matches.test.ts` (node): lakh→INR conversion, the ±20% disclosure span, `null` for an unstated range, open-top detection, and that the produced body carries only contract fields.
- [x] Guard: `findForbiddenKeys` still returns clean for `IntakeAnswers` — the request body is the only place `Inr` keys are allowed to exist, and they must not have leaked back into the answers shape.
- [x] `intake-matches.test.tsx` (jsdom): results grid, empty state, failure state, and loading state render from fixtures with no network.
- [x] `intake-flow.test.tsx`: no `fetch` happens until the buyer clicks the match action (the existing "makes no network call" test tightened rather than deleted); the request body carries the stated range and the city/bhk answers and nothing else; the range still never reaches any URL; changing an answer clears a rendered result; the no-range path still links to `/properties`.
- [x] A `422` from the endpoint renders the failure state rather than an empty result — "we found nothing" and "we asked wrongly" are different facts.
- [x] No rendered output anywhere in the flow contains a price, bound, or bucket value.

## Documentation

- [x] `DECISIONS.md` — three entries under Deep: results render inline in `/intake`; the screen calls the HTTP route rather than the read layer, and why that does not contradict 2026-09-07; the open-top contract gap, its interim behaviour, and the request to Bhavarth.
- [x] `PROGRESS.md` — new top entry.
- [x] `docs/roadmap.md` — Phase 3 Deep status line.
- [x] `docs/api/api-spec.v1.md` — no change. This slice is a consumer; the contract request above is Bhavarth's to spec if and when it is taken.

## Acceptance criteria

- A buyer who states a range reaches real matched results without leaving `/intake`, and without the range appearing in the URL, in storage, or in any persisted row.
- A buyer who states no range still reaches the catalog, exactly as before.
- No matching inventory shows the buyer's brief retained with an honest empty state, never a widened search or a substituted result.
- `bun run test`, `bun run lint`, `bun run typecheck`, and `format:check` on authored files all pass.

## Verification commands

```
bun run test
bun run lint
bun run typecheck
bunx prettier --check <authored files>
```

## Completion record

**2026-09-18 — Done.** Implemented `src/lib/properties/intake-matches.ts` (the answers→body arithmetic and the `fetch` wrapper) and `src/components/buyer/intake-matches.tsx` (`IntakeMatchResults`), and rewired `IntakeFlow`'s summary step to run a real match when a range was stated while keeping the `/properties` hand-off when one was not. 38 new tests across three files; full suite **493 passed across 35 files** (was 455/33). `lint`, `typecheck`, and `format:check` on authored files all clean — the repo-wide pre-existing formatting drift noted in the earlier Phase 3 entries is untouched and still belongs to whoever takes a repo-wide pass.

Three `DECISIONS.md` entries recorded: results render inline in `/intake`; the screen calls the HTTP route rather than the read layer, and why that does not contradict 2026-09-07; and the open-top contract gap with its interim behaviour.

**2026-09-18, later the same day — the open-top follow-up is closed.** Bhavarth's `maxUnbounded` contract landed (`938f907`), so the interim was removed rather than left to rot: the request now carries `maxUnbounded: true` for an open top end, the searched span reads "₹80 lakh and upwards" with no invented ceiling, and the disclosure confirms the absence of a limit instead of explaining one away. Three tests changed and three were added, including an end-to-end one through the real flow. Full suite after merging Bhavarth's backend: **564 passed across 41 files** — which required applying migration `0007` locally first, since the new auth-backed route tests fail against a database without `accounts.issuer`.

**No longer blocked:** Deep's other Phase 3 UI slices — comparison, saved properties, the dossier-unlock OTP gate, and enquiry submission — now have routes to build against as of `7fd7789`. Each needs its own tasklist first, per `docs/tasklists/README.md`; none is started.
