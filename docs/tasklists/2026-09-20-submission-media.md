# Tasklist — submission media approval and publish path

**Status:** in progress
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`, step 5; `docs/tasklists/2026-09-19-admin-portal.md`, slices 4–5
**References:** `AGENTS.md`, `ARCHITECTURE.md` (one publish write path), `docs/schema/schema.v1.md`, `docs/schema/schema.v6.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md`, `DECISIONS.md` 2026-09-19/20

## Scope

Implement the owner-approved `submission_media` representation and the only
permitted transition to buyer-visible `property_media`: copying approved media
inside `publishSubmission`'s existing transaction. An admin can upload its own
image to a draft submission, review it with the rest of the submission, and
either approve or reject it before publishing. Every row records its origin and
attribution.

This does **not** implement server-side extraction of images from brochure PDFs.
That needs an explicit PDF rasteriser/embedded-image extraction dependency
decision, and no browser-canvas extraction is allowed.

## Tasks

- [x] Document the approved v6 media shape and the publish invariants.
- [x] Add the additive database schema and generated migration; do not write a
      live catalog row in the migration.
- [x] Add server-side draft-media validation and upload, including ownership
      checks and immutable object paths.
- [x] Extend `publishSubmission` to copy only reviewed, approved media in its
      transaction; preserve attribution and source kind in the revision.
- [x] Add admin review controls for media and an own-image upload action.
- [x] Add focused unit, integration, route authorization, and UI tests.
- [x] Update API/flow/schema/progress/tasklist documentation and verify format,
      lint, typecheck, and the full suite.
