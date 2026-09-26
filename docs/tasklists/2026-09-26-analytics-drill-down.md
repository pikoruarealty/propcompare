# Tasklist — Analytics that can be opened: the chart, visitors, journeys, and what stands out

**Status:** done (2026-09-26). Not looked at in a browser by me; the owner has the screen open.
**Owner:** Bhavarth
**Branch:** `task/analytics-anonymous-events`
**References:** `docs/tasklists/2026-09-25-comparison-analytics-slice-4.md`, `docs/tasklists/2026-09-26-anonymous-events-and-retention.md`, `DECISIONS.md` 2026-09-25 and 2026-09-26, `docs/schema/schema.v21.md`, `docs/product/privacy-policy-inputs.md`, `docs/design/no-vibecoded-tells.v1.md` (admin: no shadows, no decorative icons, no em dashes, 8px radius).

The owner's feedback, in chat 2026-09-26, after seeing the screen: the daily graph is one solid block; the figures are stuck (nothing to click, no insight, no way into the visitors behind a number).

## What was wrong

- The daily chart drew only days that had events, so one active day became one bar as wide as the chart. It also had no scale.
- Every figure was a dead end. There was no list of visitors and no way to see what a visitor did.

## Decisions taken here (recorded in `DECISIONS.md` 2026-09-26)

- A "visitor" is an anonymous browser id (its first six characters are its label). The admin can open its **journey** (the events in order, grouped by visit). Nothing is joined to a person: no phone, name or account appears, and this change adds no such join. The enquiry inbox already shows an enquirer's phone; the journey links to the inbox for a property, not to a person.
- Only identified rows are visitors (anonymous and older-than-13-months rows have no id). The list and the journey therefore reach back at most 13 months.

## Steps

1. [x] Chart: every day of the period drawn (zero days included), a capped bar width so one day is one bar, a scale, hover titles kept, the numbers table kept.
2. [x] `src/lib/analytics/visitors.ts`: a visitor list (window, filter, limit) and one visitor's journey; plain-words description of each event.
3. [x] Filters on the list: reached or stopped at a funnel step, reached the sign-in gate, viewed or compared a property, compared a pair.
4. [x] Pages: `/admin/analytics/visitors` and `/admin/analytics/visitors/[id]`.
5. [x] Links: each tile, each funnel step (who reached it, who stopped there), each pair and each property row.
6. [x] "What stands out": a few rule-built sentences from the figures, each linking to the visitors behind it. Admin only; no score of a property and no winner.
7. [x] Tests (pure helpers, the queries against the database, the chart and tiles), `docs/product/privacy-policy-inputs.md` (an admin can open a browser's event history), `PROGRESS.md`, typecheck, lint, format, full suite.

## Not doing

- Any join from an event or a visitor to a phone, name, email or account.
- Drill-down from the source, budget, device, section, focus and intake tables (they are counts of the same visitors; add when asked).
- Developer-facing analytics (Phase 4).
