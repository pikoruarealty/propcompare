# Schema v21 — released developer analytics (proposal)

**Status:** proposal, 2026-09-26 — Deep. Not implemented; no migration exists. Needs Bhavarth's review of analytics read access (tasklist gate 1) and of this table, its grants and its job (gate 2) before migration `0025` is written. **Supersedes:** nothing yet; [schema v20](schema.v20.md) stays as built and is only read. **Decisions:** `DECISIONS.md` 2026-09-26 (table approach; threshold). **Tasklist:** [2026-09-25 Phase 4 developer analytics](../tasklists/2026-09-25-phase-4-developer-analytics.md), Part 2.

Two new tables in `public`. No v20 table, event, cookie or route changes, and no catalog table is written.

## Why this exists

v20's raw events carry a visitor id, a visit id and every small count. They are right for the admin console and wrong for a developer, who will also hold the forwarded enquiries (schema v19) and could link a small count to a named buyer. A scheduled job reads v20 and writes only figures that meet the privacy threshold into a table developer code can read. A suppressed figure is stored without its number, so the number never exists outside v20.

## The threshold (Deep, 2026-09-26)

- **Gate:** a figure is released only when at least **5 distinct visitors** (`visitor_id`) are behind it. The same gate applies to every metric, including visit-based ones: a visit count is released only when at least 5 distinct visitors made those visits.
- **Primary metric:** distinct visitors. **Secondary:** visits (`session_id`), which show return and intent (visits per visitor, returning visitors).
- **Enquiries:** portfolio level only, with no split by property, band, device, rival or time.
- **Rates** are not stored. The query service derives one only from two released figures.
- **No subtraction:** within one group of split cells (same window, property, metric and dimension), if exactly one cell is suppressed, the smallest released cell in the group is also suppressed.
- **Windows:** fixed windows only, refreshed daily, ending with the last complete day in `Asia/Kolkata`: trailing 7 days, trailing 30 days, quarter to date, year to date, trailing 13 months. No custom ranges.
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
| `window` text          | `7d`, `30d`, `qtd`, `ytd`, `13m` (check).                                                                                                               |
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

Windows past the 13 months of raw events cannot be counted from raw rows. The monthly tables hold distinct visitors per month, which cannot be added across months. `release-v1` therefore uses raw rows only, and every window fits within 13 months.

### Not in `release-v1` (waiting on open choices)

- Competitor pairings, "compared most with" (choice 4).
- Peer benchmarks (choice 8).
- Market-wide figures: platform unique visitors, and intake demand by BHK and city, which are not about any one developer's property (choice 12).
- Daily or weekly trend series. At 5 visitors per cell most daily cells would be suppressed; the series shape is decided in Part 4/5 as an additive change.
- Listing completeness. It is deterministic catalog data with no threshold and is computed from the catalog, not stored here (choice 9).

## Job

`bun run analytics:release` (`src/db/analytics-release.ts` calling `src/lib/analytics/release.ts`), scheduled daily after `analytics:purge`. In one transaction it inserts a `running` run, computes every window from `analytics_events` joined to `properties` for ownership and eligibility (choice 6), applies the gate and the no-subtraction rule, inserts the released rows, marks the run `succeeded`, and deletes runs older than the latest 7 successful ones. On failure the transaction rolls back and a separate statement records a `failed` run with its code, so the last good figures stay visible and are labelled stale.

## Grants and who reads what

- The job runs as `propcompare_app`, like `analytics:purge`: `SELECT, INSERT, UPDATE, DELETE` on both tables (it already reads v20).
- Developer query code reads only these two tables. **How that is enforced is open (choice 11):**
  - **(a) Static only:** developer modules use `@/db` (`propcompare_app`) and the isolation test lets them import the v21 schema file (`src/db/schema/developer-analytics.ts`) but never `@/db/schema/analytics` or the v20 table names. Simple, but the role could still read raw rows if a module slipped past the test.
  - **(b) Database role:** a new `propcompare_developer_reader` role with `SELECT` on these two tables only, and a `DATABASE_DEVELOPER_READER_URL` connection used by developer analytics code, plus role provisioning in `docker/postgres-init/02-roles.sql`, CI and production. A slip then fails with a permission error. Ownership still comes from `requirePortalRole("developer", …)` on the normal connection.
- The v21 tables live in their own schema file so that the isolation test's pattern for v20 (`@/db/schema/analytics`, `analytics_events`, `analytics_(event|pair)_monthly`) keeps matching only raw data.

## Tests (Part 2)

Threshold boundary (4 and 5 visitors); a suppressed figure has no value; one visitor with 5 visits does not release `visits`; the no-subtraction rule; enquiries never appear per property; windows and `Asia/Kolkata` day edges; a property changing developer; a failed run keeps the previous run visible; the isolation test fails on a planted raw read from developer code; under (b), the reader role is denied on `analytics_events`.
