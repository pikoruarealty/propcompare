# Tasklist — pre-login intake capture (cookie -> `buyer_intake_sessions` on login)

**Status:** not started — stub only, direction agreed
**Owner:** Bhavarth
**Branch:** not yet created
**Depends on:** `POST /api/v1/discovery/matches` (`2026-09-18-discovery-matches-endpoint.md`), auth (Better Auth, already in the stack)
**References:** `DECISIONS.md` 2026-09-18 ("Pre-login guided-intake answers... will be captured in a narrowly-scoped, short-lived cookie"), `DECISIONS.md` 2026-09-07 (why intake answers avoid the URL/`sessionStorage`/server today), `docs/app-flows/buyer.md`, `src/db/schema/catalog.ts` (`buyerIntakeSessions`)

## Scope

Let a visitor who runs guided intake before creating an account keep those answers (city, stated budget range, configuration) across signup/login, and persist one `buyer_intake_sessions` row per login for buyer-behavior insight — without reopening the leak vector the 2026-09-07 decision closed.

## Non-goals

- Not a general session/preferences mechanism — scoped to the one intake-to-login handoff.
- Not per-search logging. One row is written at the login moment, not on every intake edit or every `discovery/matches` call.
- Does not change `POST /api/v1/discovery/matches`, which stays stateless per the 2026-09-18 decision.

## Open questions to resolve before implementation (do not guess — ask)

- Exact login/signup route(s) this attaches to (Better Auth's handler is `src/app/api/auth/[...all]/route.ts` — confirm where a claim step can hook in without forking that route).
- What happens to an unclaimed cookie/draft that expires — nothing to clean up (cookie-only, no server draft row in the agreed design) unless the design changes.
- Whether the buyer ever sees this row again (e.g. "your last search") or it is insight-only and never read back.

## Implementation checklist (not started)

- [ ] Cookie: `httpOnly`, `Secure`, `SameSite=Lax`, narrow `Path` (login/signup routes only, not site-wide), ~30 minute expiry, holding intake's existing client-state shape (`statedRange`/`fromLakh`/`toLakh` etc. — reuse the naming from the 2026-09-07 decision, never a raw `*Inr` key, so `no-price.ts` guard semantics stay consistent if this ever crosses a buyer-facing response).
- [ ] Set the cookie from client-side intake state at the point intake hands off toward auth (not on every keystroke).
- [ ] On successful login/signup, read the cookie server-side, write one `buyer_intake_sessions` row with the now-known `userId`, clear the cookie.
- [ ] Confirm `findForbiddenKeys`/`no-price.ts` has no reason to run here (this is a write path, not a buyer-facing response) but that the cookie itself never round-trips into any logged buyer-facing surface.

## Handoff

- [ ] Full tasklist per `docs/tasklists/README.md` once scoped: discovery, implementation, tests, documentation, acceptance criteria.
- [ ] Update `PROGRESS.md` and `docs/roadmap.md` when started and when complete.
