# Tasklist — delete and archive submissions; review-panel and comparison follow-ups

**Status:** done, verified 2026-09-24
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** nothing
**References:** `DECISIONS.md` 2026-09-24, `docs/schema/schema.v13.md`, `docs/api/api-spec.v1.md` (admin submissions routes), `docs/design/comparison.v1.md`

## Scope

Owner request: the submissions tab is cluttered; add a delete option, hard delete when never published, otherwise remove it from the UI (an archive view is fine) so the default list stays clean.

1. **Delete (never published):** `DELETE /api/v1/admin/submissions/{id}`. Fields, evidence, images and extraction attempts cascade; stored files only this submission used are removed (a page image also pointed at by another submission or a live picture is kept); the brochure document is removed if nothing else uses it. Spend history stays (usage ledger rows are set-null). Refused with `409` while a brochure read is queued or running.
2. **Archive (published):** the same route archives instead (`archived_at`, schema v13). Default queue hides it; an "Archived" view lists it; `POST .../restore` brings it back. Live listing untouched.
3. **UI:** owner-only Delete/Archive on each queue row with a confirmation that says which of the two will happen; Archived filter with Restore.

Also done in the same session, on the owner's reports (no schema change):

4. **Review panel:** pictures open full size in the zoomable viewer (`ExpandableImage`); a new **Location & connectivity** tab (`nearby_connectivity`, `nearby_hospitals`, `nearby_schools`, `plot_no`) and the developer's full amenities list moved to the Amenities tab.
5. **Comparison:** a column's plate is a photo of the building, never a floor plan (`identityPicture`, the rule the cards already used, now shared by the comparison and the dossier), at a readable 3:2 in its own row instead of an 80px strip inside the sticky header; a photo strip per project closes the comparison (signed-in only, opens full size).

## Non-goals

- No automatic clean-up or expiry of archived submissions.
- No developer-portal or verifier access: delete, archive and restore are owner-only, like publish.
- A project "main photo" chosen by the developer or admin: approved afterwards and built, see `docs/tasklists/2026-09-24-main-project-photo.md`.

## Decisions blocked (resolved: the owner approved it and it is built)

- **Main project photo.** The owner proposed a separately-designated main photo per project as its identity picture. `property_media.is_primary` exists but nothing sets it: `property_submission_media` has no such column and the publisher does not carry one. Doing it means a schema change and a change to the publish transaction (`AGENTS.md`: surface for review), plus an admin control and, later, a developer-portal field. Built afterwards, see `2026-09-24-main-project-photo.md`.

## Implementation checklist

- [x] `archived_at` column, migration `0016_submission_archive` (journal timestamp set past `0014`'s hand-set one; see `PROGRESS.md`), `schema.v13.md`.
- [x] `src/lib/submissions/removal.ts`; `DELETE /api/v1/admin/submissions/[id]`; `POST .../restore`.
- [x] `listSubmissionQueue` archived filter; queue page Archived view; `SubmissionRowActions`.
- [x] Integration tests (real database, local storage): delete cascade and files, rejected, running-extraction guard, shared file kept, archive/restore idempotence, queue views.
- [x] `ExpandableImage` in the review panel; Location & connectivity group; tests.
- [x] `identityPicture`, plate row, photo carousel; tests.
- [x] typecheck, lint, full suite.

## Acceptance criteria

- The default submissions list no longer shows archived submissions; Archived lists them; Restore returns them.
- A never-published submission can be deleted from the list and is gone, with its files.
- A comparison column never uses a floor plan while the project has a photo.

## Completion record

2026-09-24. Verified by tests and, for the routes, a live unauthenticated check (`401`). The queue page and the review panel were not looked at in a browser here.
