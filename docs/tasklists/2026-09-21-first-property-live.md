# Tasklist — first property: brochure to live, legal entities, and a hardened extraction

**Status:** complete — 2026-09-21
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`; follows `2026-09-21-extraction-worker.md`
**References:** `docs/product/prd.v1.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md`, `docs/schema/schema.v6.md` (section 3), `docs/ocr-routing-contract.v2.md`, `docs/design/design-tokens.md`, `DECISIONS.md` 2026-09-21 (three entries)

_Written after the work, at the owner's direction to keep moving. The standing rule is a tasklist before implementation; this is the record, and the next slice starts with its tasklist._

## Scope

Take one real brochure (The Kimana Towers) through the whole product with no shortcuts and see it live on the buyer site; finish the pieces that path needed (publish, buyer images, review ergonomics, the legal-entity link); prove the remaining "not verified" items; and clear test data from the queue.

## Checklist

### Verification the previous slice left open

- [x] Real Brevo send: accepted by Brevo and confirmed received by the owner.
- [x] Server killed mid-run for real: the attempt shows as interrupted after the lease and "Try again" completes it (`scripts/verify-worker-recovery.mjs`, 5/5).
- [x] Real Claude run on Kimana Towers through the UI. It exposed a fatal strictness problem; fixed (below) and re-run.

### Hardening the extraction (after the first live failure)

- [x] Raw answer saved before validation; no commercial data ever written (test).
- [x] Retry reuses saved answers; asks again only for scopes without a usable one (tests).
- [x] Messy output mapped rather than rejected: bad field, duplicate/out-of-scope field, each optional unit detail, several foyers, null lists, unmeasured rooms (tests).
- [x] Spend recorded when the final whole-extraction check fails.
- [x] Free re-read of saved answers for an untouched draft (`src/db/reread-saved-answers.ts`).
- [x] Free rehearsal: replay stub with real saved answers plus a messy floor-plan answer; `dryRun` publish that rolls back (`src/db/publish-dry-run.ts`).

### Publish and the buyer site

- [x] "Confirm all remaining values" for a submission in review (route, dialog, tests).
- [x] Published property visible on browse and dossier without a restart (`revalidatePath` on publish).
- [x] Card and dossier show pictures through `/api/v1/media/{id}`, with credits; no storage path in the page (tests updated).
- [x] Verified live in a browser: `scripts/verify-property-live.mjs`, 7/7.

### Legal entities (owner answers 2026-09-21)

- [x] Schema v6 section 3 and migration `0010`; contract field `property.legal_entity_id`; OCR never asked for it.
- [x] Library, admin routes, developer-page panel, reconciliation picker, publish link with same-developer check (integration, route and component tests).

### Queue cleanup

- [x] `src/db/cleanup-test-data.ts` (dry run by default). Applied: 19 test submissions and 26 test developer profiles removed; the published Kimana submission, its developer, entity and property kept.

### Documentation

- [x] `schema.v6.md`, `DECISIONS.md`, API spec, `production-readiness.md`, `.env.example`, `PROGRESS.md`.

## Not done, deliberately (next slices, each needs its own tasklist)

- Buyer retention screens: saved properties, saved comparisons, and their save/compare controls.
- Enquiry submission from the dossier, and the admin enquiry inbox.
- "Claim this listing", "report a problem / request removal", and a "last checked" date on each property.
- The pre-login intake cookie claim.
- GujRERA fetch job (needs the owner's scoping; see the conversation of 2026-09-21).
- Setting BHK type / layout on Kimana's unit types (the brochure did not state them, and they were not guessed).
