# Tasklist — buyer account routes: saved-properties, comparisons, enquiries, dossier-unlocks

**Status:** backend done — implemented and verified 2026-09-18. UI wiring is Deep's separate scope.
**Owner:** Bhavarth
**Branch:** task/phase-3-budget-range-matching
**Depends on:** Better Auth session plumbing (`src/lib/auth.ts`, implemented but never yet read from a Route Handler in this codebase), the published catalog read layer (`@/lib/properties/queries.ts`)
**References:** `docs/api/api-spec.v1.md` (rows 30–33), `docs/app-flows/buyer.md` (steps 5, 7, 8 and the permissions section: "Authenticated buyers can own intake sessions, saves, comparisons, dossier unlocks, reviews, and enquiries"), `src/db/schema/catalog.ts` (`savedProperties`, `comparisons`, `comparisonItems`, `enquiries`, `dossierUnlocks` — all already defined, schema v5), `DECISIONS.md` 2026-09-18 (backend ownership)

## Scope

One tasklist covers all four routes because they share the same shape: every one requires an authenticated buyer session, writes/reads a small owned table (none of them are live catalog tables, so the one-write-path rule in `AGENTS.md` does not apply — that rule binds `properties`/`unit_variants`/etc. only), and none has existed as a concept in this codebase before (first real use of session reading in a Route Handler).

- `GET, POST, DELETE /api/v1/saved-properties`
- `GET, POST /api/v1/comparisons`
- `POST /api/v1/enquiries`
- `POST /api/v1/dossier-unlocks`

## Non-goals

- No UI. Deep's scope per `DECISIONS.md` 2026-09-18.
- No `PATCH`/incremental item mutation on an existing comparison — the api-spec row says "Creates/reads", not "updates"; a comparison is created once with its full ordered item list.
- No admin-side enquiry management (status transitions, reviewer notes) — out of scope for the buyer API.
- Does not reimplement OTP verification. Better Auth's `phoneNumber` plugin (already wired in `src/lib/auth.ts`, served through `/api/auth/[...all]`) owns sending/verifying the code and setting `users.phone_number_verified`; `dossier-unlocks` only gates on that flag and records the unlock event.

## Design decisions made while scoping (recorded here since none had a prior tasklist)

- **All four require an authenticated session.** `buyer.md`'s permissions section says this outright ("Authenticated buyers can own intake sessions, saves, comparisons, dossier unlocks, reviews, and enquiries"). `comparisons.user_id` being nullable in the schema is for `onDelete: "set null"` (a comparison outlives an account deletion), not anonymous creation.
- **Session reads use `auth.api.getSession({ headers, query: { disableCookieCache: true } })`.** Better Auth's own doc comment on `isStateful`/`getSessionFromCtx` says sensitive operations should bypass the cookie cache so a revoked-but-cached session cannot authorize a write. All four routes write account-owned data (one gated on phone verification), so all four count as sensitive here.
- **Dossier-unlock gate:** `POST /api/v1/dossier-unlocks` requires the session's `user.phoneNumberVerified === true`. There is no separate "verify OTP for this unlock" step invented here — the client calls Better Auth's existing phone-verify endpoint first (already live), then this route, which checks the flag and writes `otp_verified_at = now()`. `buyer.md`'s "the buyer completes phone OTP. This creates a verified unlock tied to the buyer and property" maps directly onto that two-call sequence.
- **`DELETE /api/v1/saved-properties` takes `{ propertyId }` in a JSON body**, not a path segment or query param — the api-spec table names one flat route for all three methods, and a JSON body keeps it consistent with how `POST` on the same route already looks.
- **Duplicate/ownership behavior:** saving an already-saved property is idempotent (unique constraint on `user_id, property_id` — return the existing row rather than erroring); unsaving a property that was never saved, or deleting under a different user's comparison/enquiry, is a `404`, not a silent no-op or a `403` that would confirm another user's data exists.

## Implementation checklist

- [x] `src/lib/buyer/session.ts`: `requireBuyerSession(request)` reading the Better Auth session with `disableCookieCache: true`, returning the session/user or `null`.
- [x] `saved-properties`: `GET` (list, paginated the same way as `/api/v1/properties`), `POST` (`{ propertyId }`, 404 if the property doesn't exist), `DELETE` (`{ propertyId }`, 404 if not saved). (`src/lib/buyer/saved-properties.ts`, `src/app/api/v1/saved-properties/route.ts`.)
- [x] `comparisons`: `POST` (`{ items: [{ propertyId, unitVariantId? }, ...] }`, assigns `displayOrder` from array position, 404 on a missing/mismatched property or unit variant), `GET` (the caller's comparisons with ordered items). (`src/lib/buyer/comparisons.ts`, `src/app/api/v1/comparisons/route.ts`.)
- [x] `enquiries`: `POST` (`{ propertyId, unitVariantId?, message? }`, 404 on a missing/mismatched property or unit variant; always `status: "new"`). (`src/lib/buyer/enquiries.ts`, `src/app/api/v1/enquiries/route.ts`.)
- [x] `dossier-unlocks`: `POST` (`{ propertyId }`), 403 if unverified, 404 if the property doesn't exist, idempotent on the existing unique `(user_id, property_id)`. (`src/lib/buyer/dossier-unlocks.ts`, `src/app/api/v1/dossier-unlocks/route.ts`.)
- [x] None of the four responses carries a price/bound/bucket value or another buyer's data — verified via `findForbiddenKeys` in every integration test, and every query scoped by the session's own `userId`.

## Tests

- [x] `src/lib/buyer/http.test.ts` (28 tests, no database) covers body/query validation for all four routes.
- [x] `src/lib/buyer/test-support.ts` + `test-support.smoke.integration.test.ts`: a shared helper signs a real test buyer up through Better Auth's own `signUpEmail` and extracts a genuinely signed session cookie, so route tests exercise `requireBuyerSession` exactly as a real request would rather than faking a session row.
- [x] Integration tests per route (`route.integration.test.ts` beside each route): authenticated happy path, 401 with no session, ownership scoping (a second buyer never sees/acts on the first's rows), 404 on a nonexistent property/unit-variant reference, and the specific idempotency/duplicate rules above.
- [x] `dossier-unlocks`: verified vs. unverified phone (403), repeat-unlock idempotency.
- [x] Full suite stays green (507/507); no forbidden keys in any response.

## Documentation

- [x] `docs/api/api-spec.v1.md`: all four rows flipped to "Implemented (Phase 3, 2026-09-18)", full `###` sections added for each route, error-codes table extended (`unauthenticated`, `phone_not_verified`, `unit_variant_not_found`, `saved_property_not_found`, `comparison_not_found` reserved-but-unused), caching table extended (`no-store` for all four).

## Unplanned work surfaced and fixed along the way

Building the first Route Handler that reads a session surfaced two pre-existing, unrelated bugs — both fixed and recorded in `DECISIONS.md` (2026-09-18):

- `accounts` was missing a column (`issuer`) that the installed Better Auth version requires; every session read was failing outright. Added via migration `0007`.
- `drizzle/meta/0004_snapshot.json` had a broken `prevId`, blocking `db:generate` entirely (a Phase 2B merge leftover). Fixed with a one-line pointer correction.

## Handoff

- [x] Ran format, lint, typecheck, full test suite (507/507) — all pass.
- [x] Updated `PROGRESS.md` and this tasklist's completion record. `docs/roadmap.md`'s Phase 3 acceptance line stays open until Deep's UI wiring lands — that's tracked separately, not here.

## Completion record

**2026-09-18 — Backend done.** All four routes implemented, tested, and documented. Two pre-existing bugs (Better Auth schema drift, a broken snapshot chain) found and fixed as a side effect of being the first code in this repo to read a session. Follow-up: Deep's UI wiring against these contracts, tracked in his own (not-yet-created) tasklist per `DECISIONS.md` 2026-09-18.
