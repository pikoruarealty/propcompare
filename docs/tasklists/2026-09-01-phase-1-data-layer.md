# Tasklist — Phase 1 data layer

**Status:** not started  
**Owner:** Bhavarth (schema/migrations/private access); Deep (lookup catalog content once shapes land)  
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

- [ ] Docker Desktop engine is running and `docker compose up -d` produces healthy local Postgres.
- [ ] Local environment is configured from `.env.example` with a safe development `BETTER_AUTH_SECRET`.
- [ ] Confirm task branch/review process before migration work begins.

## Implementation checklist

- [ ] Re-read canonical schema; identify native enums, lookup/public/private tables, FKs, uniqueness, timestamps, and indexes. Record ambiguity before coding.
- [ ] Define Drizzle schemas without creating a second entity representation or adding unapproved structural fields.
- [ ] Preserve generated Better Auth ownership; connect references without redesigning auth tables.
- [ ] Implement `private.unit_price_history` with numeric money fields and deny-by-default RLS.
- [ ] Implement `private.unit_current_bucket` with canonical current-price/bucket join semantics.
- [ ] Generate the first Drizzle migration and review SQL for public/private placement, FK order, RLS, and no prohibited catalog-data writes.
- [ ] Apply migration to local database.
- [ ] Add a seed mechanism for lookup/contract data only: property/BHK/layout types, amenity/specification catalogs and synonyms, budget buckets, active property-schema fields.
- [ ] Have Deep populate agreed lookup values against fixed shapes; do not add parallel tables/fields for convenience.
- [ ] Run the required private-bucket proof using a controlled development fixture, with no price exposed to an application-facing response.

## Verification

- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] Migration applies cleanly to an empty local database.
- [ ] Lookup seed is idempotent or has a documented safe reset procedure.
- [ ] A manual development insert into `private.unit_price_history` yields the expected `private.unit_current_bucket` result.
- [ ] Confirm buyer-facing query paths cannot select exact prices.

## Documentation and handoff

- [ ] Update API status only for endpoints actually added.
- [ ] Update `PROGRESS.md` with outcome and verification.
- [ ] Add a dated `DECISIONS.md` entry for structural/access-control decisions made during work.
- [ ] Create the next bounded implementation tasklist before starting that implementation.

## Completion record

_Complete this section when acceptance criteria pass. Do not replace original scope; create follow-up tasklists for deferred work._
