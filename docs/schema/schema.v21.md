# Schema v21 — released developer analytics

**Status:** tables, grants and role implemented on `task/phase-4-developer-analytics` by migration `0025_developer_analytics_release` (2026-09-26 — Deep, who approved the migration). Definitions in `src/db/schema/developer-analytics.ts`; release rules in `src/lib/analytics/release-rules.ts`. The release job is not written yet (tasklist choices 5 and 6). Bhavarth's review (tasklist gate 2) is still to be recorded before the branch merges or the migration is applied outside tests; developer read code (gate 1) does not exist yet. **Supersedes:** nothing yet; [schema v20](schema.v20.md) stays as built and is only read. **Decisions:** `DECISIONS.md` 2026-09-26 (table approach; threshold; reader role, own-portfolio only, calendar windows). **Tasklist:** [2026-09-25 Phase 4 developer analytics](../tasklists/2026-09-25-phase-4-developer-analytics.md), Part 2.

Two new tables in `public` and one new database role. No v20 table, event, cookie or route changes, and no catalog table is written.

## Why this exists

v20's raw events carry a visitor id, a visit id and every small count. They are right for the admin console and wrong for a developer, who will also hold the forwarded enquiries (schema v19) and could link a small count to a named buyer. A scheduled job reads v20 and writes only figures that meet the privacy threshold into a table developer code can read. A suppressed figure is stored without its number, so the number never exists outside v20.

## The threshold (Deep, 2026-09-26)

- **Gate:** a figure is released only when at least **5 distinct visitors** (`visitor_id`) are behind it. The same gate applies to every metric, including visit-based ones: a visit count is released only when at least 5 distinct visitors made those visits.
- **Primary metric:** distinct visitors. **Secondary:** visits (`session_id`), which show return and intent (visits per visitor, returning visitors).
- **Enquiries:** portfolio level only, with no split by property, band, device, rival or time.
- **Rates** are not stored. The query service derives one only from two released figures.
- **No subtraction:** within one group of split cells (same window, property, metric and dimension), if exactly one cell is suppressed, the smallest released cell in the group is also suppressed.
- **Windows:** fixed windows only, refreshed daily, ending with the last complete day in `Asia/Kolkata`: trailing 7 days, trailing 30 days, calendar quarter to date, calendar year to date (from 1 January; Deep, 2026-09-26), and trailing 12 months. No custom ranges.
- **Why 12 months, not 13:** raw v20 events are kept 13 whole UTC months (`RAW_RETENTION_MONTHS`), cut at UTC midnight. A trailing 13-month window run early in a month would start on days already rolled up, and India time's +05:30 would miss up to five and a half hours more. A test checks every hour of two years against the retention cutoff (`release-rules.test.ts`).
- **Own portfolio only (Deep, 2026-09-26):** a developer sees figures about their own properties and nothing platform-wide. Platform totals (all unique visitors, intake demand across buyers) stay in the admin console.
- `k` is recorded on each run, so a later change of the constant is visible in the data rather than silent.

## 1. `developer_analytics_runs`

One row per job run. Gives every report its "generated at" and "data through".

| Column            | Notes                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `id` uuid         | Primary key.                                                                                |
| `started_at`      | `timestamptz not null default now()`.                                                       |
| `finished_at`     | `timestamptz null`; set on success or failure.                                              |
| `status` text     | `running`, `succeeded` or `failed` (check constraint).                                      |
| `data_through`    | `date not null`: the last complete `Asia/Kolkata` day included.                             |
| `tracking_since`  | `timestamptz null`: the earliest v20 event, so no report implies history that was not kept. |
| `min_visitors`    | `smallint not null`, the threshold used (5).                                                |
| `rules_version`   | `text not null`, e.g. `release-v1`; bumped when a metric's definition changes.              |
| `error_code` text | `null` unless failed; a short code, never a stack trace or data.                            |

Only one `running` row at a time (partial unique index on `status = 'running'`), so two schedulers cannot interleave.

## 2. `developer_analytics_released`

One row per figure a developer may see.

| Column                 | Notes                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` uuid              | Primary key.                                                                                                                                            |
| `run_id` uuid          | FK `developer_analytics_runs`, `on delete cascade`.                                                                                                     |
| `window` text          | `7d`, `30d`, `qtd`, `ytd`, `12m` (check).                                                                                                               |
| `window_start` date    | Inclusive, `Asia/Kolkata`.                                                                                                                              |
| `window_end` date      | Inclusive; equals the run's `data_through`.                                                                                                             |
| `developer_id` uuid    | FK `developers`, `on delete cascade` (derived data only).                                                                                               |
| `property_id` uuid     | FK `properties`, `on delete cascade`; `null` for a portfolio-level figure. The job only writes a property under the developer that owns it at run time. |
| `metric` text          | One of the metrics below (check).                                                                                                                       |
| `dimension` text       | `none`, `budget_band` or `device` (check).                                                                                                              |
| `dimension_value` text | `null` when `dimension = 'none'`; otherwise one of `BUDGET_BANDS` or `mobile`/`tablet`/`desktop` (check).                                               |
| `released` boolean     | `not null`.                                                                                                                                             |
| `value` numeric        | `not null` when released, `null` when suppressed (check: `released = (value is not null)`). Counts are whole numbers; medians are seconds.              |

Unique on `(run_id, window, developer_id, property_id, metric, dimension, dimension_value)`, nulls not distinct. Index on `(developer_id, run_id)`.

There is no column for a hidden count, a visitor id, a visit id, a slug list, a rival property or free text.

### Metrics (`release-v1`)

"About the property" means `property_id` is the property, or the property is in `compared_ids`.

| Metric                                     | Level          | Definition                                                                                                                        | Dimensions         |
| ------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `visitors`                                 | property       | Distinct visitors with any event about the property                                                                               | none, band, device |
| `viewers`                                  | property       | Distinct visitors with `property_viewed`                                                                                          | none, band, device |
| `comparers`                                | property       | Distinct visitors with `compare_opened` including the property                                                                    | none, band         |
| `savers`                                   | property       | Distinct visitors with `property_saved`                                                                                           | none               |
| `unlockers`                                | property       | Distinct visitors with `dossier_unlocked`                                                                                         | none               |
| `visits`                                   | property       | Distinct visits with any event about the property (released only if its visitors ≥ 5)                                             | none               |
| `returning_visitors`                       | property       | Visitors with 2 or more distinct visits about the property                                                                        | none               |
| `median_dossier_seconds`                   | property       | Median, per visitor, of total visible time on the property's dossier (`page_engaged`, `dossier`)                                  | none               |
| `median_compare_seconds`                   | property       | Median, per visitor, of visible time on comparisons that include the property                                                     | none               |
| `visitors`, `visits`, `returning_visitors` | portfolio      | The same, across all the developer's eligible properties, each visitor counted once                                               | none               |
| `enquirers`                                | portfolio only | Distinct visitors with `enquiry_submitted` on any of the developer's properties (choice 5 may narrow this to forwarded enquiries) | none               |
| `enquirers_comparing`                      | portfolio only | Of those, visitors whose enquiry carried a comparison set                                                                         | none               |

`returning_visitors` is released only if it meets the gate itself, not just its parent.

The monthly v20 tables hold distinct visitors per month, which cannot be added across months, so `release-v1` counts from raw rows only, and every window fits inside raw retention (see "Why 12 months").

### Not in `release-v1` (waiting on open choices)

- Competitor pairings, "compared most with" (choice 4).
- Peer benchmarks (choice 8).
- Market-wide figures (platform unique visitors, intake demand by BHK and city): admin only, never a developer's (choice 12, decided 2026-09-26).
- Daily or weekly trend series. At 5 visitors per cell most daily cells would be suppressed; the series shape is decided in Part 4/5 as an additive change.
- Listing completeness. It is deterministic catalog data with no threshold and is computed from the catalog, not stored here (choice 9).

## Job

**Not written yet; blocked on tasklist choices 5 (which enquiries count) and 6 (listed only, or listed and unlisted).** Planned: `bun run analytics:release` (`src/db/analytics-release.ts` calling `src/lib/analytics/release.ts`), scheduled daily after `analytics:purge`. In one transaction it inserts a `running` run, computes every window from `analytics_events` joined to `properties` for ownership and eligibility (choice 6), applies the gate and the no-subtraction rule, inserts the released rows, marks the run `succeeded`, and deletes runs older than the latest 7 successful ones. On failure the transaction rolls back and a separate statement records a `failed` run with its code, so the last good figures stay visible and are labelled stale.

## Grants and who reads what

Migration `0025` grants explicitly rather than relying on local default privileges, so a production database without them ends up the same.

| Role                                                                           | On the two v21 tables                                                                | Anything else                                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `propcompare_app`                                                              | `SELECT, INSERT, UPDATE, DELETE`: the release job runs as it, like `analytics:purge` | Unchanged (it already reads v20 for the admin console)                                                |
| `propcompare_developer_reader` (new; Deep chose the database role, 2026-09-26) | `SELECT` only                                                                        | Nothing: no raw event, catalog, account or `private` table; no default privileges; no role membership |
| `propcompare_service`, `propcompare`                                           | None                                                                                 | Unchanged                                                                                             |

- The reader role is provisioned by `docker/postgres-init/02-roles.sql` (local and CI) and by deployment in production, with `CONNECT` and `USAGE` on `public`. `0025` grants to it by name, so on a database without the role the migration stops instead of leaving the boundary half built. `docs/local-database-setup.md` covers existing databases.
- Developer analytics code connects through `src/db/developer-reader.ts` (`DATABASE_DEVELOPER_READER_URL`), which refuses a URL equal to the app, service or admin one. Who the developer is still comes from `requirePortalRole("developer", …)` on the normal connection.
- The v21 tables live in their own schema file so that the isolation test's pattern for v20 (`@/db/schema/analytics`, `analytics_events`, `analytics_(event|pair)_monthly`) keeps matching only raw data.

## Tests (Part 2)

Written: `src/lib/analytics/release-rules.test.ts` (windows, India-time day edges, the retention cutoff, the gate at 4 and 5, visits gated on visitors, withheld never zero, the no-subtraction rule, the band list matching `BUDGET_BANDS`) and `src/db/developer-analytics.integration.test.ts` (the reader role reads v21 and is refused raw analytics, catalog, account and `private` tables and every write; its exact grants and attributes; every check constraint; one running job). With the job: threshold boundary (4 and 5 visitors); a suppressed figure has no value; one visitor with 5 visits does not release `visits`; the no-subtraction rule; enquiries never appear per property; windows and `Asia/Kolkata` day edges; a property changing developer; a failed run keeps the previous run visible; the isolation test fails on a planted raw read from developer code.
