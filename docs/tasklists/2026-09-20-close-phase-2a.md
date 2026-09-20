# Tasklist — close Phase 2A: quarterly RERA refresh, revision history, reconciliation

**Status:** built and verified 2026-09-20; the phase closes when the owner has reviewed the flagged changes, done the spot-check and agreed the merge (below)
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `2026-09-18-phase-2a-completion.md`
**References:** `2026-09-20-gujrera-regulator-sync.md`, `2026-09-20-edit-published-properties.md`, `docs/schema/schema.v7.md` (`rera_fetch_jobs`), `docs/app-flows/admin.md` (RERA cross-check journey), `docs/production-readiness.md`, `DECISIONS.md` 2026-09-20 (scheduled RERA refresh)

## What was left in Phase 2A

1. The quarterly GujRERA job, and RERA-sourced submissions created automatically.
2. Revision history on the property view.
3. The stale parent tasklist.
4. The owner's field-by-field spot-check of Kimana and Amaris.
5. The owner's review of the removal and listing changes (they change publish logic and can hide a property from buyers).
6. Merging the branch to `main`, and pushing the phase baseline.

## Non-goals

- No schema change: `rera_fetch_jobs` already holds everything the worker needs (schema v7), and no lease column was added (see design).
- The RERA carpet-area work stays proposed, not started, until the owner says yes (`2026-09-20-zoom-and-carpet-area.md`).
- No buyer-facing "last checked", no developer-facing entry, no second regulator, no failure alerting.
- No live run against GujRERA from the scheduler: it is off until the owner turns it on.

## Design (as built)

- **Due rule** (`isDue`, pure and tested without a clock or database): a property with a RERA number that a registered regulator issues is due when its last good record does not show a filing for the latest calendar quarter whose 1–7 filing window has closed (a day of grace after the 7th), and its last attempt is old enough. Never checked: due. After an unfiled result: weekly. After failures: one day, doubling per consecutive failure, capped at a week. A check still `running` after 15 minutes is failed as interrupted.
- **Claiming without a lease column:** the worker takes a row lock on the property (`FOR UPDATE SKIP LOCKED`) and inserts the `running` job in the same transaction, so two workers never check the same property (proved with four simultaneous claims).
- **On a good record:** the normalized record is stored on the job (never the raw response). If nothing differs, that is all. If something differs and no edit is open and the same proposal was not already rejected, one `rera_scrape` edit draft is opened for the property with RERA's values as `needs_review`. The queue already labels it "From RERA".
- **Failures:** recorded with a plain reason, retried with back-off, never read as "no change".
- **Off by default:** `RERA_WORKER_ENABLED=true` starts it inside the app server, or `bun run rera:worker` runs it alone. Poll and spacing are environment settings.
- **Revision history:** the versions list on a submission screen reads `property_revisions`: when each edit went live and what it changed (was → now for single values; "changed" for sets).

## Checklist

### Implementation

- [x] `src/lib/rera/refresh.ts`: quarter and due rules, claim, run, stale recovery, worker loop.
- [x] `src/lib/rera/worker-runtime.ts`, `src/db/rera-worker.ts`, `bun run rera:worker`, `src/instrumentation.ts` (opt-in), `.env.example`.
- [x] `createEditSubmission` accepts a source and no author; `editSubmissionField` accepts `needs_review`.
- [x] `src/lib/submissions/revision-history.ts` and the versions panel.
- [x] Parent tasklist reconciled against what shipped.

### Tests

- [x] Unit: quarter dates around every window edge, filing detection, due, back-off and stale rules (`refresh.test.ts`).
- [x] Integration on real Postgres (`refresh.integration.test.ts`): a difference opens a `needs_review` draft and leaves the live row identical; an open edit blocks a second draft; a rejected proposal is not raised again but a changed one is; a failure is recorded and backed off; a settled quarter is idle; four simultaneous claims yield one; a number no regulator issues is skipped; a dead `running` check is failed.
- [x] Revision history: unit (`revision-history.test.ts`), integration on real publishes (`queue-versions.integration.test.ts`) and the component (`edit-mode.test.tsx`).
- [ ] Not done: a run against the live GujRERA site through the scheduler, and a browser look at a scheduled draft (the workbench renders any draft the same way; the queue label existed already).

### Documentation

- [x] `DECISIONS.md`, `PROGRESS.md`, `ARCHITECTURE.md`, `docs/app-flows/admin.md`, `docs/production-readiness.md`, the two sibling tasklists.

### Verification

- [x] `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (results in `PROGRESS.md`).

## Still open before the phase is closed (owner)

- [ ] Review of the flagged publish-logic changes: removals, listing status (unlist, soft delete, restore), the publisher applying `developer.name`, and now the scheduler creating drafts.
- [ ] Field-by-field spot-check of Kimana and Amaris against the brochures.
- [ ] A brochure re-extraction test of the new unit-aware prompt (paid; the owner gives the go-ahead).
- [ ] Yes or no on the RERA per-flat carpet-area work.
- [ ] Merge `task/phase-2a-completion` into `main` at the phase boundary, then push after the above.

## Completion record

_(fill in when the owner closes the phase)_
