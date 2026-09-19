# Tasklist — confirm brochure pages and queue OCR

**Status:** complete — 2026-09-20
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`, steps 2–3; `docs/tasklists/2026-09-19-admin-portal.md`, slice 4
**References:** `docs/product/prd.v1.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md` (Admin API), `docs/schema/schema.v3.md`, `docs/ocr-routing-contract.v2.md`, `docs/design/design-tokens.md`, `DECISIONS.md` 2026-09-19/20, `src/components/admin/page-review.tsx`, `src/lib/ocr/routing.ts`, `src/lib/ocr/ingestion.ts`

## Scope

Finish the human routing boundary before OCR. An admin turns every page in a
draft brochure into one of the approved extraction categories or an explicit
ignore. The server builds the only accepted routing manifest — v2, from the
page-level choices — validates it against the source document, and stores it
while the attempt is still a draft. A separate explicit action then queues the
attempt for Claude extraction, freezing that confirmed manifest.

The two actions are deliberately separate. Saving page choices makes no model
call. Queueing makes no provider call in this application either; it changes
the job to `queued` for the existing worker entry point
(`executeOcrExtractionJob`) to consume. It is nevertheless a separate human
confirmation because the worker’s eventual Claude call is paid.

## Decisions and boundaries

- The admin, not Gemini, owns the final category for every page. Suggestions
  are advisory only (`DECISIONS.md` 2026-09-20).
- The server receives page-level choices, not client-authored scopes. It builds
  `property_details`, `amenities`, `specifications`, optional `floor_plans`,
  and `ignore` scopes itself. This prevents a parallel manifest shape and
  guarantees every source page is handled.
- At least one extraction page is required. A brochure cannot be queued if all
  pages are ignored; it stays a draft for correction.
- No price or cost is shown anywhere in the portal. The final confirmation
  says only that Claude will read the confirmed pages; operational spend stays
  in the admin-only usage ledger when a worker actually runs.
- The manifest is immutable after queueing. Both endpoints permit only a
  draft attempt and use conditional updates to reject concurrent changes.
- This writes only OCR workflow metadata/status, not a live catalog table;
  `publishSubmission` remains the sole live-catalog write path.

## Non-goals

- No paid provider call, background worker, polling/status endpoint, extraction
  result UI, reconciliation, submission-media work, database migration, or
  publish-transaction change.
- No developer-portal variant; this is the admin-operated pre-launch path.
- No automatic categorization or change to stored Gemini suggestions.

## Checklist

### Discovery

- [x] Read the repository rules, progress/decision records, parent tasklists,
      active OCR schema/contract, installed Next.js Route Handler guidance, and
      existing page-review, session, query, ingestion, and API-route code.
- [x] Confirm queueing has no current worker side effect and the existing
      extraction entry point accepts a queued attempt.

### Implementation

- [x] Build and validate a v2 manifest server-side from complete page choices.
- [x] Add admin-only save-routing and queue endpoints with draft-only,
      conflict-safe state transitions.
- [x] Add the two confirmation states to the page-review workbench, including
      incomplete-routing feedback and a no-price extraction confirmation.
- [x] Render queued state as read-only rather than offering a mutable draft.

### Tests

- [x] Unit-test page-choice parsing/manifest generation and state guards.
- [x] Integration-test draft persistence, all-ignored rejection, queueing,
      frozen-manifest refusal, and concurrent-state protection.
- [x] Route-test auth, malformed input, missing attempt, and state errors.
- [x] Run focused tests, then lint, typecheck, full tests, formatting, and
      diff checks.

### Documentation and handoff

- [x] Mark API and parent tasklist items implemented.
- [x] Update `PROGRESS.md` and record this task’s verification and follow-up.

## Acceptance criteria

- The only persisted confirmed routes are parser-valid v2 manifests made from
  one explicit decision per source page.
- A selected page without a category cannot be saved; an all-ignore manifest
  cannot be saved or queued.
- Queueing is a separate confirmation and only changes a valid draft to
  `queued`; any later edit/queue retry fails safely.
- No action calls OpenRouter or exposes price/cost data.

## Completion record

**Completed 2026-09-20.** The browser submits one category or ignore choice per page; the server builds and validates the only accepted v2 manifest, rather than accepting client-authored scopes. The admin routing endpoint saves that manifest only while an attempt is a draft. The queue endpoint revalidates it and conditionally transitions the same attempt to `queued`. Neither endpoint calls a provider.

The page-review workbench has two explicit confirmations: save page routing, then queue Claude extraction in a dialog. It contains no cost or price copy. Once queued, the brochure remains viewable but page controls are disabled.

**Verified:** manifest/state integration tests, route tests, and UI tests; lint; typecheck; full suite (715 tests across 63 files); and diff checks pass. Targeted Prettier passes. Repository-wide format:check remains blocked only by five unrelated pre-existing files (`.tmp-ocr-live-smoke.ts`, `ARCHITECTURE.md`, `drizzle.config.ts`, `README.md`, and `scripts/categorize-brochures.mjs`), none changed here.

**Next:** once OpenRouter has credits, live-validate page categorization on the three named brochures, then use this flow to queue controlled extraction. After that, the next Phase 2A implementation item is the OCR-draft review/reconciliation UI.
