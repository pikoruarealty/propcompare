# PropCompare canonical data schema — v6 (PROPOSED)

**Status:** proposed 2026-09-20 — **not implemented, not applied**. Awaiting owner review per `AGENTS.md` (a schema change is surfaced, not made autonomously). Until it is approved, [schema v5](schema.v5.md) remains the active baseline and nothing in this file may be implemented against.
**Supersedes:** nothing yet. On approval it supersedes [schema v5](schema.v5.md) for new implementation work; v5's content is not edited.

v6 is a bundle of additive changes agreed in principle on 2026-09-19/20 (see the `DECISIONS.md` entries of those dates). Each is reviewed and approved separately; this file grows as they are drafted. Currently drafted:

1. `ai_usage_events` — the admin-only usage and cost ledger (this section).
2. _Still to draft:_ `submission_media` (photos, floor plans, optional public brochure; attribution and source kind), and the developer legal-entity link (brand profile with attached RERA legal entities).

## 1. `ai_usage_events` — AI usage and cost ledger

**Why:** the owner wants every paid model call (the page-routing pass and each Claude extraction scope) tracked per brochure, submission and developer, viewable by admins in a separate Usage tab, never shown to developers and never shown beside the action that caused it (`DECISIONS.md` 2026-09-20). Today the numbers exist only transiently: token counts are held on a draft manifest and extraction cost lives in a local checkpoint file, so nothing would survive to be summed.

```text
ai_usage_kind = enum('page_router', 'ocr_extraction')
ai_usage_status = enum('succeeded', 'failed')

ai_usage_events (
  id                   uuid pk default gen_random_uuid(),
  kind                 ai_usage_kind not null,
  status               ai_usage_status not null,
  provider             text not null,            -- 'openrouter'
  model                text not null,            -- e.g. 'google/gemini-2.5-flash'
  provider_request_id  text null,                -- for reconciling against the provider dashboard
  scope_key            text null,                -- extraction scope; null for the router
  ocr_job_id           uuid null  references ocr_extraction_jobs(id) on delete set null,
  submission_id        uuid null  references property_submissions(id) on delete set null,
  source_document_id   uuid null  references source_documents(id)    on delete set null,
  developer_id         uuid null  references developers(id)           on delete set null,
  prompt_tokens        integer null,
  completion_tokens    integer null,
  reasoning_tokens     integer null,
  cost_usd             numeric(12,6) null,       -- provider-reported; null = not reported, never guessed
  created_by           text null  references users(id) on delete set null,
  created_at           timestamptz not null default now()
)

indexes: (created_at), (developer_id), (submission_id)
checks:  token columns and cost_usd, when present, are >= 0
```

Design notes:

- **Append-only.** Rows are inserted once per provider request and never updated. `on delete set null` on every link keeps the cost history when a draft, document or developer is later deleted — spend that happened is still spend that happened.
- **Money is `numeric`, never float** (`AGENTS.md`). USD, because that is what the provider bills; a later INR display would be a presentation concern.
- **A failed request is recorded** (`status = failed`, cost if the provider reported one), because a call can bill even when its result is unusable.
- **`cost_usd` null means "not reported".** It is never estimated from tokens, so a total that includes nulls is understood to be a lower bound and the screen says so.
- **Not a catalog table.** It is not one of the live catalog tables reserved to `publishSubmission`; it is written by the ingestion code that made the call.
- **Admin-only by construction.** No developer or buyer route reads this table, and no response outside the admin console includes a cost. The Usage screen and its queries sit behind `requirePortalRole("admin")`; a test asserts no developer-portal or buyer route imports the usage module.
- **Privileges:** the migration grants `propcompare_app` `SELECT, INSERT` only (no `UPDATE` or `DELETE`) on the table, matching its append-only nature. The service role gets nothing, and nothing in `private` is involved.

**Not in this change:** any per-developer billing or charging. This is an internal cost record; developer-facing pricing is a separate future product decision.
