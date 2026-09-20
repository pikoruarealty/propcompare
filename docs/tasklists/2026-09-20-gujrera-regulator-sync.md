# Tasklist — GujRERA fetch, cross-check and quarterly refresh (built to add other regulators)

**Status:** planned — **do not start coding until the owner finishes their own end-to-end test** and reports any changes it needs. Depends on `2026-09-20-edit-published-properties.md` (edits and the live-value comparison reuse the same machinery).
**Owner:** Bhavarth
**Parent:** `docs/tasklists/2026-09-18-phase-2a-completion.md` (the `rera_fetch_jobs` item)
**References:** `docs/schema/schema.v1.md` (`rera_fetch_jobs`, section C), `docs/schema/schema.v6.md`, `docs/app-flows/admin.md`, `docs/api/api-spec.v1.md`, `ARCHITECTURE.md` (trust boundary), `docs/ocr-routing-contract.v2.md`, `DECISIONS.md` 2026-09-20 (three entries)

## Owner answers (2026-09-20)

1. **Who supplies the RERA number:** admins at first; developers for their own properties once they join. The fetch starts from that number.
2. **Automated fetching:** the owner reports GujRERA is public, has been scraped before, and shows no blocker. Recorded as the owner's statement; the site's terms were not independently reviewed.
3. **Cadence:** quarterly, for published properties, because promoters update each quarter.
4. **RERA wins.** Anything RERA states is top priority. On a difference the RERA value is used; it stays editable by an admin, and the admin screen shows that the value differs from what RERA says.
5. **Scope now:** GujRERA only (Ahmedabad launch). The structure must let other cities and regulators be added without rework.

## Quarter timing (researched 2026-09-20)

GujRERA requires every registered project to file its quarterly progress report in the same fixed windows for all projects: **1–7 January, 1–7 April, 1–7 July and 1–7 October** (calendar quarters, not per-project anniversaries) — [DeshGujarat, 20 Dec 2024](https://deshgujarat.com/2024/12/20/gujrera-introduces-daily-late-fee-for-delayed-quarterly-progress-reports-from-january-2025/). Since 1 January 2025 late filers are charged a daily fee instead of being locked out, so **some promoters file after the 7th**. GujRERA has also extended deadlines by order before (for example a 2019 notice moved 7 July to 21 August), so a window can move. I could not read an official GujRERA circular, so the windows are treated as a strong default, not a guarantee.

**Design consequence:** do not fire on a fixed date and assume the data changed. A property is _due_ once the current quarter's window has closed and it has no successful check since; a due property that showed no change is re-checked weekly until the record shows a newer update or the quarter ends.

## What already exists

- `rera_fetch_jobs` (`property_id`, `rera_registration_number`, `status`, `fetched_payload`, `matched_fields`, `run_at`), and the `rera_scrape` submission source. Nothing uses them.
- `properties` holds `rera_registration_number` (unique), `rera_registered`, `rera_last_verified_at`, `rera_project_land_area_sqft`, carpet-area range and `rera_construction_progress_percent`; the publisher writes the RERA number and progress.
- The queue, claim, lease and heartbeat pattern of the OCR worker (`src/lib/ocr/worker.ts`) is the model for a fetch worker.
- Nothing may write a live table except the publish transaction; a fetch produces a `rera_scrape` submission for review, never a live change.

## Design (built to scale to other regulators)

1. **Regulator adapter interface** in `src/lib/rera/`: `RegulatorAdapter { code, fetchProject(registrationNumber) → RegulatorRecord, normalize }`, and a registry keyed by regulator code (`gujrera` first). A `RegulatorRecord` is one normalized shape (project name, promoter, registration number, validity dates, location, land and carpet areas, unit and tower counts, declared completion date, construction progress, a source URL and the site's own "last updated" if shown), so nothing downstream knows which regulator produced it.
2. **Everything GujRERA-specific lives in one adapter:** URLs, page parsing, the field mapping, its quarter windows. Adding Maharashtra later means one new adapter plus a registry entry.
3. **City → regulator** is a small config map (Ahmedabad and Gandhinagar → `gujrera`) rather than a hard-coded assumption; a property or RERA number must resolve to exactly one regulator or the action refuses with a plain message.
4. **Schema change (additive, its own `schema.v7.md`, needs owner approval before migration):** `rera_fetch_jobs` gains `regulator_code`, `error`, `attempts`, `source_url`, and lease columns matching the OCR worker; `fetched_payload` keeps the raw response (saved before parsing, per the paid-run hardening rule — the same discipline applies here even though it is free). No new entity table.
5. **Where RERA wins.** A fixed, reviewed mapping says which contract fields RERA is authoritative for (initially: RERA number, promoter and legal entity, project name, location, land area, carpet range, unit and tower counts, completion date, construction progress). For those fields the `rera_scrape` submission proposes the RERA value.
6. **Difference flag on the admin screen.** Computed at read time from the latest successful fetch against the value in the submission or property: if they differ, the field shows "differs from RERA — RERA says X". It never blocks approval; the admin may keep an edited value, and the flag stays visible.
7. **"Last checked" is the latest successful fetch time**, read from the job, not written to `properties.rera_last_verified_at`. Reason: an unchanged check produces no submission, so nothing could legally update that column (one write path). The column stays as the last _published_ verification.
8. **Two entry points:** (a) during review of any submission that carries a RERA number, an admin "Fetch RERA record" action adds RERA-sourced evidence and proposed values; (b) the quarterly job creates a `rera_scrape` submission for each property whose fetched record differs from live, and only then.
9. **Scheduler:** a due-check inside a worker started the same way as the OCR worker (`src/instrumentation.ts`, or `bun run rera:worker` alone). It needs no cron: it finds due properties, claims one job at a time per regulator, spaces requests, and backs off on failure. A kill switch (`RERA_WORKER_ENABLED`) and a per-regulator rate limit are environment settings.
10. **Failures never look like "no change".** A blocked, empty or unparseable response is a failed job with a plain reason, and the last good record stays as the comparison basis.

## Non-goals

- No writes to live tables from the fetch job.
- No buyer-facing display of RERA fields beyond what already exists, and "last checked" wiring belongs to the trust-features slice.
- No other regulator in this slice.
- No paid service. If GujRERA can only be read through a paid or credentialed route, stop and ask.

## Decisions that could block work

- **The site's real data and structure are unverified.** It loads through JavaScript, so a plain fetch returned nothing. The first coding step is to open it in a real browser (the repo already uses `playwright-core`) and record which fields and endpoints exist. The field mapping in point 5 is confirmed with the owner from that sample before anything is built on it.
- Schema v7 approval (point 4) and the `rera_last_verified_at` reading (point 7).
- Whether one RERA registration can span several of our properties (or one property have several registrations, phases). The current schema makes the number unique per property; confirm against real projects.

## Ordered checklist

### Discovery

- [ ] Inspect GujRERA in a browser; save a sample response per field; list what a project record exposes and how it is reached. No code beyond a throwaway probe.
- [ ] Confirm the RERA-authoritative field mapping with the owner.
- [ ] Check whether the site shows its own last-updated date per project.

### Implementation

- [ ] `schema.v7.md` and migration (after approval).
- [ ] `src/lib/rera/`: adapter interface, registry, the `gujrera` adapter, normalized record type.
- [ ] Fetch job queue, claim, lease, heartbeat, failure states (modelled on the OCR worker).
- [ ] Build a `rera_scrape` submission from a record vs. the property (RERA value proposed; `not_stated` where RERA is silent, never blank or invented).
- [ ] Review-time "Fetch RERA record" action and evidence display.
- [ ] Difference flag in the reconciliation screen and property view.
- [ ] Due-check scheduler and worker entry point.
- [ ] Admin: enter or change a property's RERA number and see fetch history.

### Tests

- [ ] Adapter tests against saved real responses (no live network in CI); malformed and empty responses fail safely.
- [ ] Integration: a differing record produces a submission and never a live write; an identical record produces neither a submission nor a live write.
- [ ] Due-check: before, inside and after the window; late filer; extended deadline; failed check retried.
- [ ] Concurrency: two workers never run the same job.
- [ ] A test that nothing outside the publish transaction writes live tables from this path.
- [ ] Browser check: RERA number entered → record fetched → difference shown → approved → published.

### Documentation

- [ ] `schema.v7.md`, API spec, admin app-flow, `ARCHITECTURE.md` regulator-adapter note, `production-readiness.md` (fetch rate, terms review, monitoring), `PROGRESS.md`, `DECISIONS.md`.

## Acceptance

Given a real GujRERA number for Kimana Towers, an admin fetches the record, sees RERA's values proposed with any difference flagged, approves, and the property publishes with RERA's values; a later quarterly run for an unchanged record creates nothing and updates "last checked". Adding a second regulator needs a new adapter file and a registry entry, and no change to the job, submission or screen code.

## Completion record

_(fill in at completion)_
