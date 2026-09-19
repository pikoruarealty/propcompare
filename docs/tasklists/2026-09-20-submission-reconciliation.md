# Tasklist — shared submission reconciliation, review, and publication

**Status:** complete 2026-09-20 (publishing to the live catalog through the UI is not exercised end to end; see verification)
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`, step 3; `docs/tasklists/2026-09-19-admin-portal.md`, slice 5
**References:** `AGENTS.md`, `ARCHITECTURE.md`, `docs/schema/schema.v5.md`, `docs/schema/schema.v6.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md`, `docs/design/design-tokens.md`, `DECISIONS.md` 2026-09-19/20, `src/lib/submissions/`

## Scope

Deliver the common editing and review workflow for a `property_submissions`
draft. Manual entry creates the same kind of draft as OCR, with fields initially
`not_stated`; OCR fields retain confidence and evidence. Admins can validate and
confirm/edit/reject fields and submission media, move a submission through the
existing state machine, and an owner can invoke the existing atomic publish
transaction. No route writes a live catalog table directly.

## Tasks

- [x] Add draft creation and field/media mutation services with server-side
      field-contract validation and conditional state checks.
- [x] Add admin routes for manual drafts, field/media review, review actions,
      and owner-only publication.
- [x] Build the reconciliation screen with evidence-aware fields, media review,
      manual-entry action, and clear transition/publish controls.
- [x] Add unit, integration, UI, and authorization tests, including no partial
      live write on rejection/failure.
- [x] Update API, app-flow, tasklist, and progress documentation; run full
      formatting, lint, typecheck, and test verification.

## Verification

- Integration tests (Postgres): reconciliation (draft creation, contract-validated edits that drop stale evidence, review only in review, the state machine with roles, two simultaneous submits cannot both win) and media (magic-byte image check, size and attribution rules, private-until-reviewed, rejected is never public, cross-submission review refused).
- Route tests: every admin submission route needs an admin session, publish needs an owner, review cannot publish, an upload cannot claim a brochure-derived source.
- UI tests: typed inputs (numbers, choices from approved lists, amenities by category, the unit-types editor), value display by label not key, and the workflow panel's permissions and confirmations.
- Browser check (`scripts/verify-manual-entry.mjs`, Chrome and Brave, 28/28): manual draft → typed fields → refused bad value → own image with credit → submit → review → confirm all → approve image → approve submission → publish asks for confirmation. It stops before publishing so no test property enters the catalog; the publish transaction itself is covered by `publisher.integration.test.ts`.

## Notes and follow-ups

- The field editor picks from the approved vocabularies (property types, amenities, bedroom and layout types, possession status); the server validates again.
- Room dimensions on a unit type are preserved but not editable in this screen.
- Images are validated by file signature and size only. No malware scan, dimension limit or re-encoding yet (see `docs/production-readiness.md`).
- Editing during review is not allowed by the state machine: a reviewer who finds a wrong value requests changes, the value is fixed while it is editable, and it is submitted again.
