# Tasklist: drill-down from the source, budget, device and section tables

**Status:** done, verified 2026-09-26
**Owner:** Bhavarth
**Branch:** `task/analytics-anonymous-events`
**References:** `docs/tasklists/2026-09-26-analytics-drill-down.md` (the visitors list this extends; it listed these four as not done), `DECISIONS.md` 2026-09-26 "The admin Analytics screen can be opened", `docs/production-readiness.md` (analytics follow-ups).

## Scope

Each row of "Where visitors come from", "By budget", "By device" and "Sections opened in a comparison" links to the visitors behind it, using the same visitors list and filter as the funnel and property rows. Admin only; no schema change.

## Non-goals

- No links from focus, unit-type, comparison-size or intake tables (not asked for).
- No new figure, score or ranking; no change to any number on the screen.
- Anonymous events carry no visitor id, so they are counted in a row's figure but cannot be listed (the list already says so).

## Checklist

- [x] The dashboard's source and budget-band expressions become shared fragments, so a table row and the list it links to cannot define "source" or "band" differently.
- [x] Each of the four tables' rows carries the raw value (`key`) as well as its display label.
- [x] `VisitorFilter` gains `source`, `band`, `device`, `group`; each is read from the address, describes itself in the page's sentence, and narrows the list to visitors with an event that the table would have counted under that row.
- [x] Rows link to `visitorsHref(days, ...)` with the value encoded.
- [x] Tests against the real database: for each of the four, the visitors a row links to are exactly the visitors that row counted; and a rendering test of the links.
- [x] `PROGRESS.md`; this tasklist's completion record.

## Acceptance criteria

- A row's visitor count equals the linked list's total for source, budget and device (visitors), and the section row links to the visitors who opened that section.
- `bun run typecheck`, lint, format and the analytics suites pass.

## Completion record

2026-09-26. Built as scoped. The source and budget-band expressions are now shared between the dashboard and the visitors list (`sourceOfEvent`, `bandOfEvent`), so a row and the list it opens cannot disagree; the four rows carry a raw `key`. Verified against the real database: for every source, budget and device row the linked list's total equals the row's visitor count, the section row lists exactly the visitors who opened it, and hostile values match nobody. `bun run typecheck`, lint, format, and the analytics, admin-panel and admin suites (72 tests). Not looked at in a browser.
