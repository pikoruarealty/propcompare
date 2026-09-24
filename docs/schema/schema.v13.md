# PropCompare canonical data schema — v13

**Status:** implemented by migration `0016_submission_archive`.
**Supersedes:** [schema v12](schema.v12.md) for new implementation work; v12's content is not edited.

v13 is one added column, for clearing published submissions out of the admin queue without losing the record of what went live (`DECISIONS.md` 2026-09-24; `docs/tasklists/2026-09-24-delete-and-archive-submissions.md`).

## 1. `property_submissions.archived_at` — new, nullable

```text
property_submissions (
  ...existing columns...
  archived_at  timestamptz null
)
```

Set by an owner when a **published** submission is archived; `null` for everything in the queue. It is never set on a submission that was not published: those are deleted outright instead, because nothing live depends on them.

- The default admin queue leaves archived submissions out; an "Archived" view lists them; restoring sets the column back to `null`.
- Archiving does not touch the live listing, `property_revisions`, or any live catalog table.
- The queue's one-row-per-property rule picks a property's newest version whether or not it is archived, so archiving the newest submission takes the property out of the queue rather than resurfacing an older version.

## 2. What is deliberately not a column

There is no soft-delete flag for never-published submissions. Hard delete cascades from `property_submissions` to its fields, evidence, images and extraction attempts (`ON DELETE CASCADE`); the AI usage ledger, RERA fetch jobs and similar history rows are `ON DELETE SET NULL`, so spend and fetch history survive. `property_revisions.submission_id` has no cascade, which is what makes a published submission impossible to hard-delete by accident.
