# Tasklist — finish Phase 2A: login, developer submission flow, admin review/publish, GujRERA

**Status:** planned — not started
**Owner:** Bhavarth (implementation); reviewed decisions require explicit sign-off per `AGENTS.md` (auth, schema, publish transaction)
**Branch:** not yet created
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
- **Still open: the buyer-facing URL-resolution strategy** (public bucket vs. signed URLs vs. a proxy route) — the storage adapter deliberately does not resolve this; `download()` returns bytes, not a browsable URL. Flagged originally in the 2026-09-07 `DECISIONS.md` dossier-media-gate entry. A `getSignedReadUrl`-style method belongs on the adapter interface once this is decided.
- **Still open: provider migration.** The user is separately evaluating moving hosting off GCP to a Hostinger VPS. The adapter interface is what makes that a "write one new adapter" change rather than a codebase-wide hunt, but no second provider adapter exists yet and none is needed until that move is actually decided.
- **Page-routing UI interaction model.** `admin.md`/`developer.md` describe the _result_ (every brochure page confirmed as project/amenities/specifications/one unit-variant group/ignored, unit-variant groups spanning several ordered pages with optional labels) but not the UI itself. Needs a concrete interaction design (a page-thumbnail grid with scope assignment is the obvious shape, but this should be confirmed, not assumed, especially given `docs/design/design-tokens.md`'s existing design system may or may not have a precedent for it).
- **Who can create a canonical `developers` profile and invite staff.** `admin.md` step 1 says an admin does this "through the controlled admin builder-profile flow" — that flow itself isn't scoped anywhere yet and needs its own small piece of this tasklist.
- **Login UI shape**: one screen with a buyer/staff mode switch, or two separate routes/pages. Buyer auth is phone-OTP; staff auth is email/password — different flows, and conflating them risks a confusing screen. Lean toward separate routes, but confirm before building.

## Implementation checklist (ordered; fill in as scoped)

### 1. Login/signup UI

- [ ] Buyer phone-OTP screen(s): phone entry → OTP entry → session established. Reuses Better Auth's `phoneNumber` plugin, already wired.
- [ ] Staff email/password screen(s) for developer and admin accounts. Reuses Better Auth's `emailAndPassword`, already wired.
- [ ] Session-aware header/nav state (a signed-in buyer sees saved/comparisons entry points; this may overlap with Deep's Phase 3 UI work — coordinate, don't duplicate).

### 2. Developer portal — submission-creating half

- [ ] `developer_users` link resolution: a signed-in staff account resolves to its one linked `developers` profile (schema already supports this; no UI reads it yet).
- [ ] Brochure upload UI, calling `src/lib/storage/adapter.ts`'s `StorageAdapter.upload()` (interface and GCS implementation done, `docs/tasklists/2026-09-18-storage-adapter.md`) — still needs the buyer-facing URL-resolution strategy decided if the upload flow needs to show a preview, though the upload itself doesn't require it.
- [ ] `POST /api/v1/admin/source-documents`-equivalent for developer-initiated uploads — check whether the existing Admin API route in `api-spec.v1.md` is reused as-is or needs a developer-scoped variant; the route table currently only lists it under Admin API.
- [ ] Page-routing confirmation UI (blocked on the interaction-model decision above).
- [ ] Trigger OCR extraction against the confirmed manifest (`POST /api/v1/admin/ocr-jobs/{id}/queue` — same reuse-vs-variant question as above).
- [ ] OCR-draft review UI: show extracted `property_submission_fields` with evidence, before submit (not full reconciliation — that's admin-only per `developer.md`'s permissions section; staff cannot set review results, only see and adjust before submitting).
- [ ] Submit action + status tracking (draft/submitted/in review/changes requested/approved/rejected/published).
- [ ] Respond-to-changes-requested flow (revise and resubmit).

### 3. Admin portal

- [ ] Canonical `developers` profile creation + staff invitation flow (the "controlled admin builder-profile flow" `admin.md` references but doesn't scope).
- [ ] Submission queue (`GET /api/v1/admin/submissions`, filtered by status).
- [ ] Field-by-field reconciliation screen (`GET /api/v1/admin/submissions/{id}`, `PATCH .../fields/{fieldId}`): every candidate field alongside its evidence pages/snippets and confidence, confirm/edit/reject per field.
- [ ] Review action (`POST /api/v1/admin/submissions/{id}/review`): request changes, reject, or approve — no direct catalog mutation, per the existing contract.
- [ ] Publish action (`POST /api/v1/admin/submissions/{id}/publish`): wires to the already-implemented `publishSubmission`; owner-only per the permission model.
- [ ] Verifier vs. owner permission split, per `admin.md`'s permissions section ("Owners administer higher-risk approval/publish operations").

### 4. GujRERA fetch/cross-check job

- [ ] Needs its own scoping pass and likely its own sub-tasklist per `docs/tasklists/README.md`, given it's a distinct integration (an external fetch job) rather than UI — flag when reached rather than scoping fully here.
- [ ] Fetch job retrieves a RERA record for a known registration number, records fetched payload/matches (`rera_fetch_jobs`).
- [ ] A mismatch or new fact becomes a new `property_submissions` row with `source: "rera_scrape"`, reviewed through the same admin flow as any other submission — never a direct live-data write.

## Tests

- [ ] Auth UI: sign-up/sign-in flows for both buyer (phone-OTP) and staff (email/password), covering failure/retry paths per `buyer.md`'s exception paths ("OTP failure/expiry: preserve return destination and allow retry without recording an unlock").
- [ ] Developer flow: upload → routing → OCR review → submit, end to end against a real (non-production) brochure or a synthetic/redacted fixture, matching the existing OCR integration tests' convention of never committing real brochure content.
- [ ] Admin flow: queue → reconciliation → approve → publish, end to end, asserting the live catalog only ever changes through `publishSubmission` and that a rejected/changes-requested submission never reaches it.
- [ ] Permission boundaries: developer staff cannot approve/publish/set review results (403, not just a hidden UI control); admin verifier vs. owner split enforced server-side, not only in the UI.
- [ ] GujRERA: fetch job never writes live data directly; a mismatch produces a reviewable submission, not an automatic change.

## Documentation

- [ ] `docs/api/api-spec.v1.md`: flip implemented Admin/Developer API rows from "Planned (Phase 2A)"/"Planned (Phase 4)" as each route ships.
- [ ] `docs/app-flows/admin.md` and `docs/app-flows/developer.md`: update status lines as their flows are implemented (already updated 2026-09-18 to note the merged scope; update again to "implemented" once true).
- [ ] Record the GCS storage strategy, the page-routing interaction model, and the builder-profile creation flow as dated `DECISIONS.md` entries when decided — all three are flagged above as open.

## Handoff

- [ ] Run format, lint, typecheck, full test suite at each meaningful checkpoint, not only at the end — this is large enough that "finish everything then verify once" risks losing track of what broke where.
- [ ] Update `PROGRESS.md` as pieces land, not only at completion.
- [ ] Per the user's direction (2026-09-18): once this tasklist completes, work continues in a new session against an updated tasklist for what remains (Deep's Phase 3 UI wiring, Phase 4's narrowed portfolio dashboard, Phase 5). Leave this tasklist's completion record as the authoritative summary for that handoff.
