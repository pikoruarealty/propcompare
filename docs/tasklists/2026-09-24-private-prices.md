# Tasklist: private prices (RERA project range, admin unit-type prices, budget matching)

**Status:** done, verified 2026-09-24 (not looked at in a browser)
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `DECISIONS.md` 2026-08-31 (prices never shown, `private` schema), 2026-09-01 (±20% matching), 2026-09-20 ("Prices in regulator responses never enter our database", reversed in part below), 2026-09-24 (private prices); `AGENTS.md` (one write path; exact prices never leave `private`); `docs/schema/schema.v16.md`; `docs/schema/schema.v1.md` §private; `docs/api/api-spec.v1.md` (`POST /api/v1/discovery/matches`); `src/lib/matching/budget-range.ts`.

## Why

Budget matching (`private.unit_price_history`, the ±20% matcher) has nothing to match on real properties: no code path writes a price, and no admin control takes one. GujRERA does not give per-unit prices (its per-flat list masks them as `******`); it does give a project's minimum and maximum cost in its search result. So: RERA supplies a project-wide range automatically, and an admin supplies a price per unit type, which wins.

## Owner decisions (2026-09-24, recorded in `DECISIONS.md`)

1. **Source:** RERA's project min/max as the fallback, admin-entered price per unit type overriding it.
2. **Granularity:** one price per unit type (fits `private.unit_price_history`; no second price column).
3. **Write path:** typed in the review panel, staged in the `private` schema (never in the public submission fields), applied to `unit_price_history` right after the publish transaction commits, by a pricing module that is the second code path allowed to use the service role. Not atomic with the publish; retryable.
4. **Partial prices:** once a property has any admin price, RERA's range no longer applies to it; an unpriced unit type does not match and is listed as "not priced" in the panel.
5. **Prices are not shown to buyers.** The panel says so. A price bracket for buyers is a possible later decision and is not built here.

## Scope

### A. Storage and RERA range (schema v16, migration `0019`)

- [x] `private.rera_price_ranges` (registration number, min/max INR, regulator, fetched at), RLS forced, service role only.
- [x] `private.staged_unit_prices` (submission, unit type name, price INR, entered by, applied at), RLS forced, service role only, cascades with the submission.
- [x] Column-level `SELECT (id, rera_registration_number)` on `public.properties` for the service role, so the matcher can tie a range to a property.
- [x] `RegulatorAdapter.lookupPriceRange` (GujRERA: the search hit's `mincost`/`maxcost`); the `RegulatorRecord` and `rera_fetch_jobs.fetched_payload` stay money-free.
- [x] After a successful RERA check (draft fetch and scheduled refresh) the range is saved best-effort through the pricing module.

### B. Admin entry and apply

- [x] `src/lib/pricing/`: service connection (lazy), staged-price read/set/clear, apply-after-publish (idempotent, closes the current price, inserts `admin_manual`), RERA range read/write.
- [x] Routes: `GET/PUT/DELETE /api/v1/admin/submissions/{id}/prices`, `POST .../prices/apply` (retry).
- [x] Review panel Prices tab: one input per unit type, the RERA range as a reference, "Not shown to buyers" note, "not priced" list.
- [x] `publishSubmission` applies staged prices after it commits; a failure never unpublishes.

### C. Matching

- [x] Matcher: unit-level match as today; RERA range fallback only for a property with no current price on any variant; result stays identifiers only.

### D. Docs and verification

- [x] `DECISIONS.md`, `docs/schema/schema.v16.md`, `AGENTS.md` (two service-role paths), `docs/api/api-spec.v1.md`, `PROGRESS.md`.
- [x] Tests: schema and grants (real database), adapter (poisoned fixture: only the two range numbers leave), staging and apply (idempotent, mismatched names, removal), matcher (override, fallback, partial), routes (auth), panel.
- [x] `bun run typecheck`, `lint`, `format:check`, `bunx vitest run`.

## Non-goals

- No price or bracket shown to a buyer, in the API, JSON-LD or the comparison.
- No per-flat or booked/unbooked figures from RERA are kept; the form-three totals are not stored.
- No developer-portal price entry.
- No price history screen.
