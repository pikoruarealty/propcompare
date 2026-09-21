# Tasklist: page-router stall, page thumbnails, and stray ledger rows

**Status:** done 2026-09-21 (found by the owner's first paid categorization; written with the fix).
**Owner:** Bhavarth
**References:** `AGENTS.md`, `src/lib/ocr/page-router.ts`, `docs/tasklists/2026-09-20-confirm-pages-and-queue.md`, `docs/production-readiness.md` (OCR cost controls), memory rule "harden before paid runs"

## Findings

1. **Categorization failed on the 360 brochure** ("Page router timed out after 240000ms"). Two windows answered (about $0.0017, in the ledger); the third stalled on the provider's side for the whole timeout. A timeout was never retried, so one stalled window failed the whole run and threw away the answers already paid for. The stalled request may still be billed by the provider after our client gave up; it is not in our ledger because no response reached us.
2. **Brochure page frames did not fit the pages.** The lazy-mount wrapper in `pdf-page-grid.tsx` kept a permanent portrait minimum height, so a landscape page sat in a tall frame.
3. **The admin Usage tab counted fake spend.** `worker.integration.test.ts` wrote stub ledger rows ($0.0042 each, request id `gen-project…`) and deleted only their submissions, which detaches a ledger row (ON DELETE SET NULL) rather than removing it. Thirty-eight such rows had built up since 2026-09-19 ($0.16). The real total is $0.80 (Kimana about $0.77 plus categorizations).

## Changes

- [x] The router retries a stalled request once, like any other transient failure, and the per-request timeout is 2 minutes instead of 4 (a stalled request is retried sooner). Test: recovers on the second try; reports `request_timeout` only after two stalls.
- [x] The thumbnail wrapper reserves space only until the page is drawn.
- [x] The worker test removes its own ledger rows as the database owner (the app role is append-only), like the page-suggestions test already does. The 38 existing fake rows were deleted after checking each had the fake request id and no job or submission; real rows (ids `gen-1789…`) were not touched.

## Not changed

- Windows already answered are still not kept when a later window fails after two attempts (categorization costs cents; extraction already keeps raw answers per scope). Revisit if it recurs.

## Verification

`bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (see PROGRESS.md); the ledger total checked before and after the cleanup.
