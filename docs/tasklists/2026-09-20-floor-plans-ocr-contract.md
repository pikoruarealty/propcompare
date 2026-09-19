# Tasklist — floor-plans OCR contract

**Status:** complete — 2026-09-20
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`, step 2; `docs/tasklists/2026-09-19-admin-portal.md`, slice 4
**References:** `docs/product/prd.v1.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md`, `docs/schema/schema.v3.md` (the existing `routing_manifest` boundary), `docs/tasklists/2026-09-02-ocr-provider-selection.md` finding 3, `DECISIONS.md` 2026-09-20 (page-routing and floor-plan decisions), `src/lib/ocr/routing.ts`, `src/lib/ocr/adapter.ts`, `src/lib/ocr/ingestion.ts`

## Scope

Add the approved `floor_plans` routing scope to the versioned OCR contract. It
contains every admin-confirmed floor-plan page in one ordered scope. Claude
extracts zero or more unit variants from that complete scope, so it can merge
duplex/penthouse level pages and identify variants that share a floor plate.
The existing `unit_variant` scope remains the explicit, one-pre-named-variant
path for hand-routed cases.

Manifest v1 remains readable and unchanged. New manifests use v2; the database
column remains the same workflow-metadata JSONB column, so this is not a
database schema migration and it does not touch the publish transaction or a
live catalog table.

## Decisions and boundaries

- Floor-plan grouping belongs to Claude extraction, not the Gemini page router
  and not manual page grouping (`DECISIONS.md` 2026-09-20; provider-selection
  finding 3).
- A human still confirms all page categories before queueing any paid OCR run.
  This task adds only the contract and adapter support; it does not create the
  confirmation or queue UI/route.
- A discovered variant must have a non-empty evidence-backed `variantName` and
  no duplicate name may reach the submission value. `bhkTypeKey` and
  `layoutTypeKey` are omitted for discovered variants unless a later human
  review supplies approved catalog keys. This avoids an unvalidated AI-created
  controlled-vocabulary path.
- A `floor_plans` response may legitimately contain no variants. A confirmed
  page can turn out not to expose a unit configuration; this is reviewable
  missing data, not an adapter failure.
- No price, rate, currency, or commercial term may enter OCR output. Existing
  response validation stays the boundary.

## Non-goals

- No live provider run, spend, or OpenRouter credit requirement.
- No page-confirmation UI, OCR queue route, reconciliation UI, media extraction,
  `submission_media`, or canonical-schema migration.
- No change to `publishSubmission`, source-document storage, or the admin usage
  ledger.

## Checklist

### Discovery

- [x] Read `AGENTS.md`, `PROGRESS.md`, applicable `DECISIONS.md` entries, the
      parent Phase 2A/admin tasklists, active schema boundary, and OCR code/tests.
- [x] Read the installed Next.js Route Handlers guide before considering the
      later queue route; this scoped change adds no route.
- [x] Confirm the existing adapter accepts exactly one variant from each v1
      `unit_variant` scope and that its candidate builder is the sole ingestion
      path to submission fields.

### Implementation

- [x] Document routing-manifest v2 beside the immutable schema history.
- [x] Parse v1 and v2 manifests, including a v2 `floor_plans` scope, while
      preserving v1 invariants.
- [x] Extend the extraction prompt and response validation for multiple
      discovered variants from one floor-plans scope.
- [x] Assemble discovered and pre-named variants deterministically into the
      single canonical `unit_variants` field with correct evidence value paths.

### Tests

- [x] Cover v1 compatibility, v2 validation, empty discovery, duplicate names,
      evidence scope/page checks, adapter prompt/output parsing, and canonical
      candidate assembly.
- [x] Run focused OCR tests, then `bun run format:check`, `bun run lint`,
      `bun run typecheck`, and `bun run test`.

### Documentation and handoff

- [x] Mark the parent tasklists’ floor-plans contract item complete.
- [x] Update `PROGRESS.md` with outcome and the still-pending confirm/queue
      step.
- [x] Record verification results and follow-up in this tasklist.

## Acceptance criteria

- v1 manifests parse and yield exactly their existing candidate shape.
- v2 `floor_plans` permits one ordered, non-empty page set and no predeclared
  variant identity.
- A floor-plans provider response can produce multiple uniquely named,
  evidence-backed variants in one canonical submission-field candidate.
- Duplicate or unsupported output is rejected before persistence; no direct
  catalog write is introduced.

## Completion record

**Completed 2026-09-20.** Added `docs/ocr-routing-contract.v2.md`, which
keeps routing-manifest v1 unchanged and defines the v2 `floor_plans` scope.
The parser accepts both versions; v2 permits only one ordered floor-plans
scope and prevents a page from creating two unit identities. Claude's v2
scope response can return zero or more evidence-backed named variants. The
adapter rejects duplicate names and AI-supplied BHK/layout lookup keys, then
creates the existing one `unit_variants` submission-field candidate with
stable evidence array paths.

**Verified:** focused OCR tests (16), `bun run lint`, `bun run typecheck`, and
the full suite (702 tests across 59 files) pass. Targeted Prettier checking
passes. The repository-wide `bun run format:check` still reports five
pre-existing unrelated files (`.tmp-ocr-live-smoke.ts`, `ARCHITECTURE.md`,
`drizzle.config.ts`, `README.md`, and `scripts/categorize-brochures.mjs`);
they were not changed by this task.

**Next:** build the separately scoped confirmation and OCR-queue step. It will
turn the admin's selected page categories into a v2 manifest, explicitly
confirm the paid Claude run without showing a price, and queue the job.
