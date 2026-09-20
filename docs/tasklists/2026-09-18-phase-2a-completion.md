# Tasklist — finish Phase 2A: login, developer submission flow, admin review/publish, GujRERA

**Status:** built 2026-09-20; closing needs the owner's review, the field-by-field spot-check and the merge (see `2026-09-20-close-phase-2a.md`). Reconciled against what shipped on 2026-09-20; the developer-facing screens in step 2 are deliberately on hold, not forgotten.
**Owner:** Bhavarth (implementation); reviewed decisions require explicit sign-off per `AGENTS.md` (auth, schema, publish transaction)
**Branch:** task/phase-2a-completion
**Depends on:** `publishSubmission`/`applySubmissionTransition` (done, `src/lib/submissions/`), the OCR adapter and ingestion pipeline (done, `src/lib/ocr/`), Better Auth (`src/lib/auth.ts`, plumbing done, no UI)
**References:** `docs/app-flows/admin.md`, `docs/app-flows/developer.md`, `docs/api/api-spec.v1.md` (Admin API and Developer API sections — the full route contract is already specified, all rows "Planned"), `docs/schema/schema.v1.md` (`developer_users`, `admin_users`, `source_documents`, `ocr_extraction_jobs`), `ARCHITECTURE.md`, `DECISIONS.md` 2026-09-18 (why this scope moved here from Phase 4)

## Why this tasklist exists

A 2026-09-18 status audit found the local catalog completely empty and found that **no UI anywhere in this codebase can create a property** — the only path that has ever worked is a maintainer running a one-off script calling `publishSubmission()` directly, and nothing about those runs persists. Rather than keep seeding through scripts, this tasklist finishes the real path: a developer uploads a brochure, reviews the OCR draft, submits it; an admin reconciles it field-by-field against evidence and publishes. See the dated `DECISIONS.md` entry for the full reasoning, including why the developer-facing half was pulled forward from Phase 4.

## Scope

In flow order — each step unblocks the next:

1. **Login/signup UI** — buyer phone-OTP, staff (developer/admin) email/password. Better Auth already implements both server-side; no screen exists for either.
2. **Developer portal, submission-creating half** (`docs/app-flows/developer.md` steps 1–8, minus the portfolio/analytics dashboard, which stays Phase 4): sign-in → portfolio link resolution → brochure upload → page-routing confirmation → OCR-draft review → submit → track status.
3. **Admin portal** (`docs/app-flows/admin.md`'s ingestion journey, steps 3–10): submission queue, field-by-field reconciliation UI (evidence + confidence + confirm/edit/reject), review (request changes/reject/approve), and the publish action wired to the already-implemented `publishSubmission`.
4. **`rera_fetch_jobs` scrape job and cross-check logic** — schema exists (`docs/schema/schema.v1.md`), zero implementation, no prior tasklist.

## Non-goals

- The human field-level OCR accuracy spot-check on Adani Amaris/Kimana Towers (`docs/tasklists/2026-09-02-ocr-provider-integration.md`'s sole unchecked line) stays deferred — it gets easier once step 3's reconciliation UI exists, so it's left for after.
- Developer portfolio/analytics dashboard (`GET /api/v1/developer/portfolio`) stays Phase 4, narrowed — see `docs/roadmap.md`.
- Admin MFA enforcement flip (`admin_users.mfa_enforced`) stays Phase 5 — the column is a placeholder per `schema.v1.md`, not a v1 requirement.
- No change to the publish transaction's own logic (`publishSubmission`/`applySubmissionTransition`) — this tasklist wires UI and routes to what already exists, not new transaction behavior.

## Open decisions to resolve before/during implementation — do not guess

- **Storage abstraction: resolved 2026-09-18.** `src/lib/storage/adapter.ts` (the `StorageAdapter` interface) and `src/lib/storage/gcs-adapter.ts` (its GCS implementation) now exist — see `docs/tasklists/2026-09-18-storage-adapter.md`. `src/lib/ocr/source-loader.ts`'s old direct, uninterfaced SDK call is retired; nothing outside `src/lib/storage/` may import `@google-cloud/storage` directly going forward. Step 2's brochure upload has an interface to call (`upload()`) instead of a second direct-SDK path to invent.
- **Buyer-facing URL-resolution strategy: resolved 2026-09-18.** `GET /api/v1/media/{id}` (`src/app/api/v1/media/[id]/route.ts`) redirects to a freshly-generated GCS V4 signed read URL per request — see `docs/tasklists/2026-09-18-media-redirect-route.md` and the dated `DECISIONS.md` entry (supersedes the 2026-09-07 signed-URL rejection). What's still open: actually wiring `PropertyCard`/the dossier to emit `<img src="/api/v1/media/{id}">` instead of the deliberate placeholder — blocked on step 2 below actually being able to create `property_media` rows in the first place.
- **Still open: provider migration.** The user is separately evaluating moving hosting off GCP to a Hostinger VPS. The adapter interface is what makes that a "write one new adapter" change rather than a codebase-wide hunt, but no second provider adapter exists yet and none is needed until that move is actually decided.
- **Resolved 2026-09-19 (see DECISIONS.md) — page-routing UI:** auto-suggest + thumbnail grid, free select/deselect, zoomable popup, confirm before paid OCR. Original question: `admin.md`/`developer.md` describe the _result_ (every brochure page confirmed as project/amenities/specifications/one unit-variant group/ignored, unit-variant groups spanning several ordered pages with optional labels) but not the UI itself. Needs a concrete interaction design (a page-thumbnail grid with scope assignment is the obvious shape, but this should be confirmed, not assumed, especially given `docs/design/design-tokens.md`'s existing design system may or may not have a precedent for it).
- **Resolved 2026-09-19 — developer onboarding:** admin creates the profile and emails an invite. Original question: `admin.md` step 1 says an admin does this "through the controlled admin builder-profile flow" — that flow itself isn't scoped anywhere yet and needs its own small piece of this tasklist.
- **Resolved 2026-09-19 — login UI:** three separate routes (`/login`, `/developers/login`, `/admin/login`). Original question: one screen with a buyer/staff mode switch, or two separate routes/pages. Buyer auth is phone-OTP; staff auth is email/password — different flows, and conflating them risks a confusing screen. Lean toward separate routes, but confirm before building.

## Implementation checklist (ordered; fill in as scoped)

### 1. Login/signup UI

- [x] Buyer phone-OTP screen(s): phone entry → OTP entry → session established (`/login`; `2026-09-19-login-ui.md`). Production delivery still needs an SMS provider (`docs/production-readiness.md`).
- [x] Email/password screens for developer and admin accounts (`/developers/login`, `/admin/login`).
- [x] Session-aware header state (signed-in indicator, sign-out), done 2026-09-19. The saved and comparisons entry points belong to Phase 3.

### 2. Developer portal — submission-creating half

> **On hold (owner decision 2026-09-20, `DECISIONS.md`):** the developer-facing upload, routing, review and submit screens are deferred until developers actually join; revisit only if the project is ahead of schedule. Sign-in, invitations and the team panel are done. The unchecked items below are deliberately not being worked.

- [ ] `developer_users` link resolution: a signed-in staff account resolves to its one linked `developers` profile (schema already supports this; no UI reads it yet).
- [ ] Brochure upload UI, calling `src/lib/storage/adapter.ts`'s `StorageAdapter.upload()` (interface and GCS implementation done, `docs/tasklists/2026-09-18-storage-adapter.md`). Brochures are `source_documents`, never buyer-facing; buyer-facing photos/floor plans are a separate flow (step 5).
- [ ] `POST /api/v1/admin/source-documents`-equivalent for developer-initiated uploads — check whether the existing Admin API route in `api-spec.v1.md` is reused as-is or needs a developer-scoped variant; the route table currently only lists it under Admin API.
- [ ] Page-routing confirmation UI (blocked on the interaction-model decision above).
- [ ] Trigger OCR extraction against the confirmed manifest (`POST /api/v1/admin/ocr-jobs/{id}/queue` — same reuse-vs-variant question as above).
- [ ] OCR-draft review UI: show extracted `property_submission_fields` with evidence, before submit (not full reconciliation — that's admin-only per `developer.md`'s permissions section; staff cannot set review results, only see and adjust before submitting).
- [ ] Submit action + status tracking (draft/submitted/in review/changes requested/approved/rejected/published).
- [ ] Respond-to-changes-requested flow (revise and resubmit).

### 3. Admin portal

- [x] Canonical `developers` profile creation + invitation flow (`2026-09-19-admin-portal.md`), with legal entities (schema v6).
- [x] Submission queue (one row per property, a Change column, status filters).
- [x] Field-by-field reconciliation screen: every candidate beside its evidence and confidence, confirm, edit or reject per field, published values shown beside proposals for an edit.
- [x] Review action: request changes, reject, or approve — no direct catalog mutation.
- [x] Publish action, wired to `publishSubmission`; owner-only.
- [x] Verifier vs. owner permission split, enforced server-side.

### 4. GujRERA fetch/cross-check job

- [x] Scoped in its own tasklist: `2026-09-20-gujrera-regulator-sync.md`.
- [x] Fetch retrieves a RERA record for a registration number and records the normalized record and matches on `rera_fetch_jobs` (never raw responses: they carry prices). Manual fetch, and the scheduled quarterly refresh (`2026-09-20-close-phase-2a.md`).
- [x] A difference found by the scheduled refresh becomes a `rera_scrape` draft edit (values `needs_review`), reviewed through the same admin flow; the job never writes a live table.

### 5. Property media, end to end (buyer photos/floor plans)

Background: `GET /api/v1/media/{id}` (signed-URL redirect) and `StorageAdapter.getSignedReadUrl` exist and are tested, but nothing can produce a `property_media` row and nothing renders an image. Recorded here so the last piece isn't lost (`docs/tasklists/2026-09-18-media-redirect-route.md`, 2026-09-18 `DECISIONS.md`).

- [x] **Decided 2026-09-19; built (`submission_media`, schema v6).** Field-contract gap (schema/contract change, needs sign-off per `AGENTS.md`):** the submission/OCR field contract (`property_schema_fields`) has no media field, so `publishSubmission` cannot create `property_media` rows — and `property_media` is a live catalog table bound by the one-write-path rule (no direct inserts, including tests and seed scripts). Decide and record the media field shape (dated `DECISIONS.md` entry; new `schema.v6.md` if structural), then extend `publishSubmission` to write `property_media` in the same publish transaction.
- [x] Media upload in the admin submission flow (photos, floor plans, brochure pages as images), via `StorageAdapter.upload()`, published only through the approval path. The developer-facing upload waits for the developer portal.
- [x] Resolved 2026-09-19: `brochure_pdf` is buyer-facing only if the developer marks it public (private by default); source documents and buyer media stay in separate storage paths.
- [x] `PropertyCard` and the dossier render real pictures (thumbnails on cards, a zoomable pop-up carousel).
- [x] The "found" test for `getPublishedMediaObjectPath` exists (`src/lib/properties/queries.integration.test.ts`). The route now has a real-database integration test too (`src/app/api/v1/media/[id]/route.integration.test.ts`: redirect, 404s, removed unit type, unlisted and deleted property); it found and fixed a 500 on a malformed id.

## Tests

- [x] Auth UI: sign-up/sign-in flows for both buyer (phone-OTP) and staff (email/password), covering failure/retry paths per `buyer.md`'s exception paths ("OTP failure/expiry: preserve return destination and allow retry without recording an unlock").
- [ ] Developer flow: upload → routing → OCR review → submit, end to end against a real (non-production) brochure or a synthetic/redacted fixture, matching the existing OCR integration tests' convention of never committing real brochure content.
- [x] Admin flow: queue → reconciliation → approve → publish, end to end, asserting the live catalog only ever changes through `publishSubmission` and that a rejected/changes-requested submission never reaches it.
- [x] Permission boundaries: developer staff cannot approve/publish/set review results (403, not just a hidden UI control); admin verifier vs. owner split enforced server-side, not only in the UI.
- [x] GujRERA: the fetch and the scheduled refresh never write live data; a mismatch produces a reviewable draft (`refresh.integration.test.ts`).

## Documentation

- [ ] `docs/api/api-spec.v1.md`: flip implemented Admin/Developer API rows from "Planned (Phase 2A)"/"Planned (Phase 4)" as each route ships.
- [ ] `docs/app-flows/admin.md` and `docs/app-flows/developer.md`: update status lines as their flows are implemented (already updated 2026-09-18 to note the merged scope; update again to "implemented" once true).
- [ ] Record the GCS storage strategy, the page-routing interaction model, and the builder-profile creation flow as dated `DECISIONS.md` entries when decided — all three are flagged above as open.

## Handoff

- [ ] Run format, lint, typecheck, full test suite at each meaningful checkpoint, not only at the end — this is large enough that "finish everything then verify once" risks losing track of what broke where.
- [ ] Update `PROGRESS.md` as pieces land, not only at completion.
- [ ] Per the user's direction (2026-09-18): once this tasklist completes, work continues in a new session against an updated tasklist for what remains (Deep's Phase 3 UI wiring, Phase 4's narrowed portfolio dashboard, Phase 5). Leave this tasklist's completion record as the authoritative summary for that handoff.
