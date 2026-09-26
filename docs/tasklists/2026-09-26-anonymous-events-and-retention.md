# Tasklist — anonymous events for privacy-signal browsers, anonymise-not-delete, and the privacy policy inputs

**Status:** done (2026-09-26), except the items under "Not doing". Not looked at in a browser.
**Owner:** Bhavarth
**Branch:** `task/analytics-anonymous-events`
**References:** `docs/tasklists/2026-09-25-comparison-analytics-slice-4.md`, `docs/tasklists/2026-09-26-analytics-recording-diagnostic.md` (the finding that started this), `DECISIONS.md` 2026-09-19, 2026-09-25 and 2026-09-26, `docs/schema/schema.v20.md`, `docs/schema/schema.v21.md`, `docs/production-readiness.md`, `AGENTS.md`.

The owner's answers, in chat 2026-09-26: keep identity out of the events table; anonymise old rows instead of deleting them; a browser sending Global Privacy Control or Do Not Track is recorded, keeping only what is meaningful without identity; write everything the privacy policy must cover into the docs.

## Steps

1. [x] Schema v21 (migration `0025`): `visitor_id` and `session_id` nullable, `anonymised_at` added, `DELETE` revoked and column-level `UPDATE` granted to the application role. Applied locally; grants checked.
2. [x] Route: `recordingMode` (identified, anonymous, none); anonymous events set and read no cookie and carry no id.
3. [x] Browser tracker: no longer stops on the privacy signal.
4. [x] Retention: count the month, clear the ids, stamp the row, once per row.
5. [x] Dashboard: null ids do not collapse into one visitor or visit; identified-only visitor, funnel and breakdown figures; anonymous rows counted in events, pairs and time; "events without a visitor id" note; comparisons per comparer identified only.
6. [x] Admin screen notice for a browser that is anonymous or not recorded.
7. [x] Tests against the real database (anonymous events, dashboard with anonymous rows, anonymising and its second run, refused delete and update), the browser-side test flipped, the helper test.
8. [x] Docs: `DECISIONS.md`, `docs/schema/schema.v21.md`, `docs/api/api-spec.v1.md`, `docs/production-readiness.md`, **`docs/product/privacy-policy-inputs.md`** (new), a standing rule in `AGENTS.md`, `PROGRESS.md`.
9. [x] Typecheck (`bun run typecheck`), lint, format check, targeted suites.

## Not doing

- The opt-in consent for interested buyers, the developer's view of forwarded enquiries and the developer analytics view. All need the owner's answers first (`docs/product/privacy-policy-inputs.md` section 8).
- Scheduling the job, rate limiting the endpoint, the privacy policy text. Production-readiness items.
- Any change to a buyer or developer surface.
