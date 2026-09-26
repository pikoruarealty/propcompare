# Schema v21 — anonymous analytics events, and anonymise-not-delete

**Date:** 2026-09-26. **Migration:** `0025_analytics_anonymous_events`. **Owner answers:** in chat, 2026-09-26 (`DECISIONS.md` the same date). **Tasklist:** `docs/tasklists/2026-09-26-anonymous-events-and-retention.md`. **Builds on:** `docs/schema/schema.v20.md` (whose text is unchanged; this document supersedes its retention and identity rules).

One table changed, nothing added. Definition in `src/db/schema/analytics.ts`.

## `analytics_events`

| Column          | Change                                                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visitor_id`    | Now **nullable**. Null means the event is not tied to any browser: it came from a browser that sent Global Privacy Control or Do Not Track, or it is older than 13 months.               |
| `session_id`    | Now **nullable**, null in the same two cases.                                                                                                                                            |
| `anonymised_at` | **New**, timestamptz null. Set by the retention job when it counted the row's month and cleared its ids. Null on every newer row. A row is handled once, so a re-run adds nothing twice. |

Every other column (`event`, `signed_in`, `property_id`, `compared_ids`, `engaged_ms`, `detail`, `device`, `source`, `medium`, `campaign`, `referrer_domain`, `budget_band`) is unchanged and is kept for good.

## Privileges (application role)

`SELECT, INSERT`, plus column-level `UPDATE (visitor_id, session_id, anonymised_at)` for the retention job. **`DELETE` is revoked**: nothing in the application removes an event any more. No other column can be rewritten.

## Rules that change from v20

1. **Anonymous events.** A request carrying `Sec-GPC: 1` or `DNT: 1` is recorded with `visitor_id` and `session_id` null and **no cookie is read or set**. It counts as an event (views, comparisons, sections, time on a page, enquiry with its compared set) but never as a visitor, a visit or a funnel step. A crawler or link preview is still not recorded.
2. **Retention.** After 13 whole months (`RAW_RETENTION_MONTHS`), `bun run analytics:purge` (a) adds the month's counts to `analytics_event_monthly` and `analytics_pair_monthly`, including their distinct-visitor figures, then (b) clears `visitor_id` and `session_id` and stamps `anonymised_at`. The event rows stay, so later analysis of a property or a pair keeps device, source, budget band, sections, focus, unit-type switches and time. What is lost after 13 months: any per-person path (visitors, visits, funnel steps, time per visit).
3. **Monthly tables** keep the meaning of v20 but are now written as ids are cleared, so they hold the distinct-visitor counts the cleared ids would otherwise take with them. Summing `visitors` across months counts the same person once per month.
4. **Dashboard.** Visitor, visit, funnel and breakdown figures read identified rows only; event counts, pairs, per-property figures and time on a page include anonymous rows. The overview says how many events had no visitor id.

## Unchanged and still true

No user id, name, phone, email, IP address or price is in any analytics table, and no join to a person exists. A visitor id, while present, is random and is not linked to an account (`docs/schema/schema.v20.md`).
