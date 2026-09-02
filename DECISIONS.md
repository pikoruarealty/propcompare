# Decisions

Lightweight ADR log. Every decision that would be expensive to silently reverse gets an entry here, in order, never edited after the fact — a later decision that changes an earlier one adds a new entry and marks the old one superseded. This exists because the prior attempt at this product (`pikorua-luxe-compare`) pivoted infrastructure (Supabase → self-hosted Postgres) with no decision record, discovered only via a panicked migration 4 days before development stalled. See `docs/postmortem-2026-08.md` if/when that debrief is written up in full.

Format: **Date — Decision.** Context. Why. Alternatives considered.

---

**2026-08-31 — Rebuild from scratch; old project (`pikorua-luxe-compare`) is requirements/lessons only, not a template.**
Context: prior attempt stalled after ~5.5 weeks. Why: its own final handoff note recommended exactly this; root failure was two live schemas of the same entity coexisting and diverging, not a fixable code issue. Alternatives: fork and refactor — rejected, the dual-schema wound was structural.

**2026-08-31 — Full three-role platform (buyer / developer / admin), sequenced buyer-first.**
Buyer experience + admin-run OCR ingestion ship first; developer self-serve submission portal ships later. Why: brochures + GujRERA are the only data sources available, so an ingestion pipeline is required from day one regardless — but a developer-facing UI for it is not required to launch to buyers.

**2026-08-31 — Self-hosted PostgreSQL, own VM/Docker (not managed/hosted DB).**
Matches the old project's own concluded-correct infra choice, made independent of this decision.

**2026-08-31 — Next.js (App Router) over TanStack Start for the frontend.**
Why: SEO/ISR maturity matters for organic search on property pages; Next.js has far greater representation in AI-agent training data, reducing hallucination risk with two AI coding agents (Claude Code + Codex) writing this codebase in parallel. Drizzle ORM, Better Auth, and Google Cloud Storage for media all carried forward unchanged from the old stack.

**2026-08-31 — OCR ingestion targets a predefined, versioned field schema; anything outside it is discarded, not stockpiled.**
Reacting directly to the old project's outcome: 824 fields flagged for review against only 315 auto-accepted. Enforced in schema via `property_schema_fields` (see `docs/schema/schema.v1.md`) — the OCR pipeline extracts only what's listed there.

**2026-08-31 — GujRERA data is fetched via a structured scrape/fetch job and used only as an independent cross-check against brochure OCR — never blanket "verified" badging.**
A `rera_fetch_jobs` row that disagrees with a brochure becomes a new `property_submissions` row (source = `rera_scrape`), subject to the same admin approval as any other change — RERA fetches never write live data directly.

**2026-08-31 — Geography fixed to Ahmedabad/Gujarat only; target buyers broadened from ultra-luxury-only to the full regular-to-ultra-luxury spectrum; property types fixed to Apartment / Bungalow / Plot (lookup table, softly extensible).**
Location is still modeled as structured fields (city, locality, lat/long, pincode) rather than free text, to support map/locality search later without a schema change now.

**2026-08-31 — Exact unit prices are never shown in the app. Price data exists only to bucket properties against a buyer's stated budget during discovery/comparison matching.**
On the property detail page specifically, the default is **zero price shown at all**, until the buyer submits an enquiry — stricter than "show a bucket." Commercial data (`unit_price_history`) lives in a separate `private` Postgres schema, RLS enabled with zero policies (deny-by-default, service-role only), reusing the old project's validated isolation pattern. Buyer-facing bucket matching reads only a derived `private.unit_current_bucket` view via a single service-role code path — no other code path may query `private`. Default may change later per explicit product decision, not silently.

**2026-08-31 — Developer portal and admin/verification portal are two separate, distinctly-permissioned interfaces, not one shell gated by role.**
Context: the Stitch UI export's "Editorial Desk" shell conflated developer-portfolio-analytics and admin-OCR-verification into one sidebar; on inspection this was generation noise (Stitch reusing a convenient shell across unrelated concepts), not an intentional merged design. Decided to build them as genuinely separate surfaces with separate permission models, matching the draft→submit→approve→publish trust boundary where a developer must never have review/approve capability over their own submissions.

**2026-08-31 — Design system: "Soft Daylight" v2 (Cormorant Garamond + Plus Jakarta Sans, Soft Gold reserved for Verified badges) is canonical.**
Two competing token specs existed in the Stitch export; v2 was chosen because the actual reviewed screens (gold-toned RERA Verified badge) matched it, and it includes the more developed component set (PropScoreDial, evidence-viewer treatment). Full tokens: `docs/design/design-tokens.md`.

**2026-08-31 — One canonical write path into live catalog tables: the `property_submissions` publish transaction. No migration/seed/backfill script may write to `properties` or its child tables directly.**
This is the direct fix for the old project's root failure: a backfill script called the "V2 publish" path directly, bypassing developer review and admin approval entirely. Schema-enforced via `property_revisions` (a snapshot is written every time, in the same transaction, as an audit trail); process-enforced via `AGENTS.md` for any human or AI contributor.

**2026-08-31 — Original whiteboard schema image included a `Reviews` entity and an unlabeled RERA-extract fields block; neither made it into `schema.v1.md`'s first pass, and their resolution wasn't written down anywhere. Re-derived from a re-shared photo of the whiteboard and closed out here.**
Context: this is a direct instance of the failure mode `AGENTS.md` line 20 exists to prevent — the earlier resolution of these fields happened in conversation and was never given a dated entry, so it was lost to context compaction and had to be re-derived from the original whiteboard photo. Resolutions, applied to `docs/schema/schema.v1.md`:

- `reviews` table added (property-level, not unit-variant-level, matching the whiteboard exactly: `id, property_id, user_id, rating, remarks`) — extended with verification fields (`verification_status`, `verification_document_id` reusing `source_documents`, `verified_by`, `verified_at`) rather than shipped as a bare star-rating table, per the explicit decision to build in verification from day one rather than defer it.
- The whiteboard's unlabeled blue-ink block (`rera_id?, progress?, project_land_area, carpet_area_range, amenities{}, builder_details{}, total_units, total_towers, project_status`) is RERA-extract data at the project level. `total_units`/`total_towers`/`possession_date` were already columns on `properties`; `amenities{}` and `builder_details{}` are already covered by `property_amenities` and `developers` respectively (not duplicated); `project_status` maps to the existing `possession_status` enum. The two genuinely new facts — `project_land_area` and `carpet_area_range` — plus `progress` (construction completion %) are added as new nullable `properties` columns (`rera_project_land_area_sqft`, `rera_carpet_area_range_min_sqft`/`_max_sqft`, `rera_construction_progress_percent`), populated only when `rera_registered` is true, consistent with whiteboard Q1's "RERA fields live directly on `properties`" resolution.
- The whiteboard's `Configurations` entity named layout forms (Penthouse, Duplex) alongside N-BHK counts. `bhk_types` stays bedroom-count-only; a new `layout_types` lookup was added instead of overloading `bhk_types`, and `unit_variants` now carries both `bhk_type_id` and `layout_type_id` independently (a unit can be a 3BHK duplex, for example).

Why this entry is longer than usual: it exists specifically to make sure this exact loss doesn't happen again — anyone re-deriving these fields from a whiteboard photo in the future should find them here first.

**2026-09-01 — Private-schema access uses separate PostgreSQL app and service roles.**
Context: PostgreSQL table owners bypass row-level security by default. The initial local `DATABASE_URL` used the Docker bootstrap/owner role, so RLS with zero policies would not actually prevent regular application code from reading exact prices. Resolution: the normal application connection is `propcompare_app`, which receives public-schema privileges and no `private` schema usage; migrations use the non-runtime `propcompare` admin role; the future discovery/comparison service alone uses `propcompare_service`, a narrowly reserved `BYPASSRLS` role. `private` tables have RLS enabled and forced with zero policies. Why: preserves the already-decided rule that exact prices never reach ordinary app code while using PostgreSQL's own enforcement rather than a convention. Alternatives: retain one owner connection and rely on code discipline — rejected because it defeats the stated RLS boundary.

---

**2026-09-01 — Phase 1 does not use a direct catalog fixture to test the private bucket mapping.**
Context: `private.unit_price_history` correctly requires an existing published `unit_variants` row. Creating that row with a seed script, migration, or direct SQL insert would violate the one-write-path rule before the Phase 2 publish transaction exists. Resolution: Phase 1 verifies the view definition and effective role/RLS boundary; an end-to-end current-price-to-bucket mapping test is deferred until Phase 2 can create a fixture through `property_submissions` publication. Why: a test convenience cannot become an exception to the project’s primary trust boundary. Alternatives: direct temporary catalog insertion or a special test backdoor — rejected.

---

**2026-09-01 — V1 uses a concise, buyer-facing amenity catalog; uncommon or ambiguous brochure items remain review-only.**
Context: the legacy OCR audit found 789 distinct amenity labels, including facilities mixed with room details, measurements, marketing language, and nearby-place claims. Resolution: seed a deliberately limited set of roughly 20–30 buyer-useful facility concepts and their approved synonyms; do not create a new filter simply because it occurs in a brochure. Unmatched text remains source-review material and may later justify a catalog addition through an explicit product decision. Why: useful discovery filters need stable, comparable meanings. Alternative: reproduce every brochure label as an amenity — rejected because it would turn the catalog into an unfilterable, inconsistent free-text mirror.

---

**2026-09-01 — Access and safety facilities are buyer-facing amenity filters in V1.**
Resolution: include security, visitor parking, and service lift in the concise amenity catalog, subject to the same normalized-key and synonym rules as other amenities. Why: they are buyer-relevant and comparable across properties. They are not treated as decorative marketing claims or inferred when absent.

---

**2026-09-01 — V1 amenity catalog size is not capped; canonical normalization, not a numerical limit, prevents duplicates.**
Context: the earlier concise-catalog decision used a rough 20–30-item starting scope. The product direction is now to retain as many meaningful amenities as are useful, provided their names remain consistent. Resolution: the approved 26-item list is an initial seed, not a ceiling. Each meaningful facility receives one lowercase `snake_case` key and one buyer-facing label; casing, spacing, punctuation, and approved wording variants map through `amenity_synonyms`. A new semantic concept may be added only through a documented catalog review, never automatically from an unmatched OCR string. Non-amenity room details, counts, measurements, brands, nearby places, and marketing claims remain excluded. This supersedes only the numerical cap in the 2026-09-01 concise-catalog decision.

---

**2026-09-01 — Buyer budget matching uses an inclusive ±20% expansion of the buyer's stated range.**
Resolution: for buyer range `[min, max]`, the Phase 3 service matches current unit prices in `[min × 0.80, max × 1.20]`, inclusive. Thus ₹3–4 crore matches ₹2.4–4.8 crore. The calculation and exact prices remain entirely in the private service-only path; it returns only property/unit identifiers, never a price or derived price range. The existing `private.unit_current_bucket` view remains a coarse classification aid, but the earlier adjacent-bucket candidate-selection approach is superseded because it cannot guarantee this tolerance. The precise service-only matcher receives its own Phase 3 tasklist and review.

---

**Still open, not yet decided:** admin MFA enforcement timing (schema has the flag, default off); exact publish-transaction implementation; developer self-serve submission UI validation rules; whether `unit_variants.variant_name` needs a stronger identity guarantee across resubmissions (flagged as a known risk in `docs/schema/schema.v1.md`, deferred rather than solved).

---

**2026-09-01 — Budget-bucket bounds move from `public` to `private`; v1 uses fixed internal bands.**
Context: `budget_buckets` was initially a public lookup, and the normal application role can read all public tables. That contradicts the approved rule that price bounds must never appear in public schema or buyer-facing output. Resolution: schema v2 moves the sole `budget_buckets` table to `private`; the security-invoker `private.unit_current_bucket` joins it internally, and only the dedicated service role may read the resulting classification. The controlled admin seed path owns the initial fixed magnitude bands. Ranges are lower-inclusive and upper-exclusive to prevent overlapping classifications at a boundary. The Phase 3 ±20% private matcher is unchanged and remains the authoritative buyer-range matcher.

---

**2026-09-01 — Brochure OCR is routed by a human-confirmed, versioned page manifest before paid extraction.**
Context: brochure page boundaries are not unit-variant boundaries. A penthouse or duplex may span lower-floor, upper-floor, and terrace pages, while a brochure may also contain many pages irrelevant to the approved extraction contract. Resolution: cheap PDF text-layer inspection may suggest page scopes, but an uploader must confirm the routing manifest before extraction. A confirmed unit-variant scope contains one proposed variant identity and one or more ordered pages; the OCR adapter must return at most one variant candidate for that scope. Multiple pages therefore remain evidence for one proposed canonical `unit_variants` item rather than becoming separate variants. The routing manifest is stored with a pipeline and field-contract version on the OCR attempt and becomes immutable once queued. It is processing metadata only and never writes to the live catalog. Why: this reduces paid page processing and prevents document layout from silently defining catalog identity. Alternatives: OCR the entire brochure and infer grouping afterward, or treat every floor-plan page as a separate variant — rejected as costly and structurally unreliable.

---

**2026-09-01 — Historical OCR JSON is evaluation evidence only; every selected brochure is reprocessed through the new pipeline.**
Context: the existing property JSON files were produced by the retired pipeline and may contain exactly the grouping and normalization errors the new flow is intended to prevent. Resolution: historical output may be normalized into a derived comparison report against a new run, but it cannot create `property_submissions`, `property_submission_fields`, or live catalog data. The selected curator-owned brochure set will be processed again with one versioned pipeline/field contract so all reviewable submissions share the same structure. Disagreements are evaluation findings for admin review, not precedence rules in favor of either output. Why: importing historical JSON would preserve old structural errors and create two ingestion authorities. Alternative: reuse apparently complete historical results and rerun only failures — rejected because completeness does not establish structural consistency.

---

**2026-09-01 — Submission-field provenance is one-to-many evidence; OCR attempt status belongs to attempt rows, not source documents.**
Context: `property_submission_fields.source_page` can cite only one page, but one field—especially the `unit_variants` array—may depend on several brochure pages. `source_documents.ocr_status` also cannot truthfully represent retries or pipeline-version comparisons. Resolution: schema v3 replaces the scalar source-document/page/snippet columns with `property_submission_field_evidence`, whose rows cite a document page and optional JSON value path. It adds versioned `ocr_extraction_jobs`, each holding its confirmed routing manifest and attempt status, and removes aggregate OCR status from `source_documents`. Why: provenance and retry history become reproducible without duplicating a property or variant entity. Alternative: place page arrays inside field values or keep both document and attempt statuses — rejected because those approaches mix provenance into canonical values or create two live statuses for one process.

---

**2026-09-01 — Builder profiles exist independently from builder staff accounts; admin-run ingestion precedes self-serve onboarding.**
Context: the initial catalog will be curated by admins from builder brochures, including builders that have no account on PropCompare. Later, builders should upload, map pages, review their own OCR draft, and submit it for independent admin approval. Resolution: `developers` is the sole canonical builder/company profile and can be created or selected by an admin without a user account. A future `developer_users` invitation links an authenticated staff user to that existing profile; it never creates a second builder record. New-property submissions store the selected canonical developer profile separately from the raw, evidence-backed `developer.name` OCR field. Initially an owner admin may create, review, approve, and publish an admin-run submission, with all actions audited. Once builder staff are onboarded, they may create and submit drafts only; an admin retains approval and publish authority. Why: the initial data-collection workflow works without fake accounts, while the future portal has a clear ownership boundary. Alternatives: require every builder to sign up before curation, or use OCR spelling as a developer identity — rejected because both block reliable initial ingestion.

---

**2026-09-01 — Published-property updates are additive patches; omission never deletes brochure facts.**
Context: a later brochure often contains only a subset of a property’s facts, and OCR absence means “not found in this selected evidence,” not “not offered” or “no longer exists.” Resolution: on an existing property, a submission updates only the canonical fields it explicitly carries. Present amenities and specifications add or update evidence-backed facts; omitted ones stay unchanged. Present unit variants upsert only by exact reviewed `variant_name`; a new name adds a variant. Automatic variant deletion, renaming, or fuzzy matching is forbidden in v1 and requires an explicit future review action. A new property receives `not_stated` rows for unmentioned controlled catalog items, while explicitly extracted items become `available`; automatic negative claims are never inferred. Why: preserves catalog integrity while allowing new brochures to improve it incrementally. Alternatives: treat every brochure as a complete replacement or infer removals from missing OCR — rejected because either can silently erase correct published data.

---

**2026-09-01 — Submission review permissions and slug generation are fixed for Phase 2A.**
Resolution: a submitter moves a draft or changes-requested submission to `submitted`; an admin verifier or owner may move it into review and issue changes, rejection, or approval; only an owner may publish an approved submission. The initial owner-admin workflow may have the same actor in each step, but every transition remains timestamped and attributable. New properties receive a normalized name-derived slug; on a uniqueness conflict, the publisher appends a deterministic short suffix derived from the submission id and retries inside the transaction. Why: early operation remains practical without weakening the future separation between builder submitters and admin publishers.
