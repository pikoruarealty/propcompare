# PropCompare canonical data schema — v7

**Status:** approved by the owner on 2026-09-20 and implemented by migration `0011_rera_fetch_jobs_regulator`.
**Supersedes:** [schema v6](schema.v6.md) for new implementation work; v6's content is not edited.

v7 is one additive change: what a regulator fetch records. It adds columns to the existing `rera_fetch_jobs` table (defined in [schema v1](schema.v1.md) section C). It adds no table and no second representation of any entity.

## 1. `rera_fetch_jobs` — regulator, project, submission, requester and failure reason

**Why:** GujRERA is the first regulator, but others will follow, so a fetch has to say which regulator answered. An admin fetches while reviewing a submission, so the job must link to that submission and to who asked, and a failed fetch must keep its reason in plain words. Nothing else changes: `status`, `fetched_payload`, `matched_fields` and `run_at` keep their v1 meaning.

```text
rera_fetch_jobs (
  ...existing v1 columns...
  regulator_code       text not null default 'gujrera',   -- which adapter answered
  external_project_id  text,                              -- the regulator's own id; opaque to us
  submission_id        uuid fk -> property_submissions on delete set null,
  requested_by         text fk -> users on delete set null,
  error                text,                              -- plain-words reason when status = 'failed'
  index (submission_id)
)
```

**What `fetched_payload` holds:** `{ "record": RegulatorRecord }`, the normalized record (`src/lib/rera/types.ts`), and nothing else. It is **never a raw response**: regulator sites publish project costs and per-unit prices, which must not enter this database (exact prices stay in the `private` schema). The adapter copies named fields only. This is a deliberate exception to the "save the raw answer first" rule used for paid extraction (`DECISIONS.md` 2026-09-20).

**What `matched_fields` holds:** the comparison at fetch time, `[{ fieldKey, status }]`. The screens recompute the comparison on every read, so it reflects edits made after the fetch; this column is only the record of what was seen then.

**Not changed:** `properties.rera_last_verified_at` keeps meaning "last published verification". "Last checked" for buyers will be the latest successful fetch on this table, because an unchanged check produces no submission and so cannot legally update a live column.

**Migration note:** the 0011 SQL was trimmed by hand from the generated file (drizzle diffed against the 0008 snapshot and re-emitted 0009/0010's already-applied objects), and its journal timestamp had to be raised above 0010's, or drizzle silently skips it. The `0011` snapshot now holds the full current schema.
