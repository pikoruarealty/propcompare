# PropCompare Schema — v1 (draft, pending sign-off)

Status: **implemented in the first Phase 1 migration** — reflects the whiteboard schema plus all Q&A resolutions from 2026-08-31, the role/portal split, and the private-role decision recorded 2026-09-01. This is the canonical schema reference until superseded by a later `schema.v2.md` (never edited in place — see [DECISIONS.md](../../DECISIONS.md) on schema versioning).

Conventions: tables are `snake_case`, plural. Every table has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` unless noted otherwise. Any column named `..._id` other than a table's own `id` is a foreign key. Money is always `numeric`, never `float`. Enums are native Postgres enums for small, truly fixed sets; lookup tables are used wherever the set is "fixed for now, softly extensible later."

Two Postgres schemas: `public` (everything app-facing) and `private` (commercial/price data — RLS enabled and forced with zero policies, service-role only). The regular application role has no `private` schema access; the discovery/comparison service is the only code path permitted a dedicated `BYPASSRLS` connection (see `DECISIONS.md`, 2026-09-01).

---

## A. Lookups

```
property_types            (id, key, label)                          -- apartment | bungalow | plot
bhk_types                  (id, key, label, bedroom_count nullable)  -- studio, 1bhk..5bhk_plus
layout_types               (id, key, label)                          -- penthouse | duplex | simplex | ...
amenity_catalog            (id, key, label, category)
amenity_synonyms           (id, amenity_catalog_id fk, synonym_text)
specification_catalog      (id, key, label, category)
specification_synonyms     (id, specification_catalog_id fk, synonym_text)
budget_buckets             (id, label, min_inr, max_inr, display_order)
property_schema_fields     (id, field_key unique, label, data_type, jsonb_path nullable,
                             schema_version, is_active, description)
```

`property_schema_fields` is the versioned ingestion contract: the OCR pipeline reads this table to know what to extract. Anything OCR detects that isn't a row here is discarded at ingestion time, not stockpiled — this is the direct fix for the old project's 824-flagged/315-accepted mess.

Native enums (small, truly fixed): `possession_status` (under_construction, ready_to_move, nearing_possession), `document_type` (brochure_pdf, rera_extract, floor_plan, possession_proof, other), `ocr_status` (pending, processing, completed, failed), `submission_status` (draft, submitted, in_review, changes_requested, approved, rejected, published), `field_review_status` (auto_accepted, needs_review, confirmed, edited, rejected), `area_basis` (carpet, super_built_up, built_up), `catalog_item_status` (available, not_stated, explicitly_not_offered), `submission_source` (manual_form, ocr_brochure, rera_scrape), `review_verification_status` (unverified, verified).

---

## B. Core catalog (`public`, live/published data only)

```
developers (
  id, name, rera_developer_id nullable, description, logo_gcs_path, website
)

properties (
  id, name, slug unique,
  property_type_id fk -> property_types,
  developer_id fk -> developers,
  rera_registration_number nullable unique,
  rera_registered boolean not null default false,
  rera_last_verified_at timestamptz nullable,
  city, locality, latitude, longitude, pincode,        -- structured, not free text
  total_towers int nullable,
  total_units int nullable,
  possession_status possession_status nullable,
  possession_date date nullable,
  launch_date date nullable,
  rera_project_land_area_sqft numeric nullable,          -- RERA-extracted; null until rera_registered
  rera_carpet_area_range_min_sqft numeric nullable,      -- RERA-declared project-wide range, not derived
  rera_carpet_area_range_max_sqft numeric nullable,      -- from unit_areas -- RERA may file a different figure
  rera_construction_progress_percent numeric nullable,   -- 0-100, as filed in the RERA extract
  description text nullable
)

unit_variants (
  id, property_id fk -> properties,
  bhk_type_id fk -> bhk_types nullable,      -- null for plots
  layout_type_id fk -> layout_types nullable, -- e.g. duplex/penthouse; independent of bhk_type_id, both may apply
  variant_name,                               -- e.g. "3 BHK - Type A", disambiguates within a property
  total_units_of_variant int nullable,
  dimensions jsonb nullable                   -- { rooms: [{name, length_ft, width_ft, area_sqft}],
                                               --   foyer: {length_ft, width_ft, area_sqft} | null,
                                               --   balconies: [...] }
)

unit_areas (
  id, unit_variant_id fk -> unit_variants,
  basis area_basis, area_sqft numeric
)                                              -- one row per basis, never one column per basis

property_amenities (
  property_id fk, amenity_catalog_id fk, status catalog_item_status
)

property_specifications (
  property_id fk, specification_catalog_id fk,
  value_text nullable, status catalog_item_status
)

property_media (
  id, property_id fk, unit_variant_id fk nullable,
  media_type enum (photo, floor_plan, video, brochure_pdf),
  gcs_path, caption nullable, display_order, is_primary boolean
)
```

Whiteboard resolutions applied here: RERA fields live directly on `properties` (Q1, Q2 — nullable until registered, backed by developer-provided values as fallback), unit dimensions are `jsonb` (Q5), tower count is property-level while foyer nests under a variant's `dimensions` (Q6), variant names disambiguate same-BHK units within one property (Q7), property types fixed to the three listed (Q8). The whiteboard's unlabeled RERA-extract block (`project_land_area`, `carpet_area_range`, `progress`) resolved 2026-08-31 (second pass) as more `properties` columns, same as `possession_date`/`total_units`/`total_towers` before it — populated only when `rera_registered` is true (see `DECISIONS.md`). `builder_details{}` and `amenities{}` from that same block are not separate columns — already covered by `developers` and `property_amenities` respectively. `layout_types` is a new lookup, separate from `bhk_types`, because the whiteboard's `Configurations` entity named layout forms (Penthouse, Duplex) that aren't bedroom counts — a `unit_variant` can have both a `bhk_type_id` and a `layout_type_id` at once.

---

## C. Governance & ingestion (the trust boundary)

```
source_documents (
  id, property_id fk nullable, document_type document_type,
  gcs_path, uploaded_by fk -> users nullable, page_count nullable,
  ocr_status ocr_status, ocr_completed_at nullable
)

property_submissions (
  id, property_id fk nullable,          -- null when the submission proposes a brand-new property
  submitted_by fk -> users nullable,     -- null for system-initiated RERA-scrape submissions
  reviewed_by fk -> users nullable,
  source submission_source,
  status submission_status,
  payload jsonb,                         -- full/partial proposed property state, keyed by property_schema_fields.field_key
  diff_summary jsonb nullable,           -- old-vs-new, computed at submit time, for the admin review UI
  submitted_at timestamptz nullable,
  reviewed_at timestamptz nullable,
  published_at timestamptz nullable
)

property_submission_fields (
  id, submission_id fk -> property_submissions,
  field_key fk -> property_schema_fields,
  value jsonb,
  confidence numeric nullable,           -- OCR confidence, null for manual entry
  source_document_id fk -> source_documents nullable,
  source_page int nullable,
  source_snippet text nullable,          -- quoted OCR text backing this value
  review_status field_review_status
)

property_revisions (
  id, property_id fk -> properties, submission_id fk -> property_submissions,
  snapshot jsonb, published_at timestamptz
)

rera_fetch_jobs (
  id, property_id fk nullable, rera_registration_number,
  status enum (queued, running, succeeded, failed),
  fetched_payload jsonb, matched_fields jsonb,   -- which fields cross-checked clean vs. mismatched vs. brochure
  run_at timestamptz nullable
)
```

**The one non-negotiable rule this schema exists to enforce:** the only code path allowed to write to `properties`, `unit_variants`, `unit_areas`, `property_amenities`, `property_specifications` is the publish step of `property_submissions` (status → `published`), executed in one transaction that also writes a `property_revisions` snapshot. No migration, seed, or backfill script may write to these tables directly — this is precisely the rule the old project broke (see [[project-propcompare-relaunch]] in memory / `docs/decisions/`). `rera_fetch_jobs` never writes to `properties` directly either — a RERA mismatch or new fact becomes a `property_submissions` row with `source = rera_scrape`, subject to the same admin approval as any other change.

Field-level provenance (`property_submission_fields`) is what makes "BROCHURE P.12" citations and the Data Reconciliation / Evidence Viewer screens from the Stitch export possible directly off the schema, with no separate audit system needed.

---

## D. Auth & roles

`users`, `sessions`, `accounts`, `verifications` are owned and generated by Better Auth — not redesigned here. Extended by:

```
buyer_profiles      (user_id fk -> users, phone_verified_at nullable)
developer_users     (id, developer_id fk -> developers, user_id fk -> users,
                      title nullable, status enum (active, invited, revoked))
admin_users         (id, user_id fk -> users,
                      permission_level enum (verifier, owner), mfa_enforced boolean default false)
```

`admin_users.mfa_enforced` defaults false and is a schema placeholder, not a v1 requirement — the old project over-invested in staff MFA before the core product worked; the column exists so enforcing it later is a flag flip, not a migration.

---

## E. Buyer experience

```
buyer_intake_sessions (
  id, user_id fk -> users nullable,       -- nullable: intake can start pre-signup
  persona_priorities jsonb,                -- e.g. ["family_space","privacy","location"]
  desired_bhk_type_id fk -> bhk_types nullable,
  budget_min_inr numeric nullable, budget_max_inr numeric nullable,
  city
)

saved_properties     (user_id fk, property_id fk, saved_at)
comparisons           (id, user_id fk nullable)
comparison_items      (comparison_id fk, property_id fk, unit_variant_id fk nullable, display_order)
enquiries             (id, user_id fk, property_id fk, unit_variant_id fk nullable,
                        status enum (new, contacted, closed), message nullable)
dossier_unlocks       (id, user_id fk, property_id fk, otp_verified_at)

reviews (
  id, property_id fk -> properties, user_id fk -> users,
  rating smallint,                                   -- 1-5
  remarks text nullable,
  verification_status review_verification_status,    -- unverified | verified; default unverified
  verification_document_id fk -> source_documents nullable,  -- e.g. a possession_proof upload backing the claim
  verified_by fk -> users nullable,                   -- admin who confirmed it, same pattern as property_submissions.reviewed_by
  verified_at timestamptz nullable
)
```

`buyer_intake_sessions.budget_min_inr`/`budget_max_inr` are the buyer's _stated_ range (used to pick a bucket for matching) — not a property's price. No table in this section ever stores or exposes an actual unit price.

`reviews` is property-level only (no `unit_variant_id`), matching the whiteboard exactly. A review starts `unverified` at submission; `verification_status` flips to `verified` only via an admin action backed by `verification_document_id` (reusing `source_documents`, not a parallel uploads table) — self-declared ratings are never shown as verified. This was flagged as a schema gap on 2026-08-31 (see `DECISIONS.md`) and designed with verification from the start per that decision, not left as a bare star-rating table.

---

## F. Private schema — commercial data (`private`, RLS on, zero policies, service-role only)

```
private.unit_price_history (
  id, unit_variant_id fk -> public.unit_variants,
  price_inr numeric, price_per_sqft numeric nullable,
  effective_from date, effective_to date nullable,   -- null = current
  source enum (developer_submission, admin_manual, rera_extract),
  created_by fk -> users
)
```

Plus a service-role-only view:

```
private.unit_current_bucket AS
  SELECT uv.id AS unit_variant_id, bb.id AS budget_bucket_id
  FROM public.unit_variants uv
  JOIN private.unit_price_history ph ON ph.unit_variant_id = uv.id AND ph.effective_to IS NULL
  JOIN public.budget_buckets bb ON ph.price_inr BETWEEN bb.min_inr AND bb.max_inr
```

The discovery/comparison matching service is the _only_ code path allowed a service-role DB connection into `private`. It uses `private.unit_current_bucket` only for coarse classification; its Phase 3 private matcher evaluates current prices internally against the buyer's inclusive range `[budget_min_inr × 0.80, budget_max_inr × 1.20]` and returns only property/unit-variant ids — never a price or price range. The property detail page shows **no price at all** by default, until the buyer submits an enquiry (per the explicit 2026-08-31 decision; this default may change later).

---

## Honest rating: **8.5 / 10**

**Up from the initial 6.5/10** given after the first pass, now that RERA-on-property (not a separate mirror table), structured location, per-basis area rows, the versioned `property_schema_fields` ingestion contract, and the private-schema budget-bucket mechanism are all locked in. What earns the 8.5 and not higher:

- **Strong:** field-level provenance is a first-class relation, not bolted on; the "one write path into live tables" rule is schema-shaped, not just a code convention; commercial data isolation reuses a pattern the old project already proved out; the versioned schema-fields table turns "don't hoard OCR noise" from a policy into an enforceable join.
- **Real, accepted risk (−1):** `property_submissions.payload` and `property_submission_fields.value` are jsonb — flexible for an evolving field set, but means the DB can't itself enforce "this value matches its declared `data_type`." That check has to live in the application layer (Zod against the schema-contract, generated from `property_schema_fields`). Acceptable for v1, worth a Postgres CHECK/trigger later if jsonb drift ever bites.
- **Deliberately deferred, not a flaw (−0.5):** `unit_variants.variant_name` is still a free-text label rather than a fully normalized composite key; whiteboard Q7's answer ("variant name helps disambiguate") is honored literally, but if two developers reuse "Type A" inconsistently there's no DB-level guarantee of a stable identity across submissions of the same variant — the publish-transaction logic has to resolve "is this the same variant as last time" by property_id + bhk_type_id + variant_name match, which is a judgment call worth revisiting once real submission volume exists.

No dual-schema risk anywhere in this design — everything above has exactly one live representation per entity, which was the old project's root failure mode.

**Not yet built, deliberately out of scope for this document:** developer self-serve submission UI validation rules, the exact publish-transaction implementation, and admin MFA enforcement timing — these are implementation-phase concerns, not schema concerns.
