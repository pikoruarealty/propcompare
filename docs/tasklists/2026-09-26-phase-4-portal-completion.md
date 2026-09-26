# Phase 4 portal completion and merge review

**Scope:** Parts 5 and 6 on `task/phase-4-portal-completion`, from the reconciled Phase 4 branch at `947388d`. Owner authorised both parts and approved review gates 2, 4 and 5 on 2026-09-26. This tasklist supplements [the Phase 4 plan](2026-09-25-phase-4-developer-analytics.md).

**References:** [developer flow](../app-flows/developer.md), [API spec](../api/api-spec.v1.md), [schema v21](../schema/schema.v21.md), [schema v23](../schema/schema.v23.md), [schema v24](../schema/schema.v24.md), [printed dossier rules](../design/no-vibecoded-tells.v1.md), [design tokens](../design/design-tokens.md), [privacy inputs](../product/privacy-policy-inputs.md), [production readiness](../production-readiness.md). The Next.js 16 page, loading, error and authentication guides in `node_modules/next/dist/docs/01-app/` were read before implementation.

## Part 5 — developer portal

- [x] Record the owner's confirmed cohort and rival limits in `DECISIONS.md` and the Phase 4 plan.
- [x] Add property-scoped intake BHK and city demand from identified visitors who later viewed or compared the property: schema v24, migration `0030`, `release-v3`, API/CSV and portal, with the existing gate and no-subtraction rule. No new capture event.
- [x] Build a separate developer shell and overview at `/developers`; keep forwarded enquiries in that shell.
- [x] Add a property detail route with the five fixed windows, its own released figures, splits, named rivals, peer benchmarks, completeness and CSV actions.
- [x] Show empty, tracking just started, withheld, stale, revoked and error states. Every page rechecks `requirePortalRole`; a revoked session returns to developer login. Reads use the released reader connection.
- [x] Render a CSS activity bar only for released funnel values beside the same figures in a table. Respect the printed dossier rules and no price, score or winner copy.
- [x] Test the rendered states and markup; run the database-backed raw-event-to-HTML check with two developers and above/below-gate visitors.
- [x] Update developer flow, API spec, privacy inputs, schema, `PROGRESS.md` and the parent Phase 4 tasklist.

## Part 6 — verification and PR

- [x] Record the app host scheduler decision, daily purge then release order, and the owner's instruction to leave both schedulers off until hosting in production readiness.
- [x] Run format, lint, typecheck, unit/UI and full integration suites, fresh and existing-at-0029 migrations, and production build; record local build conditions honestly.
- [x] Review rendered HTML, API and CSV for price, private bucket, visitor/session IDs and personal detail.
- [x] Check the branch against the current `origin/main` for overlap and document consistency. `origin/main` at `138295c` is already an ancestor of this branch; the Phase 4 schema and privacy documentation now include the new intake demand dimensions.
- [x] Commit the steps, push the new branch, and open [PR #2](https://github.com/pikoruarealty/propcompare/pull/2) to `main` with verification and remaining limitations. The PR was merged into `main` as `e3f0d9a` on 2026-09-26.

## Verification record

| Date       | Check                                                                                                                                                | Result                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-26 | New branch from `947388d`; owner approved Parts 5–6, gates 2/4/5, cohort of 5 from 3 other developers, cap of 5 rivals, and app host scheduler       | Ready to implement; production host provisioning and local database availability remain separate verification items.                                                                           |
| 2026-09-26 | Migration `0030` on PG17 already at `0029`; fresh PG17 database through `0030`, both seeds; focused release/reader integration on each               | 31 migrations recorded in each database; new check constraint present; 45 integration tests passed on each. Fresh service-role connection sees 16 private buckets. Shared port 5432 untouched. |
| 2026-09-26 | Full `bun run test` against the upgraded throwaway PG17                                                                                              | 189 files, 2193 tests passed. After a final HTML/CSV assertion, the focused database file and UI component file passed 48 tests.                                                               |
| 2026-09-26 | Production `bun run build` with required throwaway DB URLs and a temporary `turbopack.root` spanning this worktree's sibling `node_modules` junction | Built successfully; all developer routes are dynamic. Temporary root setting was removed after the check. Turbopack still emits pre-existing PDF ESM and dynamic filesystem-tracing warnings.  |
| 2026-09-26 | Final format check, lint, typecheck and `origin/main` ancestry                                                                                       | All passed. `origin/main` at `138295c` is the merge base, so Bhavarth's merged work is in this branch.                                                                                         |
