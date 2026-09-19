# Tasklist — shared submission reconciliation, review, and publication

**Status:** in progress
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

- [ ] Add draft creation and field/media mutation services with server-side
      field-contract validation and conditional state checks.
- [ ] Add admin routes for manual drafts, field/media review, review actions,
      and owner-only publication.
- [ ] Build the reconciliation screen with evidence-aware fields, media review,
      manual-entry action, and clear transition/publish controls.
- [ ] Add unit, integration, UI, and authorization tests, including no partial
      live write on rejection/failure.
- [ ] Update API, app-flow, tasklist, and progress documentation; run full
      formatting, lint, typecheck, and test verification.
