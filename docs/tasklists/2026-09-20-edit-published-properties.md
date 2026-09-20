# Tasklist — edit any detail of a published property, through approval

**Status:** partly built 2026-09-20 (start an edit, see live values, fetch RERA into an edit, publish only what changed); the rest is still planned. The owner answered the open decision: an admin may approve and publish their own edit.
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion` (or the next agreed phase branch)
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md`; follows `2026-09-21-first-property-live.md`
**References:** `docs/app-flows/admin.md`, `docs/app-flows/developer.md`, `docs/api/api-spec.v1.md`, `docs/schema/schema.v6.md`, `docs/ocr-routing-contract.v2.md`, `DECISIONS.md` 2026-09-20 ("Every detail stays editable after publish")

## Owner requirement (2026-09-20)

Every detail we hold must be editable, including after a property is live. An edit goes through admin approval again; it never touches live data directly. This applies to admins now and to developers on their own properties once they join.

## What already exists (verified in code, 2026-09-20)

- `publishSubmission` already updates an existing property when the submission carries a `property_id`, writing only the fields the submission contains, and writes a `property_revisions` snapshot each time (`src/lib/submissions/publisher.ts`).
- The contract field `developer.name` exists (`src/db/seed.ts`) but **the publisher never applies it**, so a developer's name cannot be changed by any path today. `developer.profile_narrative` is applied.
- **Nothing creates a submission for an existing property.** `createManualSubmission` takes only a `developerId`, so every submission made through the UI is a new property. That is the real gap.
- Approval split (verifier reviews, owner publishes) already exists and stays.

## Scope

1. **Start an edit.** "Edit this property" on the admin property view creates a `manual_form` submission bound to that property and its developer. It starts with no fields, so anything not edited is left untouched (the publisher's existing patch behaviour).
2. **Seed on edit.** Opening a field for editing writes a candidate row seeded from the live value. Whole-set fields (amenities, unit types) are seeded as the complete current set, because the publisher replaces them as a set.
3. **See what changes.** The reconciliation screen shows the current live value beside each proposed value, with unchanged fields not listed as changes.
4. **Every published field is editable:** property basics, possession, counts, specifications, amenities, unit types and their areas and rooms, media (add, replace, remove), the legal-entity link, and the RERA number.
5. **Developer-level details** (name, narrative, website, logo) go the same way: implement `developer.name` in the publisher. Renaming a developer renames it for all of its properties, which is the intended meaning of a brand name; the legal name stays on the legal entity.
6. **Approval again.** Submitted edits use the normal status flow. The live page is unchanged until publish; publish refreshes the buyer cache as it does today.
7. **History.** Use the existing `property_revisions` snapshots to show "what changed and when" on the property view.
8. **Developers later.** The same submission path is used by developer users on their own properties when the portal is built; nothing here should assume the actor is an admin.

## Non-goals

- No direct edits to `properties` or any live catalog table, ever (AGENTS.md one write path).
- No second edit-draft table; the edit is a `property_submissions` row.
- No new buyer-facing screens.

## Decisions that could block work

- **Can the person who made an edit approve and publish it?** Recommended: yes for an owner (the team is small), with the revision recording who did each step. Confirm with the owner before building the approval step.
- Removing a unit type or amenity: confirm publisher semantics on removal against the existing tests before allowing it (it replaces the set today).

## Ordered checklist

### Discovery

- [ ] Read publisher removal and replace semantics for unit types, areas, amenities, specifications and media; list every field that can be edited and how each is seeded.
- [ ] Confirm the reconciliation editor can render a "live value" beside each candidate (no new data path; read from the property).

### Implementation

- [ ] `createEditSubmission(propertyId)`: bound to property and developer, `manual_form`, no fabricated fields; one open edit per property, or a clear message if one is open.
- [ ] `POST /api/v1/admin/properties/{id}/edits` and the "Edit this property" action.
- [ ] Seed-on-open for each field type; whole-set fields seeded as full sets.
- [ ] Live-value column and a changed-only summary in the reconciliation screen.
- [ ] Publisher applies `developer.name` (canonical developer only; duplicate-name guard).
- [ ] Property view: revision history.

### Tests

- [ ] Integration: an edit changes only the edited fields and leaves the rest byte-identical; the live page is unchanged before publish.
- [ ] Integration: editing one amenity, one unit-type room and the developer name each publish correctly.
- [ ] Route tests: 401, 403 for non-admin, 404, one open edit per property.
- [ ] A test that the edit path never writes a live table outside publish.
- [ ] Browser check (Chrome and Brave): edit → review → approve → publish → change visible on the buyer page.

### Documentation

- [ ] API spec, admin app-flow, `PROGRESS.md`, `DECISIONS.md`.

## Acceptance

An admin can change any published detail of Kimana Towers through screens, sees it approved and published, and the buyer page shows the change; the old value is in the revision history; nothing else changed.

## Completion record

_(fill in at completion)_

## Progress 2026-09-20

**Built and verified**

- [x] `createEditSubmission` and `POST /api/v1/admin/properties/{id}/edits`: an empty draft bound to the property, one open edit per property (a second attempt leads to the open one).
- [x] "Edit this property" on a published submission; an edit banner; each simple field shows its published value ("Currently published") and whole-set fields say "Unchanged. Keeps what is published."; a proposed value that differs shows the published one beside it.
- [x] Integration test that publishes an edit and checks only the edited fields changed and everything else is identical.
- [x] Real-browser check on Kimana (`scripts/verify-rera-fetch.mjs`): start edit, fetch RERA, use RERA's values, live property untouched.

**Gaps and bugs found on the way** (full text in `DECISIONS.md` 2026-09-20): nothing could start an edit of an existing property (now built); `developer.name` is in the contract but never applied on publish (still open); the buyer email check rejected any address with an "s" (fixed); duplicate room names broke the dossier's React keys (fixed); the migration-timestamp trap; a leaked test run (cleaned).

**Still to do**

- [ ] Seed and edit whole-set fields of a live property (amenities, specifications, unit types) and its pictures; decide removal semantics.
- [ ] Publisher applies `developer.name` (with a duplicate-name guard).
- [x] Revision history: the versions list on a property's submission screen now shows when each edit went live and what it changed (was → now for single values; "changed" for amenity, specification and unit-type sets). Read from `property_revisions`. (A standalone property page in the admin is still not built.)
- [ ] A property page in the admin (today an edit starts from the property's published submission).
- [ ] The edit path for developers, when the developer portal exists.
