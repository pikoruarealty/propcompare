# Tasklist — Comparison detail gated on the server; a saved comparison can be recognised and unsaved

**Status:** done, verified 2026-09-24
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** nothing
**References:** `AGENTS.md` ("Comparison depth is gated behind sign-in"), `DECISIONS.md` 2026-09-22 (the gate itself), `docs/design/comparison.v1.md`, `docs/api/api-spec.v1.md` (`/api/v1/comparisons`), `docs/tasklists/2026-09-22-intake-first-landing-and-comparison-gate.md`, `docs/tasklists/2026-09-18-buyer-account-routes.md`

## Scope

Two owner-reported bugs.

1. **A shared `/compare` link shows detail to someone who has not signed in.** Found by fetching `/compare?p=amaris,the-kimana-towers` with no session: the page's own payload carries both properties' full rooms, amenities, specifications and RERA registration data. The 2026-09-22 gate only hid rows on screen (`authClient.useSession()` in the client component); the data was already shipped. Fix: the server reads the session; a signed-out request never receives the row values or floor-plan references, only the column identity, the differences-first summary, and each row's label (what the locked skeleton shows).
2. **A saved comparison offers "Save this comparison" again on return.** The button's saved state was local `useState`, forgotten on reload. Fix: a signed-in buyer's saved comparisons are read on load and matched by the same signature the server already uses to de-duplicate (properties and unit types, any order); a matching comparison shows as saved with an "Unsave" action, backed by a new `DELETE /api/v1/comparisons/{id}`.

## Non-goals

- No change to what is open vs locked (column identity, summary open; row groups locked) — that is the 2026-09-22 decision, not this task's to revisit.
- No schema change. `comparisons`/`comparison_items` already exist (`comparison_items` cascades on delete).
- No change to the phone-OTP sign-in flow itself.

## Implementation checklist

- [x] Reproduce bug 1 against the running server (signed-out payload contains rooms/amenities/registration data).
- [x] `src/lib/compare/lock.ts`: `lockComparison(model)` strips every cell, floor plan and per-row status; keeps group/row keys and labels, columns' identity, the summary.
- [x] `src/app/compare/page.tsx`: read the session server-side (`disableCookieCache`, like every other buyer read); signed out passes only the locked model.
- [x] `CompareScreen`: gate from the server-supplied mode, not `useSession`; in locked mode a unit-type pick or a removal re-requests the page instead of recomputing locally.
- [x] `deleteComparison` in `src/lib/buyer/comparisons.ts` (scoped to the caller's `userId`), `DELETE /api/v1/comparisons/[id]`, api-spec updated.
- [x] `SaveComparisonButton`: load the buyer's comparisons, match by signature, show saved/unsave.
- [x] Tests: `lockComparison` (no value survives); route integration test for `DELETE` (own, not-found, another buyer's); `CompareScreen` locked/unlocked; save button starts as saved and unsaves.
- [x] Re-fetch the signed-out `/compare` and confirm the payload no longer contains the row data.

## Documentation

- [x] `PROGRESS.md` entry; `docs/api/api-spec.v1.md` (`DELETE` route, `comparison_not_found` now used); `docs/design/comparison.v1.md` and `DECISIONS.md` note that the gate is enforced server-side.

## Acceptance criteria

- A signed-out request for `/compare` contains no row values, floor-plan ids or spec/amenity text for the compared properties in its HTML or RSC payload.
- Signing in through the embedded form on `/compare` reveals the detail (page re-requested).
- Reopening a saved comparison shows it as saved; "Unsave" removes it; it disappears from `/saved`.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` pass.

## Completion record

2026-09-24. Both bugs fixed and verified: a signed-out `/compare` payload no longer contains rooms, amenities, RERA ranges, cells or floor plans (checked by fetching the running server); a real signed-in session gets the full data; save/list/delete round trip confirmed against the live API. Typecheck, lint and the full suite (134 files, 1600 tests) pass. Not driven in a browser: the reactive transition after signing in through the embedded OTP form (dev OTP is logged only to the separate dev-server console). Recorded in `DECISIONS.md` 2026-09-24 and `PROGRESS.md`.
