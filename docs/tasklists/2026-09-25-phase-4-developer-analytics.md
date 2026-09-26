# Tasklist: Phase 4 developer analytics, built on schema v20

- **Created:** 2026-09-25 — Deep
- **Owner:** Deep. This tasklist lists Deep's work only. Bhavarth's reviews are external gates, not checklist items.
- **Status:** Part 2 in progress. Schema v21 tables, reader role and migration `0025` built and tested 2026-09-26 (Deep approved the migration). The release job waits on choices 5 and 6; Bhavarth's gate 2 review is still to be recorded.
- **Branch:** `task/phase-4-developer-analytics`, reset onto `origin/main` at `461060d` in Part 1
- **Base:** `origin/main` `461060d` (merge of `task/phase-3-completion`)
- **Working agreement:** Deep approves every numbered part before it begins. Finishing one part never authorises the next. Every documentation change carries `2026-09-25 — Deep` (or its actual date plus Deep), and this tasklist and `PROGRESS.md` are updated in the same part.
- **Replaces:** `2026-09-24-phase-4-developer-analytics.md` and its schema v11 analytics design. That work collided with Bhavarth's merged analytics (schema v11 number, migration `0014`, `src/db/schema/analytics.ts`) and is dropped, with no backup branch or tag, by Deep's decision.

## Source of truth

Bhavarth's merged Phase 3 completion work is primary. Phase 4 builds on it and does not rebuild or replace it.

- Capture is **done** (schema v20, migration `0024`): `public.analytics_events`, `analytics_event_monthly`, `analytics_pair_monthly`; `POST /api/v1/events`; cookies `pc_vid` (random visitor id, ~13 months) and `pc_sid` (30-minute visit); `ANALYTICS_EVENTS` and `BUDGET_BANDS` in `src/lib/analytics/events.ts`; the recorder, the retention roll-up and the live `/admin/analytics` screen.
- Rules already decided on `main` (`DECISIONS.md` 2026-09-25, "First-party analytics built"): no consent prompt, only a privacy notice; Global Privacy Control and Do Not Track stop recording; raw events are kept 13 months, then only monthly counts; the choice signal is an enquiry sent while comparing; budget is a public band, never a figure; nothing becomes a score or reaches a buyer.
- `DECISIONS.md` 2026-09-25 item 7: **"a developer view is Phase 4 and will be aggregates only."** That sentence is this phase's mandate.
- Today `src/lib/analytics/analytics-isolation.test.ts` allows analytics reads only from the admin console, the recorder and the retention job, and its comment rules out any developer surface. Phase 4 changes that rule, and only with Bhavarth's agreement (gate 1).

## References

- Decisions: [`../../DECISIONS.md`](../../DECISIONS.md) — 2026-09-19 (developer analytics is the revenue product), 2026-09-23 (a preference index is developer-facing only, never a score; paid presence never affects ordering), 2026-09-25 (analytics built; enquiry forwarding; signed-out lock)
- Schema: [`../schema/schema.v20.md`](../schema/schema.v20.md) (analytics), [`../schema/schema.v19.md`](../schema/schema.v19.md) (enquiry forwarding)
- Capture design and build: [`2026-09-23-analytics-event-taxonomy.md`](2026-09-23-analytics-event-taxonomy.md), [`2026-09-25-comparison-analytics-slice-4.md`](2026-09-25-comparison-analytics-slice-4.md)
- Roadmap: [`../roadmap.md`](../roadmap.md) Phase 4
- API: [`../api/api-spec.v1.md`](../api/api-spec.v1.md) (`GET /api/v1/developer/portfolio`, planned)
- Developer flow: [`../app-flows/developer.md`](../app-flows/developer.md)
- Comparison: [`../design/comparison.v1.md`](../design/comparison.v1.md) (slice 4, principle 7: no score, no winner)
- Design rules: [`../design/no-vibecoded-tells.v1.md`](../design/no-vibecoded-tells.v1.md), [`../design/design-tokens.md`](../design/design-tokens.md)
- Production gates: [`../production-readiness.md`](../production-readiness.md)

## Scope

A developer signs in and sees aggregated, privacy-thresholded analytics for their own listed properties only. The figures come from the v20 events that already exist, plus deterministic listing completeness.

## Non-goals

- Rebuilding or duplicating capture, cookies, the events route, retention or the admin screen.
- A second event table, a second analytics schema, hashed identifiers, an opt-out control, or slider-step budgets. All are superseded by v20.
- Any buyer-facing use of analytics, any score, rank or "winner", or the Buyer Interest Score.
- A developer's view of forwarded enquiries or buyer contact details. Schema v19 leaves that as an owner privacy decision.
- Billing, entitlements, alerts, scheduled email, saved cohorts, developer submission/edit screens.
- Any write to the live catalog. The publish transaction stays the only writer.
- Backfilled or fabricated history. Every report states when tracking started.

## Unresolved choices: decide before the part that needs them, never guessed

1. **Developer read access (gate 1, Bhavarth).** How the isolation rule changes: which new modules may read analytics, and that they return only thresholded aggregates. Blocks Part 2.
2. **Privacy threshold.** Minimum distinct **visitors** (v20's `visitor_id`) or distinct **visits** (`session_id`) per released cell, and the number (the earlier plan said 5). Suppressed cells show as "not enough data", never as zero. Blocks Part 2. **Resolved 2026-09-26 — Deep:** the gate is 5 distinct visitors. Visitors are the primary metric (portfolio and per property); visits are secondary (return and intent) under the same visitor gate; enquiry figures are portfolio level only (option c). See `DECISIONS.md` 2026-09-26 (threshold) and `docs/schema/schema.v21.md`.
3. **Where suppression happens.** Choose one: (a) a developer query service reads v20 raw rows and applies the threshold in code; or (b) a scheduled job writes a release-safe aggregate table (schema v21, migration `0025`) that is the only thing developer code may read. (b) enforces the rule in the database and needs gate 2. **Resolved 2026-09-26 — Deep: (b), the release-safe table.** Gate 2 now applies to Part 2.
4. **Competitor pairings.** May developer A see that their property is often compared with a named property from developer B? Options: named, anonymised ("a 3 BHK in the same locality"), or counts only. This is the most commercially sensitive figure; owner decision. Blocks the comparison view in Parts 4–5.
5. **Enquiry metric.** Should a developer's "enquiries" count every `enquiry_submitted` event, or only enquiries the admin forwarded (schema v19)? Blocks the release job (Part 2), since `enquirers` is computed there.
6. **Property eligibility.** Include only listed properties, or listed plus unlisted with soft-deleted excluded? The recorder already keeps only listed properties at capture time. Blocks the release job (Part 2), which decides which properties get figures.
7. **New capture events.** Card impressions (seen in a list, not opened) do not exist in v20. Adding them extends Bhavarth's vocabulary and the privacy-policy list. Decide whether Phase 4 needs them. Blocks Part 3; if the answer is no, skip Part 3.
8. **Peer benchmarks.** Keep "your property compared with similar properties" (locality → city cohorts) in Phase 4, or defer? Blocks Part 4.
9. **Completeness definition.** Reuse the data-quality KPI definition adopted 2026-09-23 (`property_schema_fields`, `not_stated`), or define a developer-facing ruleset? Blocks Part 4.
10. **Scheduling host** for any aggregation job, which can share the daily `analytics:purge` schedule already listed in production-readiness. Blocks Part 6 sign-off.
11. **Added 2026-09-26 — Deep. How developer code is kept to the release table.** Every analytics reader today runs as `propcompare_app`, which can read raw v20 events. (a) Static only: the isolation test limits developer modules to the v21 schema file. (b) A new read-only `propcompare_developer_reader` role and connection with `SELECT` on the two v21 tables only, so a slip fails in the database. (b) adds a credential, role provisioning, CI and production setup. Blocks the migration in Part 2; needs gate 2. **Resolved 2026-09-26 — Deep: (b), the reader role.** Built in migration `0025`.
12. **Added 2026-09-26 — Deep. Market-wide figures for developers.** Deep described visitors as the main metric "for the app and also for the particular project". Should a developer see platform-wide totals (all PropCompare unique visitors, and intake demand by BHK/city/band across all buyers), or only figures about their own properties? Platform totals reveal PropCompare's own traffic to every developer. Not in `release-v1` until decided; an additive change later. **Resolved 2026-09-26 — Deep: own properties only; platform-wide figures are admin only.**
13. **Added 2026-09-26 — Deep. "Year to date" and "quarter to date".** Calendar year (January) or Indian financial year (April)? Blocks the job's window definitions in Part 2. **Resolved 2026-09-26 — Deep: calendar year.** Building the windows also showed the longest must be trailing 12 months, not 13, to stay inside v20's raw retention (`DECISIONS.md` 2026-09-26); Deep to confirm.

## External review gates (Bhavarth; not Deep's items)

Deep requests each gate and records the outcome in the verification table.

1. **Analytics read access:** before the isolation test or rule changes (Part 2).
2. **Schema/grants:** before any v21 migration or grant SQL is created or applied (Part 2, only if choice 3b). _2026-09-26 — Deep approved migration `0025`; it is built and tested on this branch only. Bhavarth's review is still to be recorded before merge or any apply outside the throwaway test database._
3. **Vocabulary:** before `ANALYTICS_EVENTS` or the events route changes (Part 3).
4. **Auth/ownership:** before developer-scoped routes or `requirePortalRole("developer", …)` handling change (Part 4).
5. **Merge:** before the branch merges to `main` (Part 6).

## Ordered implementation

### Part 1 — Reset the branch and reconcile the documentation

**Precondition:** Deep approves Part 1.

- [x] Reset `task/phase-4-developer-analytics` to `origin/main` (`461060d`), discarding commits `6bd771b` and `02ad081` and the uncommitted rework, with no backup (Deep, 2026-09-25). The branch was never pushed.
- [x] Carry this tasklist onto the reset branch. Do not carry `2026-09-24-phase-4-developer-analytics.md`, schema v11 analytics, the data map or the analytics design doc.
- [x] Run the baseline on the reset branch: format, lint, typecheck, full test suite on a fresh migrated and seeded database. Record any failure, including whether `developer-profile.integration.test.ts` still assumes a listed property already exists.
- [x] Replace the roadmap's "narrowed 2026-09-18" Phase 4 entry with this scope and ownership.
- [x] Add a dated Deep entry to `DECISIONS.md`: Phase 4 is the developer-facing aggregate layer over v20; the earlier Phase 4 design is withdrawn; list the choices above as open.
- [x] Update `docs/app-flows/developer.md`, the API spec's planned developer routes and `PROGRESS.md`. (`docs/tasklists/README.md` has no index, so it needed no change.)
- [x] Report Part 1 to Deep and stop.

**Acceptance:** the branch equals `main` plus documentation only; every document describes one analytics system (v20) and one Phase 4 plan.

### Part 2 — Developer-safe aggregates and the read boundary

**Precondition:** Deep approves Part 2; choices 1–3 resolved; gate 1 passed (and gate 2 if 3b).

> **Part 2 authorisation — 2026-09-26, Deep:** Deep approved Part 2 and chose the release-safe table (choice 3b). The threshold (choice 2) needs a fuller explanation before Deep decides. Until choice 2 is decided and gates 1 and 2 pass, only work that does not depend on them proceeds: the carried-over test fix.

- [x] Carried over from Part 1: make `developer-profile.integration.test.ts` create its own listed property through `publishSubmission` instead of assuming one exists (it fails on a freshly seeded `main`).
- [x] Write the schema v21 proposal (`docs/schema/schema.v21.md`).
- [x] Release rules as a pure module with tests (`src/lib/analytics/release-rules.ts`): India-time days, the five windows (calendar quarter/year, trailing 12 months), the 5-visitor gate, withheld never zero, the no-subtraction rule, and a check of every hour of two years against v20's retention cutoff.
- [x] Migration `0025_developer_analytics_release` from `src/db/schema/developer-analytics.ts`: the run and release tables with every rule as a check constraint, explicit grants, and the `propcompare_developer_reader` role (local/CI provisioning, `.env.example`, CI env, `src/db/developer-reader.ts` with URL guards).
- [x] Database tests (`src/db/developer-analytics.integration.test.ts`): the reader reads v21 only and is refused raw analytics, catalog, account and `private` tables and all writes; its exact grants and attributes; every check constraint; one running job.
- [x] Fixed three integration tests on `main` that borrowed "any listed property" and failed by timing (`developer-profile`, Bhavarth's `analytics`, `enquiry-inbox`), with a shared `publishTestPortfolio` helper (`src/lib/submissions/test-support.ts`).
- [ ] Request gate 2 (the v21 tables, grants and role as built) from Bhavarth and record the outcome.
- [ ] After choices 5 and 6: the release job (`src/lib/analytics/release.ts`, `src/db/analytics-release.ts`, `analytics:release`) computing `release-v1` from raw v20 rows, run records, pruning to the last 7 successful runs, and a failed run that leaves the previous one visible.
- [ ] Job tests against the database: gate at 4 and 5 visitors, one visitor with many visits, the no-subtraction rule, enquiries only at portfolio level, a property changing developer, eligibility, India-time edges, failure and rerun.
- [ ] Update schema, decisions, production-readiness, progress and this tasklist.
- [ ] Report Part 2 and stop.

**Acceptance:** no code path gives a developer module an unthresholded value or a visitor/session id.

### Part 3 — Capture gaps (only if choice 7 adds events)

**Precondition:** Deep approves Part 3; choice 7 resolved; gate 3 passed.

- [ ] Add only the approved events to `ANALYTICS_EVENTS`, `readEventInput` and their emit points, following the existing `track`/`use-tracking` pattern.
- [ ] Update schema v20's event list (or its successor), the API spec and the privacy-policy item in production-readiness.
- [ ] Tests alongside `events.test.ts`, `track.test.tsx` and the route integration test.
- [ ] Report Part 3 and stop.

### Part 4 — Developer query services and APIs

**Precondition:** Deep approves Part 4; choices 4, 5, 6, 8, 9 resolved; gate 4 passed.

- [ ] Read the installed Next.js 16 route, auth and caching docs before code changes.
- [ ] Moved from Part 2 (2026-09-26 — Deep): request gate 1, then change `analytics-isolation.test.ts` so developer analytics modules may import only `@/db/developer-reader` and `@/db/schema/developer-analytics`, never v20 raw data. Buyer code must still only send events.
- [ ] Typed services that take `developerId` only from `requirePortalRole("developer", …)`, never from input: portfolio overview (views, comparisons, saves, unlocks, enquiries, engaged time, funnel), per-property detail, comparison view (per choice 4), demand by BHK/city/budget band, completeness, benchmarks (per choice 8).
- [ ] `GET /api/v1/developer/portfolio` and the per-property/export routes, `no-store`, standard errors, fixed windows, report metadata (tracking start, generated at).
- [ ] CSV export with formula-injection protection, the same threshold and bounded size.
- [ ] Tests: two-developer isolation, revoked session, malformed ids, windows, threshold, export, no price or private data.
- [ ] Update the API spec, developer flow, decisions, progress and this tasklist.
- [ ] Report Part 4 and stop.

**Acceptance:** two developers cannot see each other's properties, figures or CSV rows.

### Part 5 — Developer analytics portal

**Precondition:** Deep approves Part 5.

- [ ] Replace the holding page at `src/app/developers/(portal)` with a developer shell (not the admin shell). Server Components call the Part 4 services directly.
- [ ] Overview, property table and detail, comparison, demand, completeness, benchmarks, CSV actions.
- [ ] Empty, tracking-just-started, suppressed, stale, revoked and error states.
- [ ] Accessible SVG/CSS charts with table equivalents; no chart or tracker SDK; printed-dossier rules; Soft Gold only on verified badges; no winner or score wording.
- [ ] Component, accessibility and responsive tests; an end-to-end run with two developers and enough visitors to cross the threshold.
- [ ] Update design, flow, progress and this tasklist.
- [ ] Report Part 5 and stop.

### Part 6 — Verification and merge

**Precondition:** Deep approves Part 6; gate 5 passes before merge.

- [ ] Format, lint, typecheck, migrations on a fresh database, full test suite, production build.
- [ ] Confirm that no price, private bucket, visitor/session id or personal detail appears in any developer response, HTML or CSV.
- [ ] Confirm the aggregation schedule (if any) and `analytics:purge` are listed in production-readiness with their host (choice 10).
- [ ] Reconcile every changed document; record Deep's acceptance and the gate 5 outcome.
- [ ] Commit each part with a why-message (no AI co-author, no amend or force-push); merge to `main` only after all gates.

## Verification record

Add a row at the end of every part; never replace earlier rows.

| Date       | Owner | Part | Check                                                                                                                           | Result                                                                                                                                                                            |
| ---------- | ----- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-25 | Deep  | —    | Compared `origin/main` `461060d` against the Phase 4 branch: analytics code, schema chain, migrations, decisions, dry-run merge | v20 analytics is live on `main`; the old Phase 4 schema v11/`0014`/`analytics.ts` collide; 12 files conflict. The old plan is replaced by this tasklist.                          |
| 2026-09-25 | Deep  | 1    | Branch reset: `git reset --hard origin/main`; remote branch check                                                               | HEAD `461060d`; `task/phase-4-developer-analytics` was never on `origin`                                                                                                          |
| 2026-09-25 | Deep  | 1    | Throwaway PG18 cluster (port 55432) from `docker/postgres-init`; `db:migrate` twice; `db:seed`; `db:seed:private`               | `0000`–`0024` applied; second migrate a no-op; lookups and 16 private budget buckets seeded; shared 5432 database untouched                                                       |
| 2026-09-25 | Deep  | 1    | `bun run format:check`, `bun run lint`, `bun run typecheck`                                                                     | Passed                                                                                                                                                                            |
| 2026-09-25 | Deep  | 1    | Full `bun run test` on that database                                                                                            | 172/173 files, 2025/2026 tests; the one failure is `developer-profile.integration.test.ts` ("The seeded database has no listed property"), already on `main`, carried into Part 2 |
| 2026-09-25 | Deep  | 1    | Prettier and relative-link check on changed Markdown; `git diff --check`                                                        | Passed; repository-wide `format:check` clean, no broken relative links, no whitespace errors                                                                                      |

| 2026-09-26 | Deep | 2 | Fixed `developer-profile.integration.test.ts` alone, then full `bun run test`, on a fresh throwaway PG18 database (port 55432); leftover-row query; Prettier and ESLint on the file | 3/3 in the file; full suite 173/173 files, 2026/2026 tests; no `Profile Tower`/`Profile Listed Developer` rows left behind; format and lint clean |
| 2026-09-26 | Deep | 2 | `bunx drizzle-kit generate --name developer_analytics_release`; grants appended by hand | `0025` holds only the two v21 tables, their checks, indexes and FKs, plus the grants; journal has 26 entries |
| 2026-09-26 | Deep | 2 | Fresh throwaway PG18 (port 55432) with the four roles; `db:migrate` twice; both seeds | `0000`–`0025` applied; second migrate a no-op; shared 5432 database untouched |
| 2026-09-26 | Deep | 2 | `release-rules.test.ts` and `developer-analytics.integration.test.ts` | 36/36 |
| 2026-09-26 | Deep | 2 | The three fixture-fixed tests alone | 11/11 (each failed alone before) |
| 2026-09-26 | Deep | 2 | `format:check`, `lint`, `typecheck`, full `bun run test`; leftover-row query | All clean; 175/175 files, 2062/2062 tests; 0 properties, developers, submissions, runs or events left behind |

## Completion record

**2026-09-25 — Deep:** Part 1 complete. The branch is `main` plus documentation: this tasklist, the roadmap's Phase 4 entry, a `DECISIONS.md` entry, the developer flow, the API spec's portfolio row and `PROGRESS.md`. Part 2 has not been authorised.
