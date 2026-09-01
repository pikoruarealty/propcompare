# Tasklist — Phase 1 data layer

**Status:** database foundation complete; controlled lookup data pending follow-up task
**Owner:** Bhavarth (schema/migrations/private access); Deep (lookup catalog content once shapes land)
**Branch:** `task/phase-1-data-layer`
**Roadmap:** [Phase 1](../roadmap.md#phase-1--data-layer)

## Scope

Translate the canonical schema into Drizzle, generate and apply the first migration, establish the `private` schema tables/RLS/view, and seed lookup data. This tasklist does not authorize direct writes to live catalog records; the submission-publish boundary still applies.

## References

- [Schema v1](../schema/schema.v1.md)
- [Architecture](../../ARCHITECTURE.md)
- [API specification](../api/api-spec.v1.md)
- [PRD](../product/prd.v1.md)
- [Contributor rules](../../AGENTS.md)

## Blockers and prerequisites

- [x] Docker Desktop engine is running and `docker compose up -d` produces healthy local Postgres.
- [x] Local environment uses restricted app, admin migration, and reserved service database URLs; the existing Better Auth development secret remains local-only.
- [x] Work is on the dedicated `task/phase-1-data-layer` branch.

## Implementation checklist

- [x] Re-read canonical schema; identify native enums, lookup/public/private tables, FKs, uniqueness, timestamps, and indexes.
- [x] Define Drizzle schemas without a second entity representation or unapproved structural fields.
- [x] Preserve generated Better Auth ownership; extensions reference its text user IDs without redesigning auth tables.
- [x] Implement `private.unit_price_history` with numeric money fields, forced zero-policy RLS, and a one-current-price-per-variant index.
- [x] Implement security-invoker `private.unit_current_bucket` with canonical current-price/bucket join semantics.
- [x] Generate/review the first Drizzle migration for public/private placement, FK order, RLS, and no catalog-data writes.
- [x] Apply migrations cleanly to local Postgres.
- [x] Add idempotent seed plumbing and the explicitly approved property/BHK/layout values.
- [x] Deep populated approved amenity/specification vocabulary, private fixed budget bands, and OCR field definitions in the completed [lookup catalog data tasklist](2026-09-01-lookup-catalog-data.md).
- [x] Prove effective app/service role separation, forced RLS, zero private policies, and service-view access. Data-bearing mapping waits for a Phase 2 published fixture; see `DECISIONS.md` (2026-09-01).

## Verification

- [x] `bun run format:check`
- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test` (1 file, 2 schema-contract tests)
- [x] Migrations apply cleanly to a fresh local database.
- [x] Lookup seed runs twice with stable core lookup counts.
- [x] Direct catalog fixture is intentionally deferred: it would violate the one-write-path rule. Phase 2 will prove mapping through publication.
- [x] Confirm the normal app role is denied `private` schema usage and the bucket view; exact prices cannot be selected through the current app connection.

## Documentation and handoff

- [x] API status unchanged: no product endpoints were added.
- [x] Update `PROGRESS.md` with outcome and verification.
- [x] Add dated decisions for the role model and fixture-verification constraint.
- [x] Create the separate [lookup catalog data tasklist](2026-09-01-lookup-catalog-data.md) before that implementation starts.

## Completion record

The database foundation was completed locally on 2026-09-01. Remaining catalog content is deliberately split into the linked data tasklist so it can be sourced and reviewed without schema drift.
