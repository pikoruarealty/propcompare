# Schema v23 — named rival properties and peer benchmarks for developers

**Date:** 2026-09-26 — Deep. **Migration:** `0029_developer_analytics_pairings_benchmarks`. **Builds on:** [schema v21](schema.v21.md) (released developer analytics), whose two tables, grants and role are unchanged, and [schema v22](schema.v22.md) (anonymous events), whose rules it respects. **Decisions:** `DECISIONS.md` 2026-09-26 "Named rivals and peer benchmarks" and "Owner approval for Phase 4 portal completion". **Tasklist:** [2026-09-25 Phase 4 developer analytics](../tasklists/2026-09-25-phase-4-developer-analytics.md), Part 4. **Review:** the owner approved tasklist gate 2 for these tables and grants on 2026-09-26.

Two new tables in `public`, the same grants pattern as v21, and `rules_version` `release-v2`. No v20, v21 or catalog table changes, and no catalog table is written.

## Why

`release-v1` gave a developer their own figures. Two things the owner and Deep chose to add (choices 4 and 8 of the tasklist) each need to name or aggregate something beyond one developer's own properties, so each must be released by the job, behind a gate, into a table the reader role can select. Both tables hold **only figures that passed their gate**: a row is a released figure, and no row means "not enough data". Nothing here is a withheld count, a zero, a visitor id or a visit id.

## The gates

| Figure      | Released when                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A pairing   | At least **5 distinct identified visitors** (`visitor_id` not null) opened a comparison (`compare_opened`) holding both properties, both listed. A browser sending a privacy signal has no id and does not count. A developer sees at most **5** pairings per property, the most compared first. |
| A benchmark | The cohort holds at least **5** listed properties from at least **3** developers, **none of them the property's own developer**, and the **median itself is at least 5** (it is a count of visitors). The narrowest cohort that is large enough is the one used, with no fallback past it.       |

The constants are `MIN_VISITORS`, `MAX_RIVALS`, `MIN_COHORT_PROPERTIES` and `MIN_COHORT_DEVELOPERS` in `src/lib/analytics/release-rules.ts`. **The owner confirmed the cohort sizes (5 other properties, 3 other developers) and the cap of 5 rivals on 2026-09-26.** With the current catalogue (a handful of projects) no benchmark cohort is large enough, so no benchmark will appear until more properties are listed; that is the gate working, not a fault.

## 1. `developer_analytics_pairings`

The listed properties a developer's property is most often compared with, named.

| Column                                 | Notes                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `id` uuid                              | Primary key.                                                                        |
| `run_id` uuid                          | FK `developer_analytics_runs`, `on delete cascade`.                                 |
| `window`, `window_start`, `window_end` | As v21 (`7d`, `30d`, `qtd`, `ytd`, `12m`; check).                                   |
| `developer_id` uuid                    | FK `developers`, cascade: the developer who owns `property_id`.                     |
| `property_id` uuid                     | FK `properties`, cascade: the developer's own listed property.                      |
| `rival_property_id` uuid               | FK `properties`, cascade: another listed property, any developer's or the same one. |
| `visitors` integer                     | Distinct identified visitors who opened a comparison holding both. Checked `>= 1`.  |

Unique on `(run_id, window, property_id, rival_property_id)`; a property is never its own rival (check). Index on `(developer_id, run_id)`.

**What a pairing never carries:** the rival's own figures, any visitor or visit id, the other members of the comparison, or the comparison's contents. A three-way comparison of A, B and C adds one visitor to each of the three pairs and nothing else. The rival's name, locality and developer are read from the catalog at request time, so a rival that has since been unlisted is not named.

**Both directions are written** (A with B, and B with A), each under its own property's developer, so A's developer sees B and B's developer sees A. Naming is symmetric.

## 2. `developer_analytics_benchmarks`

One property's count set against the typical listed property near it.

| Column                                                   | Notes                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `run_id`, `window*`, `developer_id`, `property_id` | As above.                                                                                                                                                                   |
| `metric` text                                            | `visitors`, `viewers`, `comparers` or `savers` (check): the counts that already exist as released figures. Time on a page is not benchmarked: a median of medians is noisy. |
| `cohort` text                                            | `locality` or `city` (check): how near the cohort is.                                                                                                                       |
| `cohort_properties` smallint                             | How many listed properties the median is over. Checked `>= 1`.                                                                                                              |
| `cohort_developers` smallint                             | How many distinct developers those properties belong to. Checked `1..cohort_properties`.                                                                                    |
| `median` numeric                                         | The median of that count across the cohort, to one decimal place; `>= 0` (check).                                                                                           |

Unique on `(run_id, window, property_id, metric)`. Index on `(developer_id, run_id)`.

A cohort is the other developers' listed properties in the same city, and where they also share the locality, that narrower set first. Places are matched without regard to case or surrounding spaces. Every cohort member counts, including one with nothing counted (a zero is a real observation for a median), and one that is under the visitor gate on its own: only the median is released, never any member's figure. Because a median of an odd cohort equals one member's count, it must itself meet the gate before it is released.

There is no column that names or identifies a member of the cohort.

## Job

`bun run analytics:release` (`src/lib/analytics/release.ts`), in the same transaction as the v21 figures, after each window's figures:

1. `pairCandidatesFor` counts, per pair of listed properties, the distinct identified visitors who opened a comparison holding both. `releasePairings` keeps the pairs that meet the gate and the five most compared per property (ties broken by rival id, so a rerun keeps the same ones).
2. `benchmarksFor` takes each listed property's count of each benchmark metric from the candidates already computed (no further read of events), and `releaseBenchmark` applies the cohort and median rules.
3. Both write only released rows. A failed run rolls everything back, as before.

## Grants

Migration `0029` grants `SELECT, INSERT, UPDATE, DELETE` on both tables to `propcompare_app` (the job runs as it) and `SELECT` to `propcompare_developer_reader`, explicitly. The reader still holds exactly the four `developer_analytics_*` tables and nothing else; the integration test lists its grants.

## Reading

`getPropertyReport` (`src/lib/developers/analytics/report.ts`) reads both through the reader connection for the signed-in developer's own property and window, names the rivals from the catalog (dropping any no longer listed, and flagging the developer's own with `own: true`), and returns them with the property's figures. `GET /api/v1/developer/properties/{id}` and the CSV export carry them. Nothing about either reaches a buyer, and neither is a score or a ranking.

## The migration stamp

`db:generate` stamps a migration with the real clock, which here is earlier than `0028`'s. `drizzle-kit migrate` applies only migrations stamped later than the newest already applied, so an unstamped `0029` would be skipped silently on every existing database. `0029`'s `when` in `drizzle/meta/_journal.json` was set by hand to one day after `0028`. Verified on a database already at `0028`, which applied it.

## Tests

- `src/lib/analytics/release-rules.test.ts`: the gate on a pairing; no self-pairing; the cap and its tie-break, per property; the cohort's size and developer count; the developer's own properties and the property itself left out; locality then city, and another city not a cohort; no fallback past a large-enough cohort whose median is under the gate; a zero counted; an even cohort's two middle values averaged; places matched without regard to case.
- `src/db/developer-analytics.integration.test.ts`: from raw events, the pairings released and withheld (six visitors and a repeat counted once, four withheld, an unlisted property never paired, thirty browsers with no id not counted, a three-way comparison), the benchmarks' medians and cohort sizes in a city of its own, none under the gate, no column that identifies a cohort member; then the services: rivals named most compared first with the developer's own flagged, an unlisted rival dropped, another developer's rows never shown, and the CSV rows. Lowering the gate to 4 makes the pairing tests fail.
