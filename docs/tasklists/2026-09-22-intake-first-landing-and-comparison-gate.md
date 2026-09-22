# Tasklist — intake as the front door; comparison depth gated behind sign-in

**Status:** Phase 1 and Phase 2 done, verified 2026-09-22. Phase 3 not started (needs the owner's scope).
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion` (continues the current branch)
**Depends on:** nothing new — `BuyerLoginForm`/`authClient` (phone OTP, existing), `IntakeMatchResults`/`CompareToggle` (existing), `buildComparison` (existing)
**References:** `DECISIONS.md` 2026-09-22 ("Major flow pivot..."), `AGENTS.md` ("The product is comparison"), `docs/design/comparison.v1.md` (principle 11, updated), `docs/app-flows/buyer.md`, `src/components/buyer/site-header.tsx`, `src/components/buyer/landing-screen.tsx`, `src/components/buyer/intake-flow.tsx`, `src/components/buyer/intake-matches.tsx`, `src/components/buyer/compare-screen.tsx`, `src/lib/compare/model.ts`

## Scope

Implement the owner's direct flow decision (`DECISIONS.md` 2026-09-22): guided intake stops being a nav item and becomes the site's front door; its matched results (already showing `PropertyCard`s with a `CompareToggle` and a dossier link) are the primary thing a first-time visitor reaches; `/compare` keeps its column-identity block and differences-first summary open to everyone but locks its detailed row groups behind the buyer's phone-OTP sign-in.

Split into three phases so the two well-specified, mechanical pieces are not blocked on the one genuinely open-ended, creative piece.

## Non-goals (this tasklist)

- **Phase 3 (the landing page's richer content) is scoped but not designed here.** What "much richer" means — more product explanation, screenshots, a different structure entirely — is not decided (`DECISIONS.md` 2026-09-22, "not decided here"). Phase 3's own checklist starts empty until that is scoped, most likely with the owner's direct input on content and tone, the same way the hero tagline and the no-vibecoded-tells language were decided directly rather than guessed.
- Not touching `dossier_unlocks`, the enquiry flow, or the saved-properties flow — those keep their own sign-in gates exactly as they are.
- Not changing what "sign in" means anywhere — it is still the one existing phone-OTP flow (`BuyerLoginForm`).
- Not deciding whether a signed-out buyer's existing compare-tray selection survives across sign-in automatically (flagged open in `DECISIONS.md`; default behavior is whatever falls out of the existing client-side tray plus a plain session check, verified and recorded once built, not pre-decided here).

## Open questions — resolved during implementation

- **Locked-row visual treatment:** a real row label (its name is not the fact it protects) beside tonal `Block` skeleton bars where each value would be — reusing the exact skeleton pattern already established (`page-skeleton.tsx`'s `Block`, now exported), not a new visual language. Same grid shape as a real row, so signing in swaps content without reflow.
- **The sign-in prompt:** embedded directly (`BuyerLoginForm` inline inside `/compare`, not a link out to `/login`), shown once above the locked groups. Chosen over a redirect because the buyer is already mid-decision on this page; sending them away and back is a worse flow than finishing sign-in in place.
- Phase 3's content scope: still open, unchanged (see Non-goals).

## Phase 1 — nav restructuring and intake as the front door

- [x] `src/components/buyer/site-header.tsx`: removed the `/intake` entry from `BUYER_NAV` (kept `Browse properties`, `Compare`, `Saved`).
- [x] `src/components/buyer/landing-screen.tsx`: the hero's primary call to action is now "Tell us what you're looking for" → `/intake` (via `INTAKE_PATH`, not `BUYER_NAV`); the secondary button is "Browse everything instead" → `/properties`. The "No sign-in to compare." line is gone, replaced with a line describing what intake actually does now.
- [x] `docs/app-flows/buyer.md`: rewrote the primary-journey diagram and its numbered steps, and the permissions section, to describe intake as the front door and the comparison gate.
- [x] `page-frame.test.tsx` needed no change (already iterates `BUYER_NAV` generically). `landing-screen.test.tsx` rewritten: the `[BROWSE_NAV, INTAKE_NAV]` destructure is gone (intake isn't in `BUYER_NAV` any more); new assertions cover the intake CTA's text/href, the browse CTA, and that only the browse href is still guaranteed to match the header nav.
- [x] Real-browser check (`scripts/verify-intake-first-and-compare-gate.mjs`, headless Chrome via `playwright-core`, signed out): nav carries no intake/guided-start link and still carries Browse/Compare/Saved; the hero's primary CTA exists and points to `/intake`. Screenshot confirms the visual result (`.local/verify/landing.png`, not committed).

## Phase 2 — comparison depth gated behind phone sign-in

- [x] `src/components/buyer/compare-screen.tsx`: `CompareScreen` now reads `authClient.useSession()` itself (`signedIn`), the same read `SaveComparisonButton` already made. `ColumnHeader` and `compare-summary` stay unconditional. Each `<section data-slot="compare-group">` gains `data-locked={!signedIn}`; when locked, its body renders `LockedRow`s (real label, skeleton `Block`s for values, one per column, same grid shape as `Row`) instead of the real `Row`s/`FloorPlanRow`.
- [x] `ComparisonSignInPrompt`: one instance, rendered once between the column-header row and the group list (never per group), embedding `BuyerLoginForm` directly with `returnTo` set to the current `/compare` address.
- [x] Focus chips and "Expand/Collapse all sections" were left visible and functional regardless of lock state (decision made while implementing, recorded here rather than left implicit): they operate on group open/closed state and ordering, which are harmless to apply to a locked group's skeleton — hiding or disabling them would be extra logic for no real protection, since the group headers and their titles ("Amenities", "Specifications", etc.) are not sensitive.
- [x] `docs/api/api-spec.v1.md`: confirmed no route change — this is a client-side render gate on data the existing page read already returns; the dossier data itself is unchanged and untrimmed server-side. Recorded here rather than silently assumed, per this tasklist's own item.
- [x] Tests: `compare-screen.test.tsx` (new) — signed-out shows the identity block and summary, locks every group (`data-locked="true"`), renders zero real `compare-row`s and only `compare-row-locked` ones, still shows each row's real label, and shows exactly one `compare-sign-in` prompt with the phone field; signed-in shows the inverse (`data-locked="false"`, real rows, no prompt). `compare.test.tsx` and `buyer-actions.test.tsx` (existing files that render `CompareScreen` for unrelated reasons — row-content and focus-chip/save-button behavior) updated to mock a signed-in session where the tests are about the underlying data, since that is what they were already testing.
- [x] Real-browser check, signed out (same script as Phase 1): the summary heading and both column headers are visible; every group is locked; zero real rows render; locked skeleton rows render instead; exactly one sign-in prompt renders, offering the phone field; no console errors. Screenshot confirms the visual result (`.local/verify/compare-signed-out.png`, not committed) — labels visible, values skeletoned, real RERA registration numbers still visible in the open column-header badge (an existing, deliberate trust-signal exception, not a leak through the lock: `VerifiedBadge` has always shown the registration number as its evidence, independent of the row-group lock this phase adds).
- [ ] **Not independently browser-verified: the reactive "signing in reveals the locked groups without a full reload" transition.** `authClient.useSession()` is the same reactive hook already relied on elsewhere (`HeaderAccount`, `SaveComparisonButton`) to update a component after sign-in without a manual refetch, and `compare-screen.test.tsx` proves both the signed-out and signed-in renders are correct outputs of that same hook — but the live transition itself was not driven end-to-end in a real browser, because this environment has no way to read the dev-only OTP code Better Auth logs to the running `bun run dev` process's own console (not this session's). Worth a real check next time a person is at the keyboard.

## Phase 3 — the landing page's richer content

- [ ] Not started. Needs the owner's input on scope and content before a checklist is written here (see Non-goals). Do not guess a design.

## Documentation

- [ ] `PROGRESS.md` — new entry when Phase 1 and Phase 2 are done (can be one entry or two, whichever matches how the work actually lands).
- [ ] `docs/roadmap.md` — note the flow change if it affects the Phase 3 buyer-flow status line.
- [ ] This tasklist's own checkboxes, kept current.

## Acceptance criteria

- A first-time visitor's primary path from the landing page reaches guided intake without needing the nav.
- Intake's matched results let a buyer open a dossier or add to compare directly (already true; verify it still holds after the nav/CTA change).
- `/compare` shows column identity and the differences-first summary to a signed-out buyer; the detailed row groups are locked until they sign in with their phone number; nothing regresses for a signed-in buyer.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` all pass.

## Verification commands

```
bun run typecheck
bun run lint
bun run format:check
bunx vitest run
```

## Completion record

**2026-09-22 — Phase 1 and Phase 2 done.** Nav no longer lists intake; the landing hero leads with it; `/compare` shows column identity and the differences-first summary to everyone and locks every row group behind a skeleton and one embedded phone-OTP sign-in prompt until a session exists. `bun run typecheck`, `bun run lint`, `bun run format:check` and `bunx vitest run` (132 files, 1585 tests) all pass. Real-browser checks (headless Chrome, signed out) pass for both phases; see the open item above on the one thing not independently re-verified live (the reactive unlock transition itself, versus its two static end-states, which are verified). Phase 3 (the landing page's richer content) remains unscoped, per this tasklist's own non-goals — needs the owner's direction before a checklist can be written.
