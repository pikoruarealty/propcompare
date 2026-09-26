# Tasklist: rate limit `POST /api/v1/events`

**Status:** done, verified 2026-09-26
**Owner:** Bhavarth
**Branch:** `task/analytics-anonymous-events`
**References:** `docs/production-readiness.md` ("Rate limit `POST /api/v1/events`"), `DECISIONS.md` 2026-09-25 (the endpoint is unauthenticated by design; noise is a known limit), `docs/product/privacy-policy-inputs.md` sections 2 and 3 (no IP stored).

## Scope

A per-caller limit inside the route, so one caller cannot flood the analytics counts. It holds the caller's address only in memory, for at most one window, and never writes it to the database or a log. It is a floor, not the whole answer: the production host's proxy should still limit this route (`production-readiness.md`), because the limiter here is per server instance and can only key on the forwarding header a trusted proxy sets.

## Non-goals

- No change to what an event stores; no IP in any table or log.
- No limit on other routes (auth limits are a separate production-readiness item).
- No error to the caller: the route stays `204` whatever happens, and a limited event is simply not recorded.
- No shared store (Redis or a table); that would put addresses in storage.

## Checklist

- [x] `src/lib/analytics/rate-limit.ts`: a fixed-window counter per key, bounded in memory, pure and clock-injectable.
- [x] Route: key from `x-forwarded-for` (first entry) or `x-real-ip`; with neither there is nothing to key on and nothing is limited (local development, tests).
- [x] Tests: the limiter (window, reset, separate keys, memory bound, no key) and the route (over-limit event not recorded, another caller unaffected, still 204).
- [x] `docs/product/privacy-policy-inputs.md`: the address is used in memory only for this.
- [x] `docs/production-readiness.md`, `PROGRESS.md`.

## Acceptance criteria

- The 121st request in a minute from one address is answered `204` and not recorded; another address, and the same address a minute later, record normally.
- `bun run typecheck`, lint, format and the analytics suites pass.

## Completion record

2026-09-26. Built as scoped; 120 events per caller per minute. Verified: `bun run typecheck`, lint, format, and `rate-limit.test.ts` (7), the analytics integration file (11, including the over-limit case) and the isolation test. Also fixed: the existing "records nothing for a crawler..." test left two events per run behind (their visitor cookies were never registered for cleanup); 18 such rows were removed from the local database and it holds only the 9 real events. Limits: per server instance, and keyed on a forwarding header, so the production proxy must set it and should limit the route itself (`docs/production-readiness.md`).
