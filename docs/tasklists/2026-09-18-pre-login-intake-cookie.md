# Tasklist — pre-login intake capture (cookie -> `buyer_intake_sessions` on login)

**Status:** done, verified 2026-09-22
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** `POST /api/v1/discovery/matches` (`2026-09-18-discovery-matches-endpoint.md`), auth (Better Auth, already in the stack)
**References:** `DECISIONS.md` 2026-09-18 ("Pre-login guided-intake answers... will be captured in a narrowly-scoped, short-lived cookie"), `DECISIONS.md` 2026-09-07 (why intake answers avoid the URL/`sessionStorage`/server today), `docs/app-flows/buyer.md`, `src/db/schema/catalog.ts` (`buyerIntakeSessions`)

## Scope

Let a visitor who runs guided intake before creating an account keep those answers (city, stated budget range, configuration) across signup/login, and persist one `buyer_intake_sessions` row per login for buyer-behavior insight — without reopening the leak vector the 2026-09-07 decision closed.

## Non-goals

- Not a general session/preferences mechanism — scoped to the one intake-to-login handoff.
- Not per-search logging. One row is written at the login moment, not on every intake edit or every `discovery/matches` call.
- Does not change `POST /api/v1/discovery/matches`, which stays stateless per the 2026-09-18 decision.

## Open questions — resolved 2026-09-22

- **Login/signup route hook:** resolved without forking Better Auth's own route at all. The cookie's `Path` scopes it to one purpose-built site route, `POST /api/v1/buyer/intake-handoff/claim`, called by `BuyerLoginForm`'s client code right before its existing `router.replace(returnTo)` — after `phoneNumber.verify` succeeds (and again after the first-time name step, the other point that flow already redirects from). No Better Auth internals touched.
- **Unclaimed cookie/draft:** as originally designed — nothing to clean up. `Max-Age` (~30 minutes) is the only expiry; no server-side draft row exists at any point before claim.
- **Whether the buyer sees the row again:** asked directly (`AskUserQuestion`, since the tasklist itself said "do not guess"). Owner's answer: applied as editable filters, not shown as an inert "last search" and not locked in. Built as such — see the completion record.

## Implementation checklist — done

- [x] Cookie (`src/lib/buyer/intake-handoff.ts`): `httpOnly`, `Secure` in production, `SameSite=Lax`, `Path` scoped to the one claim route (narrower than "login/signup routes", and does not require forking Better Auth's route to achieve), `Max-Age` 30 minutes, holding `IntakeAnswers` exactly as `intake.ts` already shapes it (`priorities`/`bhk`/`city`/`statedRange.fromLakh`/`statedRange.toLakh` — no `Inr`-suffixed key, so `findForbiddenKeys` stays clean, tested).
- [x] Set only on explicit buyer action: `IntakeFlow`'s summary step shows "Sign in to keep this search" when unauthenticated and something was stated; choosing it POSTs the current answers to `POST /api/v1/buyer/intake-handoff` (sets the cookie, writes nothing to any table) and then navigates to `/login?next=/intake`. Never set on every keystroke or silently in the background — the existing summary copy already promises nothing is sent without asking, and this preserves that promise.
- [x] On successful sign-in, `POST /api/v1/buyer/intake-handoff/claim` (session required) reads the cookie, writes one `buyer_intake_sessions` row with the now-known `userId`, clears the cookie unconditionally (even when there was nothing to claim, or the cookie failed validation — a tampered or stale cookie must not break sign-in), and returns the claimed answers.
- [x] `findForbiddenKeys`/`no-price.ts`: confirmed clean on the claim response (test asserts it); the cookie payload itself never reaches a buyer-facing response elsewhere, and is never logged (it is read server-side only, inside the claim route).
- [x] Reapplication as editable filters (the resolved open question): the claimed answers are handed back in the claim response, relayed in-memory (never storage) from `BuyerLoginForm` to `IntakeFlow` across the one client-side navigation, and used to hydrate `IntakeFlow`'s ordinary `useState` — jumping straight to the summary with a "Welcome back" note and, if a range was stated, auto-running the match — while every control stays exactly as editable as if the buyer had answered it just now. The note clears the moment anything is changed.

## Schema note

`buyer_intake_sessions.city` was `not null` with nothing ever having written to the table — a real gap against how intake's optional city question actually works, found while building the write path. Fixed as schema v10 (`docs/schema/schema.v10.md`, migration `0014_intake_sessions_city_nullable.sql`): the column is now nullable, nothing else changed. Flagged there: this consumed the "v10" version number ahead of the separately owner-approved `unit_variant_amenities` schema change, which becomes v11.

## Handoff

- [x] Documentation: `PROGRESS.md` (2026-09-22, late night, 1), `DECISIONS.md` not separately entered (no product-level ambiguity remained once the owner answered directly; the schema note above covers the one structural change).
- [x] Tests: `src/lib/buyer/http.test.ts` (`parseIntakeHandoffBody`, 15 cases), `src/app/api/v1/buyer/intake-handoff/route.integration.test.ts` (7 cases against the real database), `src/components/buyer/intake-flow.test.tsx` (the sign-in CTA and claim-hydration behavior), `src/components/auth/buyer-login-form.test.tsx` (the claim call itself), `src/lib/properties/pending-intake-claim.test.ts`.
- [x] Verification: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (131 files, 1581 tests) all pass.

## Completion record

**2026-09-22 — Done.** See `PROGRESS.md` (2026-09-22, late night, 1) for the full account.
