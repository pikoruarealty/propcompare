# Schema v20 — first-party analytics

**Date:** 2026-09-25. **Migration:** `0024_analytics_events`. **Owner answers:** in chat, 2026-09-25 (`DECISIONS.md` the same date). **Design:** `docs/tasklists/2026-09-23-analytics-event-taxonomy.md`, built in `docs/tasklists/2026-09-25-comparison-analytics-slice-4.md`.

Three new tables, nothing else changed. Definitions in `src/db/schema/analytics.ts`.

## `analytics_events` (raw, 13 months)

| Column                                   | Notes                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `occurred_at`                      |                                                                                                                                                                 |
| `visitor_id` uuid                        | Random, from the first-party cookie `pc_vid`; the same before and after sign-in. Not linked to any account.                                                     |
| `session_id` uuid                        | A visit: the `pc_sid` cookie, ends after 30 minutes without an event.                                                                                           |
| `event` text                             | One of the names in `ANALYTICS_EVENTS` (`src/lib/analytics/events.ts`).                                                                                         |
| `signed_in` boolean                      | Which side of the sign-in gate, never who.                                                                                                                      |
| `property_id` uuid null                  | FK `properties`, `on delete set null`.                                                                                                                          |
| `compared_ids` uuid[] null               | The properties being compared, in column order.                                                                                                                 |
| `engaged_ms` integer null                | For `page_engaged`: visible time, capped at 30 minutes per report (check constraint).                                                                           |
| `detail` jsonb null                      | Per event and checked: a group key, a unit variant id, focus keys, priorities, BHK key, city, where a removal happened, which page. Never free text or a price. |
| `device` text                            | `mobile`, `tablet` or `desktop`.                                                                                                                                |
| `source`, `medium`, `campaign` text null | UTM tags, lower-cased tokens.                                                                                                                                   |
| `referrer_domain` text null              | The referring site's host only, never the page.                                                                                                                 |
| `budget_band` text null                  | One of `BUDGET_BANDS`, the band of the ceiling stated in intake. Never the figure.                                                                              |

Indexes on `occurred_at`, `(event, occurred_at)`, `property_id`. The application role has `SELECT, INSERT, DELETE` (the delete is only the retention job); `UPDATE` is revoked.

## `analytics_event_monthly` and `analytics_pair_monthly` (kept after 13 months)

Counts per `(month, event, property_id)` (events, distinct visitors, engaged ms; unique with nulls not distinct), and per `(month, property_a, property_b)` for each pair opened together (`property_a < property_b`; comparisons, distinct visitors). Written only by `purgeOldAnalytics` (`src/lib/analytics/retention.ts`), which rolls whole months up and deletes their raw rows in one transaction. The application role has `SELECT, INSERT, UPDATE`; `DELETE` is revoked.

## Rules

No user id, name, phone, email, IP or price anywhere in these tables, and no join to a person. Read only by the admin console and the retention job (`analytics-isolation.test.ts`). Never shown to a buyer or a developer, and never a score of a property (`DECISIONS.md` 2026-09-23).
