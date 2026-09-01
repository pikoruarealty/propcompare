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

---

**Still open, not yet decided:** admin MFA enforcement timing (schema has the flag, default off); exact publish-transaction implementation; developer self-serve submission UI validation rules; whether `unit_variants.variant_name` needs a stronger identity guarantee across resubmissions (flagged as a known risk in `docs/schema/schema.v1.md`, deferred rather than solved).
