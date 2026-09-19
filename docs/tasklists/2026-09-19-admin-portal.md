# Tasklist — admin portal: developer profiles and invites, submission queue, reconciliation, approve and publish

**Status:** in progress — slice 1 (shell + developer profiles) done 2026-09-19; slice 2 awaits sign-off on the invite design
**Owner:** Bhavarth
**Branch:** task/phase-2a-completion
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`, steps 2–3 (the admin half, plus the invite half of developer onboarding)
**References:** `docs/app-flows/admin.md`, `docs/app-flows/developer.md`, `docs/api/api-spec.v1.md` (Admin API rows, all "Planned (Phase 2A)"), `docs/design/design-tokens.md`, Stitch `submission_queue_high_fidelity` and `editorial_desk_high_fidelity_verification` screens, `src/lib/submissions/` (`applySubmissionTransition`, `publishSubmission`), `DECISIONS.md` 2026-09-19

## Design stance

The admin portal is its own surface, not the buyer shell with a role gate (`DECISIONS.md` 2026-08-31). It follows the Stitch "Editorial Desk" layout: a chalk sidebar with serif navigation and a sage active item, and a main column of white tonal panels on the chalk canvas. Every screen must read as one designed tool, not features stacked on features. No Stitch placeholder content (Miami, AED, etc.) — Ahmedabad/Gujarat only.

Every page and server action calls `requirePortalRole("admin", …)` itself; a layout guard alone is not enough (`src/lib/accounts/session.ts`). Nothing in the portal writes a live catalog table except through `publishSubmission`.

## Pre-launch operating model (decided 2026-09-19 — see `DECISIONS.md`)

We upload every property ourselves until developers join. Consequences for this tasklist and the ones after it:

- **Ownership:** every property is uploaded under the real developer's canonical profile (no account needed). Joining later means inviting their user to the existing profile (slice 2) — no transfer. No mock/placeholder profile.
- **Manual entry alongside brochure OCR** (`source = manual_form`, already in the schema): the same reconciliation/edit screen opens a blank draft with every field `not_stated`. Build it in slice 5 with the reconciliation screen so both paths share one UI, and make "Add property manually" a first-class action next to "Upload brochure" in slice 3/4.
- **Dedupe:** two uploads of one project must not create two properties — match on RERA project number before creating; surface a warning in the queue. Decide whether a profile is the brand or the legal promoter entity (RERA registers the promoter; brand names differ).
- **Media:** brochure floor plans/renders may be published with attribution and a takedown route. The `submission_media` design (schema v6) carries `attribution` and `source_kind` (`developer_brochure` | `own` | `developer_supplied`) and each property page shows attribution. Open sub-question: how an admin turns a brochure page into a floor-plan image (crop or whole page) — decide when slice 4/5 UI is designed.
- **Enquiries** route to an admin inbox (buyer enquiries currently assume a developer). New admin screen + follow-up status; the existing `enquiries.status` enum is the starting point.
- **Public trust links** on every property: "Report a problem / request removal" and "Are you the developer? Claim this listing". Both create items in an admin queue (fact-check and developer-lead). Not built.
- **"Last checked" date** shown on every property; re-check rhythm supported by the GujRERA cross-check job.
- **Analytics (future scope, owner decision 2026-09-19):** the paid developer insights product is a platform-scale effort to be designed at beta, not a per-property counter. Nothing in this tasklist builds it; keep event-worthy actions (views, saves, comparisons, unlocks, enquiries) as stored records so a later capture design can consume them. See `DECISIONS.md` 2026-09-19 and `docs/roadmap.md` Phase 4.
- **"Verified" wording** must say checked by PropCompare, not endorsed by the developer, until developers participate.
- **Known gap:** `publishSubmission` cannot change an existing property's developer (`src/lib/submissions/publisher.ts` only sets `developer_id` on a new property). A profile merge or reassignment would need publisher work plus a decision entry — deliberately not needed under the real-profile-from-day-one model.

## Slices, in order

### Slice 1 — shell and developer profiles

- [x] Admin shell (sidebar + main) as a shared component; `/admin` lands on the developer directory until the queue exists.
- [x] `/admin/developers`: list canonical developer profiles (name, RERA developer id, linked users, property count).
- [x] Create a canonical developer profile (name required; RERA developer id and website optional; RERA id unique). Validation shared and unit-tested; integration-tested against Postgres.
- [x] `/admin/developers/[id]`: profile detail and its linked users (empty until slice 2).

### Slice 2 — inviting developer users (needs sign-off before coding — auth design)

Proposed, using only existing tables so no schema change is needed:

1. Admin enters an email on a developer's page. The server creates a `users` row (no credential account yet), a `developer_users` row with `status = invited`, and a single-use token: 32 random bytes, only its SHA-256 hash stored in Better Auth's generic `verifications` table (`identifier = developer-invite:<userId>`, `expires_at` = 7 days).
2. The admin sees the invite link once (`/developers/accept-invite?u=<userId>&t=<token>`) and shares it. No email provider exists yet (`docs/production-readiness.md`); when one does, the same link is emailed instead.
3. The developer opens the link, sets a password (12+ characters). The server verifies the token hash and expiry, creates the credential account, sets `developer_users.status = active`, deletes the token. Replays fail.
4. Admin can revoke (`status = revoked`, token deleted) and re-issue.

Under the pre-launch model the invite goes to the existing canonical profile the admin already uploaded properties under. Decision still needed from the owner: is an on-screen link acceptable until email exists, and is a 7-day expiry right? Also: should a developer profile allow more than one linked user (the schema does).

### Slice 3 — submission queue

- [ ] `GET/POST` admin routes per the API spec: submissions list filtered by status; detail with fields and evidence.
- [ ] `/admin/submissions`: queue table per the Stitch screen (property & developer, location, submitted date, status pill, action).

### Slice 4 — source documents, page routing, OCR trigger (shared with the developer portal)

- [ ] Brochure upload via `StorageAdapter.upload()`; immutable `source_documents` row.
- [ ] Page-routing confirmation: auto-suggested category per page in a thumbnail grid, free select/deselect, large zoomable viewer, explicit confirmation before any paid OCR run (`DECISIONS.md` 2026-09-19).
- [ ] `POST …/ocr-jobs/{id}/queue` and status polling.

### Slice 5 — reconciliation, review, publish

- [ ] Field-by-field reconciliation: value, confidence, evidence pages in a viewer; confirm / edit / reject with field-contract validation.
- [ ] Review actions (request changes, reject, approve) through `applySubmissionTransition`; verifier vs owner rules per the existing transition table.
- [ ] Publish (owner only) through `publishSubmission`; revision snapshot; failure leaves no partial writes.

## Tests

Unit tests for validation and view-model logic; integration tests against Postgres for every write; UI tests for each screen's empty, populated and error states; an authorization test per route (signed-out, buyer, developer, verifier, owner).

## Verification and handoff

- [ ] Full suite, lint, typecheck green; screenshots of each screen compared with the Stitch reference.
- [ ] `PROGRESS.md`, `docs/api/api-spec.v1.md` statuses, and `docs/production-readiness.md` updated.
