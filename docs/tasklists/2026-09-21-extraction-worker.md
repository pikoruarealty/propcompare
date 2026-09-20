# Tasklist — extraction worker, run status, and first-property readiness

**Status:** complete — 2026-09-21
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`; follows `2026-09-20-confirm-pages-and-queue.md`
**References:** `docs/product/prd.v1.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md` (Admin API), `docs/schema/schema.v6.md`, `docs/ocr-routing-contract.v2.md`, `docs/design/design-tokens.md`, `DECISIONS.md` 2026-09-20, `src/lib/ocr/ingestion.ts`, `src/lib/ocr/adapter.ts`

## Scope

"Queue extraction" today only flips a job to `queued`; nothing consumes it
(`executeOcrExtractionJob` is called only by tests and a throwaway script). This
tasklist builds the consumer and the screens around it so one brochure can go
from upload to a published property entirely through the UI:

1. **A durable worker** that claims queued jobs, runs the Claude extraction,
   and writes the draft fields. Claiming is atomic, so any number of processes
   can run it safely. It is started automatically with the app server
   (`instrumentation.ts`) and can also run alone (`bun run ocr:worker`) for a
   host that separates the two.
2. **Crash recovery.** A job left `processing` by a process that died is failed
   with a clear code after a lease expires, never left spinning forever.
3. **Run status in the UI.** The submission and page-review screens show
   queued / reading / ready / failed live, with a plain failure message, a
   confirmed "Try again" for failed runs, and a link to the extracted fields.
4. **Retry.** A failed attempt can be queued again (a second paid run, so its
   own confirmation, no price shown).
5. **Close the known cost-ledger gap:** spend from scopes that succeeded before
   a mid-run failure is recorded.
6. **Small leftovers:** Brevo invite email delivery (owner chose Brevo,
   2026-09-21), and clearing the repo's `format:check` failures.

## Decisions and boundaries

- No schema change. Job state uses the existing `ocr_job_status` enum and
  `updated_at` as the heartbeat/lease clock. Claiming uses the existing conditional
  `queued → processing` update in `executeOcrExtractionJob`.
- The worker never runs on upload or on categorize. Only a queued job (an
  admin's explicit, separately confirmed action) is ever picked up.
- Extraction writes only `property_submission_fields` and evidence. The live
  catalog is still written solely by `publishSubmission` after human approval.
- Provider spend stays out of every UI; it goes to the ledger only.
- The in-process poller is off under `NODE_ENV=test` and can be disabled with
  `OCR_WORKER_ENABLED=false` (for example on a web-only host that runs the
  standalone worker).

## Non-goals

- No cancel-in-flight, priority queue, or multi-provider fallback.
- No GujRERA work, no developer-facing screens, no buyer UI.

## Checklist

### Worker

- [x] `src/lib/ocr/worker.ts`: run one queued job with the storage-backed
      OpenRouter adapter; poll loop with stop signal; skips jobs another worker
      claimed.
- [x] Recover stale `processing` jobs (lease expired) as `worker_interrupted`.
- [x] `instrumentation.ts` starts the loop once per server (HMR-safe, Node
      runtime only); `src/db/ocr-worker.ts` + `bun run ocr:worker` runs it alone.
- [x] Partial usage of a failed run (`partialUsageOf`, kept beside the error so no error type changes), recorded by ingestion.

### Retry and status

- [x] `reopenFailedOcr` + `POST /api/v1/admin/ocr-jobs/{id}/retry`.
- [x] Job status on the submission detail and page-review reads.
- [x] Extraction status panel with polling refresh, failure message, retry
      confirmation, link to fields.

### Small leftovers

- [x] Brevo email adapter; invite link is emailed when configured, still shown
      on screen either way.
- [x] Prettier failures in the four flagged files.

### Tests and verification

- [x] Integration: claim/run/complete, two workers one job, failure, stale
      recovery, retry, partial-usage ledger rows.
- [x] Route + component tests.
- [x] Lint, typecheck, full suite, prettier on touched files.
- [x] Browser check with a stub provider (no paid call): queue → reading →
      ready → fields visible.

### Documentation

- [x] `PROGRESS.md`, `DECISIONS.md` (worker model, Brevo), API spec,
      `docs/production-readiness.md`, `.env.example`.

## Acceptance criteria

- Queueing a confirmed brochure through the UI results, with no other manual
  step, in a completed job and draft fields on the same submission.
- Killing the server mid-run leaves the job visibly failed within the lease
  window, and it can be retried from the UI.
- Two workers never run the same job.
- Cost of every billed request is in the ledger, including on failure.

## Completion record

**Completed 2026-09-21.** Queueing a confirmed brochure now needs no other step:
a worker started with the app server (or `bun run ocr:worker`) claims it, runs the
Claude extraction, and writes draft fields with evidence. The submission and
page-review screens show waiting / reading / finished / failed, refresh
themselves, explain a failure in plain words (never quoting the provider), and
offer "Edit pages" or a confirmed "Try again".

**Verified:** 27 new tests (worker, two simultaneous workers, failure with partial
billing, stale recovery, retry and its race, route, screen, Brevo adapter); lint,
typecheck, prettier and the full suite (883) clean. `scripts/verify-extraction-worker.mjs`
drives the real UI in Chrome and Brave against a stand-in provider (no paid call):
upload, confirm two pages, queue, failed run, Try again, finished, draft shows the
extracted values with page evidence, 18/18.

**Not verified live:** a real Claude run (paid; next step, needs the owner's
go-ahead); a real Brevo send (mocked); killing the server mid-run (recovery is
tested with a simulated clock, not by killing a process).

**Next:** the first real brochure through the UI.
