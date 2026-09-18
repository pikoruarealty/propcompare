# Tasklist — `POST /api/v1/discovery/matches`

**Status:** done — implemented and verified 2026-09-18
**Owner:** Bhavarth
**Branch:** task/phase-3-budget-range-matching
**Depends on:** `src/lib/matching/budget-range.ts` (done, see `2026-09-01-phase-3-budget-range-matching.md`)
**References:** `docs/api/api-spec.v1.md` (row 29, currently says "Planned (Phase 3)" and the stale pre-decision wording "matched by bucket" — this task corrects that), `docs/app-flows/buyer.md` (step 2–3), `DECISIONS.md` 2026-09-01 (±20% range), `DECISIONS.md` 2026-09-18 (this endpoint stays stateless — no `buyer_intake_sessions` write)

## Scope

The HTTP route that wires the already-built private budget-range matcher up to a buyer-facing response: published property summaries whose current unit price falls in the buyer's inclusive `[min × 0.80, max × 1.20]` range, optionally narrowed by `city` and `bhk` — the two filters guided intake already collects. No price, bound, or bucket value ever appears in the response.

## Non-goals (explicitly out of scope for this task)

- No `buyer_intake_sessions` write. Per the 2026-09-18 `DECISIONS.md` entry, this endpoint is stateless; persistence-on-login is separate, deferred work.
- No UI wiring. `/intake` still hands off to `/properties` as the 2026-09-07 decision left it; pointing it at this endpoint instead is a follow-up.
- No `propertyType`, `possessionStatus`, or `amenity` filters on this route — intake does not collect them, and `GET /api/v1/properties` already exists for the general browse case. Add them here only if intake's contract grows to ask for them.
- No pre-login cookie flow (separate deferred tasklist per the 2026-09-18 decision).

## Implementation checklist

- [x] Extend `ApiErrorCode` with a body-validation code and reuse the existing error envelope/response helpers in `src/lib/properties/http.ts` rather than inventing a second envelope shape. (`invalid_request_body` added to `src/lib/properties/http.ts`.)
- [x] Validate the POST body (`minInr`, `maxInr` required positive finite numbers with `minInr <= maxInr`; optional non-empty `city`/`bhk`; optional `page`/`pageSize` reusing the listing route's bounds) without duplicating `matchPropertiesByBudgetRange`'s own range validation — delegate to it and translate `InvalidBudgetRangeError` into the `422` envelope. (`src/lib/matching/http.ts`; the route also catches `InvalidBudgetRangeError` defensively.)
- [x] Add a matching query function that: calls the service-role matcher, short-circuits to an empty paginated result when there are no matches, otherwise loads published property summaries for the matched property ids via the app-role connection, applying `city`/`bhk` and pagination the same way `listPublishedProperties` does. (`src/lib/matching/discovery.ts`.)
- [x] Do not touch `ListPropertiesParams`/`listPublishedProperties`'s public contract — factor out only the generic per-property-id loaders it already has, rather than adding a filter field to that type. (Exported `bhkFilter`, `loadBhkTypesByProperty`, `loadPrimaryMediaByProperty` from `queries.ts`; `ListPropertiesParams` untouched.)
- [x] Wire the route handler (`src/app/api/v1/discovery/matches/route.ts`): parse and validate the body, call the matching function with both the app (`@/db`) and service (`@/db/service`) connections, return the same `{ data, pagination }` envelope shape as `GET /api/v1/properties`.
- [x] Route stays uncached (`Cache-Control: no-store` on the `200` response; errors already use the shared `ERROR_CACHE_CONTROL`).
- [x] Assert the response carries no forbidden (price/bound/bucket) keys — verified in both the query-layer and route-level integration tests via `findForbiddenKeys`.

## Tests

- [x] Unit tests for body validation (`src/lib/matching/http.test.ts` — missing/invalid fields, `minInr > maxInr`, unknown body keys, non-object/array bodies, page/pageSize bounds).
- [x] Integration test: fixture properties published through `publishSubmission`, prices written via the service connection, request matches only the units inside the inclusive range, and city/bhk narrowing behaves correctly (`src/lib/matching/discovery.integration.test.ts`).
- [x] Integration test: no matching inventory returns an empty `data` array with correct pagination metadata, not an error.
- [x] Integration test / structural assertion: response contains no forbidden keys (`findForbiddenKeys`), including through the real route handler and a real `JSON.stringify` round trip (`src/app/api/v1/discovery/matches/route.integration.test.ts`).

## Documentation

- [x] Updated `docs/api/api-spec.v1.md`: row 29 now says "Implemented (Phase 3, 2026-09-18)" with corrected stateless/±20%-range wording, a full `### POST /api/v1/discovery/matches` section added, the error-codes table extended with `invalid_request_body`, and the caching table extended with the route's `no-store` policy. Also corrected the `POST /api/v1/intake-sessions` row, which is not being built this phase (see the pre-login-cookie tasklist instead).

## Handoff

- [x] Ran format, lint, typecheck, and the full test suite (455/455, including the private-role integration tests) — all pass.
- [x] Updated `PROGRESS.md` and this tasklist's status/completion record.

## Completion record

**2026-09-18 — Done.** Implemented `src/lib/matching/discovery.ts`, `src/lib/matching/http.ts`, and `src/app/api/v1/discovery/matches/route.ts`, plus 29 new tests across three files. Full suite: 455/455 passing; format, lint, typecheck all clean. Follow-ups tracked separately: UI wiring of `/intake` to this route, and the pre-login intake cookie flow (`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`).

**2026-09-18 — Extension: unbounded upper end.** Requested from Deep's side while building the intake UI. `minInr`/`maxInr` becomes a discriminated union with `{ minInr, maxUnbounded: true }`; the private matcher resolves the ceiling against the catalog's current maximum current price in a single in-database subquery, never as a JS value — see the dedicated `DECISIONS.md` entry for the full shape and why. 15 new tests across `budget-range.test.ts`, `budget-range.integration.test.ts`, `discovery.integration.test.ts`, `http.test.ts`, and `route.integration.test.ts`. `docs/api/api-spec.v1.md`'s request-body section updated. Full suite: 522/522 passing.
