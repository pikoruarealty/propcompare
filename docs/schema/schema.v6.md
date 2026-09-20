# PropCompare canonical data schema — v6 (PROPOSED)

**Status:** active for implemented sections. Section 1 (`ai_usage_events`) was approved and implemented 2026-09-20 (migration `0008`). Section 2 (`submission_media`) was approved 2026-09-19 and is implemented by migration `0009`. Section 3 (developer legal entities) was approved by the owner on 2026-09-21 and is implemented by migration `0010`.
**Supersedes:** [schema v5](schema.v5.md) for new implementation work; v5's content is not edited.

v6 is a bundle of additive changes agreed in principle on 2026-09-19/20 (see the `DECISIONS.md` entries of those dates). Each is reviewed and approved separately; this file grows as they are drafted. Currently drafted:

1. `ai_usage_events` — the admin-only usage and cost ledger. **Approved and implemented 2026-09-20.**
2. `submission_media` — reviewed media proposed by a submission and copied to the live catalog only during publication. **Approved and implemented 2026-09-19.**
3. `developer_legal_entities` — the legal promoter entities attached to a developer profile, and the property's link to one. **Approved and implemented 2026-09-21.**

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
- **Privileges:** the migration grants `propcompare_app` `SELECT, INSERT` only and explicitly `REVOKE`s `UPDATE, DELETE` — necessary because the local and CI roles carry default privileges that grant full CRUD on every new public table. A test asserts the refusal. The service role gets nothing, and nothing in `private` is involved.

**Not in this change:** any per-developer billing or charging. This is an internal cost record; developer-facing pricing is a separate future product decision.

## 2. `submission_media` — reviewable media that publishes atomically

**Why:** a file has provenance, attribution, ordering and its own human review
decision, so it does not fit the text/number field-contract JSON. A submission
is its only pre-publication representation. `property_media` remains the one
live representation and gains immutable origin metadata.

```text
media_source_kind = enum('developer_brochure', 'own', 'developer_supplied')

property_submission_media (
  id                   uuid pk default gen_random_uuid(),
  submission_id        uuid not null references property_submissions(id) on delete cascade,
  source_document_id   uuid null references source_documents(id) on delete set null,
  uploaded_by          text null references users(id) on delete set null,
  reviewed_by          text null references users(id) on delete set null,
  unit_variant_name    text null, -- resolved by name inside publication; never a pre-publication FK
  media_type           media_type not null,
  source_kind          media_source_kind not null,
  gcs_path             text not null,
  caption              text null,
  attribution          text not null,
  display_order        integer not null check >= 0,
  is_public            boolean not null default false,
  review_status        field_review_status not null default 'needs_review',
  reviewed_at          timestamptz null,
  created_at, updated_at,
  unique(submission_id, display_order)
)

property_media gains (
  attribution          text null,
  source_kind          media_source_kind null
)
```

Publication selects only rows that are both `confirmed` and `is_public`. It
copies their path, type, target variant, order, caption, attribution and source
kind into `property_media` inside the existing `publishSubmission` transaction;
no migration, upload route, seed, or review route writes the live table.
`unit_variant_name` is resolved after the submission's variants have been
upserted. An absent target aborts the transaction rather than guessing. A
private brochure stays out of `property_media` unless its reviewed submission
row is deliberately public. Existing `property_media` rows retain nullable
origin metadata for migration compatibility; every newly published row has it.

## 3. `developer_legal_entities` — the legal promoter entity of a project

**Why:** a developer profile is the buyer-facing brand ("Adani"); RERA registers a project under a legal entity ("Adani Realty Ltd", or a project company). `DECISIONS.md` 2026-09-19 said such entities would be recorded as attached aliases once the GujRERA job needed them. Owner answers (2026-09-21): record name, type and RERA promoter number; admin-only for now (not shown to buyers); chosen per property during reconciliation.

```text
legal_entity_type = enum('company', 'llp', 'partnership', 'proprietorship', 'trust', 'other')

developer_legal_entities (
  id                                  uuid pk default gen_random_uuid(),
  developer_id                        uuid not null references developers(id) on delete cascade,
  legal_name                          text not null,
  entity_type                         legal_entity_type not null,
  rera_promoter_registration_number   text null,      -- the GujRERA promoter number, when known
  created_at, updated_at              timestamptz
)
unique: (developer_id, lower(legal_name))
unique: (rera_promoter_registration_number) where not null   -- one company, one registration
index:  (developer_id)

properties.legal_entity_id  uuid null references developer_legal_entities(id) on delete restrict
```

Design notes:

- **One entity per property**, chosen through a new contract field `property.legal_entity_id` (`data_type = legal_entity_id`, schema version v6). It travels with the submission and is copied to `properties.legal_entity_id` only by `publishSubmission`, which also refuses an entity that does not belong to the property's own developer. Reconciliation refuses the same at edit time.
- **OCR never fills it.** A brochure can name a company but cannot know which record it is, so the field is excluded from the fields the extraction model is asked for.
- **Not one of the live catalog tables**, except the new `properties` column, which only the publish transaction writes. Entities are administered directly by an admin, like developer profiles.
- **`developers.rera_developer_id` is kept** as the profile's own optional recognition key (unchanged). Entities carry the per-company registrations. Folding the two into one representation is an open follow-up, to be decided when the GujRERA job is scoped.
- **Privileges:** `propcompare_app` gets `SELECT, INSERT, UPDATE, DELETE`. Nothing in `private` is involved.
