# Phase 2B integration with main

## Scope

- **Owner:** Deep
- **Status:** Complete
- Merge `origin/main` at `9b2726d` into `task/phase-2b` without pushing or opening a pull request.
- Preserve main's decision and progress history while clearly attributing Phase 2B decisions to Deep.
- Reconcile dependency and Drizzle migration metadata through schema v5 migration `0005`.
- Apply migration `0005` to the native PostgreSQL 18 development database and verify the complete integrated application.
- Correct the missing `propcompare_app` privileges on the OCR tables introduced by migration `0003`, discovered by the merged integration suite.

## References

- Product: [`../product/prd.v1.md`](../product/prd.v1.md)
- Buyer API: [`../api/api-spec.v1.md`](../api/api-spec.v1.md)
- Buyer flow: [`../app-flows/buyer.md`](../app-flows/buyer.md)
- Design: [`../design/design.v1.md`](../design/design.v1.md)
- Canonical schema v5: [`../schema/schema.v5.md`](../schema/schema.v5.md)
- Phase plan: [`2026-09-02-phase-2b-implementation-plan.md`](2026-09-02-phase-2b-implementation-plan.md)
- Local database: [`../local-database-setup.md`](../local-database-setup.md)

## Non-goals and constraints

- Do not push the branch, create a pull request, or merge into `main` without explicit user confirmation.
- Do not alter live catalog data except through the existing publish transaction.
- Do not redesign schema v5 or change migration `0005`; this task only reconciles its migration metadata and verifies compatibility.
- Do not broaden `propcompare_service` access; the privilege correction is limited to the documented application-role CRUD rights on the two OCR tables.
- A manual browser check of the intake range slider remains a human verification item.

## Checklist

- [x] Compare `origin/main` and `task/phase-2b` from their merge base.
- [x] Identify textual and semantic integration conflicts.
- [x] Merge `origin/main` into `task/phase-2b` locally.
- [x] Organize `DECISIONS.md` into Bhavarth and Deep sections without losing entries.
- [x] Keep main's `PROGRESS.md` history and add Phase 2B progress.
- [x] Resolve the combined dependency manifest and regenerate `bun.lock`.
- [x] Remove the tracked TypeScript build cache and preserve its ignore rule.
- [x] Extend Drizzle journal/snapshot metadata through migration `0005`.
- [x] Add a forward-only migration restoring `propcompare_app` CRUD rights on the OCR tables created by `0003`.
- [x] Apply migrations to the native PostgreSQL 18 database on port 5432.
- [x] Run formatting, lint, typecheck, build, tests, migration-generation, and diff checks.
- [x] Update `PROGRESS.md` and this completion record.
- [x] Commit the completed integration locally; do not push.

## Acceptance criteria

- All main and Phase 2B decisions remain present and are attributed to the requested owner section.
- Main progress is intact and all Phase 2B progress entries remain present.
- The combined dependency lock is reproducible from the merged `package.json`.
- `tsconfig.tsbuildinfo` is untracked and ignored.
- Drizzle metadata represents migrations `0000` through `0005`, and `db:generate` reports no schema changes.
- Migration `0005` applies successfully to the Phase 2B local database and the full verification suite passes afterward.
- No remote branch or pull request is created.

## Verification commands

- `bun install`
- `bun run db:migrate`
- `bun run db:generate`
- `bun run format:check`
- `bun run lint`
- `bun run typecheck`
- `bun run build`
- `bun run test`
- `git diff --check`

## Completion record

Completed on 2026-09-07. `origin/main` at `9b2726d` was merged locally without a push or pull request. Documentation ownership is explicit, the combined lockfile is reproducible, TypeScript's generated cache is untracked, and Drizzle's journal/snapshots cover the canonical schema-v5 migration plus the narrow OCR-table privilege correction. Migrations and the canonical public seed ran successfully against native PostgreSQL 18 on port 5432; the five Phase 2B properties remain present. The integrated verification result is 412 passing tests across 28 files, with formatting, lint, typecheck, production build, migration generation/application, frozen lockfile, and diff checks passing. The manual intake-slider interaction check remains a human pre-merge follow-up.
