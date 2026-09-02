# Tasklist — Phase 2A submission review and publish flow

**Status:** implementation in progress
**Owner:** Bhavarth
**Branch:** `task/phase-2a-ocr-foundation`
**Roadmap:** [Phase 2A](../roadmap.md#phase-2a--admin-ingestion--the-trust-boundary)

## Scope

Implement validated submission review transitions and the only transaction
allowed to create or update live property catalog records. Publication must
apply one approved payload and write its complete `property_revisions` snapshot
atomically, with no direct seed, migration, OCR adapter, or admin shortcut into
the live tables.

## References

- [Product requirements](../product/prd.v1.md)
- [API specification](../api/api-spec.v1.md)
- [Admin app flow](../app-flows/admin.md)
- [Architecture](../../ARCHITECTURE.md)
- [Canonical schema v4](../schema/schema.v4.md)
- [Approved OCR field contract](../data/v1-property-schema-fields.proposal.2026-09-01.md)
- [Contributor rules](../../AGENTS.md)

## Non-goals

- Do not select or call an OCR provider.
- Do not implement the RERA fetcher or buyer read APIs.
- Do not directly import legacy JSON or the 24-property source set.
- Do not write exact prices; the private commercial ingestion decision remains
  separate.
- Do not implement the visual admin portal in this task.

## Discovery and decision gates

- [x] Define permitted submission status transitions and actor permissions.
      Resolved 2026-09-01 in `DECISIONS.md` ("Submission review permissions and
      slug generation are fixed for Phase 2A").
- [x] Resolve new-property developer identity rather than creating developers
      from OCR spelling automatically. Resolved via schema v4
      (`property_submissions.developer_id`) and the 2026-09-01 "Builder
      profiles exist independently..." decision.
- [x] Define full-versus-partial payload merge semantics for updates. Resolved
      2026-09-01 in `DECISIONS.md` ("Published-property updates are additive
      patches...").
- [x] Define variant identity/update/removal semantics around the known
      `variant_name` risk. Resolved by the same additive-patch decision: upsert
      only by exact reviewed `variant_name`, never fuzzy-matched, renamed, or
      deleted.
- [x] Define generated slug collision behavior for new properties. Resolved
      2026-09-01: deterministic short suffix derived from the submission id.
- [x] Record expensive-to-reverse publish decisions in `DECISIONS.md` before
      implementation. All five gates above already have dated entries.

## Implementation checklist

- [x] Implement schema v4's nullable `property_submissions.developer_id` FK
      and generate/apply migration `0004`.
- [x] Validate canonical submission payloads against active field contracts
      (`src/lib/submissions/validation.ts`). Typecheck/lint/format clean.
- [x] Implement review transitions with timestamp/reviewer invariants
      (`src/lib/submissions/transitions.ts`, pure state machine). Covered by
      10 unit tests in `src/lib/submissions/submissions.test.ts`.
- [x] Implement the authorized publish transaction
      (`src/lib/submissions/publisher.ts`, `publishSubmission`). Covered by
      6 integration tests against a real database in
      `src/lib/submissions/publisher.integration.test.ts`.
- [x] Resolve lookup keys and controlled catalog values without free-text
      fallback rows (`loadCatalogLookups` in `publisher.ts`).
- [x] Apply property, unit-area, amenity, and specification mutations only
      inside publication. (`property_media` has no ingestion-contract field in
      the current OCR/manual field set — out of scope here, not silently
      added.)
- [x] Write the resulting full property snapshot to `property_revisions` in the
      same transaction.
- [x] Make duplicate publish attempts safe and reject stale/invalid states
      (transition guard on submission status + `WHERE status = 'approved'`
      guard on the final submission update).

## Verification

- [x] Publish a new-property test fixture only through an approved submission.
      (`publisher.integration.test.ts`, "publishes a new property...")
- [x] Verify update and rollback behavior with no partial live writes.
      (`publisher.integration.test.ts`, "blocks publication when a field is
      still needs_review..." asserts zero property rows exist after the
      throw; "applies an existing-property update as an additive patch..."
      verifies untouched amenities/fields survive an update publish.)
- [x] Verify invalid state transitions and unreviewed fields block
      publication. ("rejects publishing from a status other than approved",
      "rejects a duplicate publish attempt...", plus the needs_review test
      above.)
- [x] Verify a revision exists for every successful publication. (Asserted in
      the new-property and additive-patch tests; the latter confirms exactly
      2 revisions after 2 publishes to the same property.)
- [x] Use the published fixture for the deferred private bucket mapping
      proof. ("maps a published unit variant's current price into the
      correct private budget bucket" — inserts into
      `private.unit_price_history` via the service-role client and queries
      the `private.unit_current_bucket` view.)
- [x] `bun run format:check` — passes.
- [x] `bun run lint` — passes.
- [x] `bun run typecheck` — passes.
- [x] `bun run test` — 39 passed (39), 4 test files.
- [x] `git diff --check` — no whitespace errors (only pre-existing
      LF/CRLF-on-checkout warnings unrelated to this change).

## Documentation and handoff

- [x] Update API and admin-flow details after transition/publish contracts
      lock. Reviewed `docs/api/api-spec.v1.md` and `docs/app-flows/admin.md`
      against the implemented behavior: both already correctly describe the
      additive-patch semantics, single publish path, owner-only publish, and
      revision snapshot; the HTTP endpoint itself remains "Planned (Phase
      2A)" since wiring `publishSubmission`/`applySubmissionTransition` to an
      actual route is out of this task's scope (library/transaction layer
      only) — carried forward as the next task's starting point.
- [x] Update `PROGRESS.md` and this tasklist with exact verification results.

## Completion record

Implementation and verification complete as of 2026-09-01. Transitions,
validation, and the publish transaction are implemented, typechecked,
linted, formatted, and covered by 24 unit tests plus 6 database-integration
tests (including the deferred Phase 1 private budget bucket mapping proof).
No code path outside `publishSubmission` writes to the live catalog tables.
Remaining work (HTTP route wiring, admin review UI, OCR provider adapter) is
out of this task's scope and belongs to follow-on tasklists.
