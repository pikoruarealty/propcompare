# Tasklist — "Report a problem" placeholder

**Status:** done, verified 2026-09-22
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** nothing
**References:** `DECISIONS.md` 2026-09-20 (media-rights context: "a 'report a problem / request removal' link on every property, honoured promptly" — the reason this exists at all, ahead of a real contact channel), `DECISIONS.md` 2026-09-21 ("report a problem" held, pending the owner), `DECISIONS.md` 2026-09-22 (approved, placeholder only), `src/components/buyer/dossier-screen.tsx`

## Scope

Owner-approved scope, exact: "a dialog/page saying the contact email is coming; no table, no storage." A link on every property dossier (the placement `DECISIONS.md` 2026-09-20 already committed to for media-rights reasons) opens a dialog that says plainly there is no way to send a report yet. Nothing is submitted, recorded, or emailed by this dialog.

## Non-goals

- No `listing_reports` table or any other schema change — this is not a form, it has nothing to write.
- No real contact address. As first built (2026-09-22) the dialog invented none; on 2026-09-24 the owner directed a placeholder on a reserved example domain (`DECISIONS.md` 2026-09-24), held in one constant in `src/lib/buyer/report-contact.ts`.
- No admin-side anything — there is nothing for an admin to see, since nothing is stored.

## Implementation checklist

- [x] `src/components/buyer/report-problem-link.tsx` (new, `"use client"`): a plain text link/button, a Radix `Dialog` (matching the pattern already used for the floor-plan lightbox in `compare-screen.tsx`), with copy that says a way to report a problem is coming and nothing typed here goes anywhere yet.
- [x] Wired into `src/components/buyer/dossier-screen.tsx`, beside "Back to all properties" at the foot of every dossier — the one property-level placement the 2026-09-20 decision already committed to.
- [x] Tests: renders the link, opens the dialog, dialog states plainly that nothing is sent, closes.

## Documentation

- [x] `PROGRESS.md` — new entry.
- [x] `docs/roadmap.md` — Phase 3 status line, since this was one of the four items held there.

## Acceptance criteria

- Every dossier page has a way to say "report a problem" that is honest about not doing anything yet.
- `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` all pass.

## Verification commands

```
bun run typecheck
bun run lint
bun run format:check
bunx vitest run
```

## Completion record

**2026-09-22 — Done.** See `PROGRESS.md`.
