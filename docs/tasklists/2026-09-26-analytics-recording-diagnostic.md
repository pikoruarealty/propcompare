# Tasklist — say why an admin's own clicks are not in Analytics

**Status:** done (2026-09-26). The notice was not looked at in a browser.
**Owner:** Bhavarth
**Branch:** `main` (small follow-up to `task/phase-3-completion`).
**References:** `docs/tasklists/2026-09-25-comparison-analytics-slice-4.md`, `DECISIONS.md` 2026-09-25 (consent: Global Privacy Control and Do Not Track switch recording off; crawlers are not visitors), `docs/production-readiness.md`.

## Finding

The owner clicked through a comparison as an admin and as a second account and `/admin/analytics` stayed empty. The events table has held zero rows since it was created. The whole path works: with an ordinary Chrome user agent, a dossier visit and a comparison open were recorded (`property_viewed`, `compare_opened` with two compared properties). So nothing is wrong with the route, the table, its grants or the screen. Events are dropped, by design, before they leave the browser or at the route when the browser sends Global Privacy Control, Do Not Track, or a user agent that looks automated. Both accounts sat in one browser, which fits a browser-level signal. The screen gave no hint of this: an empty page looks like a fault.

## Steps

1. [x] `recordingBlock(headers)` in `src/lib/analytics/events.ts`: the reason a request's own browser is not recorded (`privacy_signal`, `automated`) or `null`, reusing `optedOut` and `isAutomated` so the notice cannot disagree with the route.
2. [x] Notice at the top of `/admin/analytics`, drawn only when the viewing browser is not recorded, naming the signal and what to do (turn it off for this site, or test in a browser that does not send it). No change to what is recorded and no change to the consent decision.
3. [x] Test for `recordingBlock`; typecheck, lint, format, targeted suites.
4. [x] `PROGRESS.md` entry.

## Not doing

- Changing the consent rule (GPC and DNT still switch recording off). Whether the owner's own admin sessions should be excluded or included is a separate call; nothing is excluded today.
