# Progress

## 2026-09-02 — Phase 2B step 0 complete: UI tooling baseline

**Done:** Installed dependencies and stood up the buyer-UI toolchain.
shadcn/ui was initialized on the Radix base and then reconciled onto the Soft
Daylight palette: the generator had written its own neutral grayscale token set,
bound Geist over Plus Jakarta Sans, set a 10px radius against the documented
8px, and invented a dark theme. Every shadcn semantic token in
`src/app/globals.css` now resolves to a documented Soft Daylight token or a
`color-mix()` tonal layer derived from one, and `src/app/layout.tsx` is back on
Cormorant Garamond + Plus Jakarta Sans. Added a second Vitest project (`ui`,
jsdom + Testing Library, `.test.tsx`) beside the existing node project
(`.test.ts`), which runs unchanged.

**Guardrail:** `--color-verified-gold` staying out of the component palette is
now enforced by `src/app/design-tokens.test.ts` rather than by convention — it
also fails if the generated grayscale palette or a non-8px radius is
reintroduced by a future `shadcn init`.

**Two pre-existing defects found and fixed:** `bun run typecheck` could never
pass on a fresh checkout, because `layout.tsx` uses the generated `LayoutProps`
type from the gitignored `.next/types` and CI has no build step — the script is
now `next typegen && tsc --noEmit`. And with no `.gitattributes`, a Windows
checkout materializes CRLF, failing `format:check` on all 65 files despite
correct formatting; `* text=auto eol=lf` fixes it without changing any stored
content. Separately, the first `bun install` silently produced eight empty
package directories from a corrupted cache, fixed by `bun pm cache rm` and a
clean reinstall.

**Verified:** `bun run format:check`, `bun run lint`, `bun run typecheck`, and
`bun run build` all pass. `bun run test` reports 40 passed across 5 files (33
pre-existing unit tests, 5 new token-contract tests, 2 button smoke tests). The
6 database integration tests still cannot run locally — Postgres is not up and
`DATABASE_URL` is unset — which is unchanged from before this step.

**Deferred deliberately, not silently:** dark mode (Soft Daylight documents no
dark palette, so the invented one was removed rather than kept), `--destructive`
(no documented error colour; a restrained placeholder is flagged in the CSS),
and chart/sidebar tokens (they belong to Phase 4 and admin surfaces).

**Next up:** step 1 — fully specify the two buyer read routes in
`docs/api/api-spec.v1.md`, including resolving the open filter-set decision
gate. No screen work begins before it lands.

## 2026-09-02 — Phase 2B planned; buyer read contract identified as a hard prerequisite

**Done:** Split Phase 2B into an ordered, independently reviewable ten-step
implementation plan
([docs/tasklists/2026-09-02-phase-2b-implementation-plan.md](docs/tasklists/2026-09-02-phase-2b-implementation-plan.md)),
each step taking its own short-lived branch. Recorded three dated `DECISIONS.md`
entries for choices made this session: the buyer read layer is implemented as
real Drizzle queries with fixtures as typed test doubles sharing the same
exported types (superseding the roadmap's fixture-only assumption, which
predated Phase 2A landing); shadcn/ui with Radix is adopted as the buyer
component foundation restyled to Soft Daylight tokens; and buyer UI is tested in
a jsdom Testing Library project alongside the existing node-environment tests.

**Blocker found before writing any code:** both Phase 2B routes
(`GET /api/v1/properties`, `GET /api/v1/properties/{slug}`) exist in
`docs/api/api-spec.v1.md` only as one-line summaries, with no request, response,
pagination, filter, or error semantics. The spec's own contract-change process
requires those to be defined before a consumer starts work, and the roadmap
assumes the read contract is fixed up front. Defining it is therefore step 1 of
the plan, and no screen work begins before it lands.

**Also noted:** `node_modules` is absent, so nothing currently runs until
`bun install`; Soft Daylight tokens are already wired into `src/app/globals.css`
from Phase 0; and three decision gates are open and recorded in the plan — media
delivery for `property_media.gcsPath`, whether `PropScoreDial` ships in 2B, and
the fixed v1 filter set for the listing route.

**Next up:** step 0 (tooling baseline — `bun install`, shadcn/ui, jsdom/Testing
Library) followed by step 1 (the buyer read contract), per the plan.

## 2026-09-01 — Phase 2A submission review and publish transaction completed

**Done:** Implemented the review state machine (`src/lib/submissions/transitions.ts`,
`applySubmissionTransition`) enforcing role-gated actor permissions
(submitter/verifier/owner) and legal `from`-status sets per action, including
owner-only publish and rejection of duplicate publish attempts. Implemented
`publishSubmission` (`src/lib/submissions/publisher.ts`) — the sole
transaction permitted to write `properties`, `unit_variants`, `unit_areas`,
`property_amenities`, and `property_specifications`. It row-locks the
submission, enforces the transition guard, blocks publication while any field
is `needs_review`, discards rejected/inactive fields, validates the remaining
payload against the active field contract, and applies it as an additive
patch: new properties get explicit `not_stated` rows for every unmentioned
catalog item, existing properties leave unmentioned fields, amenities, and
specifications untouched. Unit variants upsert only by exact `variant_name`.
New-property slugs use a deterministic collision suffix
(`src/lib/submissions/slug.ts`) derived from the submission id, pre-checked
via SELECT rather than a caught unique-violation (no mid-transaction
SAVEPOINT). Every publish writes one `property_revisions` snapshot in the
same transaction and writes the validated payload back onto
`property_submissions.payload` as a computed cache.

**Verified:** 10 unit tests cover `transitions.ts`; 14 unit tests cover
`validation.ts` (no DB access, `src/lib/submissions/submissions.test.ts`). 6
integration tests against local Postgres
(`src/lib/submissions/publisher.integration.test.ts`) cover: new-property
publish with catalog backfill; the needs_review block with a no-partial-write
assertion; rejection of a non-approved submission; rejection of a duplicate
publish; an additive-patch update to an existing property with untouched
fields/amenities verified unchanged; and the deferred Phase 1 private budget
bucket mapping proof (inserts into `private.unit_price_history` via the
service-role client, queries the raw `private.unit_current_bucket` view, and
confirms the mapped bucket matches the seeded band). `bun run format:check`,
`bun run lint`, `bun run typecheck`, `bun run test` (39 passed, 4 files), and
`git diff --check` all pass.

**Next up:** wire `publishSubmission` and the transition function to the
actual `/api/v1/admin/submissions/{id}` HTTP routes (currently "Planned" in
`docs/api/api-spec.v1.md`), including auth/session-derived actor role. The
admin review UI and OCR provider adapter remain later Phase 2A/2B work.

## 2026-09-01 — Phase 2A OCR routing and evidence foundation completed

**Done:** Added canonical schema v3 and migration `0003`: OCR status now belongs
to versioned extraction attempts, each attempt retains its human-confirmed page
routing manifest, and submission fields can cite multiple document pages with
JSON value paths. The provider-neutral adapter validates only active contract
fields and guarantees that a confirmed multi-page unit scope produces at most
one unit-variant candidate.

**Legacy boundary:** historical property JSON is comparison-only evidence. It
has no production submission adapter. Every curator-selected brochure will be
rerun through the new pipeline before its output is eligible for reconciliation
or publication.

**Verified:** migration applied locally; Drizzle reports no schema drift;
format, lint, typecheck, nine tests, and `git diff --check` pass. No live catalog
record or private commercial record was written.

**Next up:** continue Phase 2A with a separate task for submission state
transitions, canonical payload validation, and the transactional publish path.
Provider selection, the admin page-routing UI, and RERA integration remain later
Phase 2A tasks.

## 2026-09-01 — Phase 1 lookup catalogs and private budget boundary completed

**Done:** Seeded 26 amenities with 51 controlled synonyms, 13 specifications
with 13 source-field synonyms, and the approved 26-row OCR field contract. No
property, unit, media, or price-history record was seeded.

**Security correction:** schema v2 moves the sole `budget_buckets` table to
`private` and keeps its classifier service-only. The private seed contains 16
fixed bands; the normal app role is denied access, while the service role can
use the classifier. The Phase 3 private ±20% matcher is unchanged.

**Verified:** the migration applied locally; both seeds ran twice with stable
counts; format, lint, typecheck, tests, and migration generation pass. An
app-role private bucket query is denied with PostgreSQL code `42501`; service
access succeeds without returning price data.

**Next up:** Phase 2A implements the submission/publish transaction and OCR
provider adapter. It requires the curator-owned manifest selecting the
confirmed 24 properties; do not reconstruct that set from legacy names or
filenames.

## 2026-09-01 — Legacy OCR corpus audited structurally; lookup seeding remains review-gated

**Done:** Per user authorization, read-only structural analysis covered 27 current and 69 current-plus-historical hashed legacy OCR jobs, excluding PDFs/images and retaining no source records in this repository. The current set has 26 mechanically distinct normalized name-and-city comparisons; all historical jobs produce 28. The user-confirmed usable source set is 24, which cannot be reconstructed safely from that weak identity comparison. The versioned [audit report](docs/data/legacy-ocr-structure-audit.2026-09-01.md) records the reusable evidence envelope, coverage, a candidate OCR contract, and a deliberately conservative amenity/specification taxonomy.

**Important finding:** the amenity extraction is too noisy to seed directly (789 distinct labels in the current jobs) and every current record has legacy `verified=false`. No actual property data, price, media, or catalog relationship was imported or seeded.

**Next up:** review and explicitly approve the catalog taxonomy, synonym mappings, specification keys, budget buckets, and exact `property_schema_fields` contract in [the lookup-data tasklist](docs/tasklists/2026-09-01-lookup-catalog-data.md). A Phase 2 curator-owned source manifest will be required to select the confirmed 24 properties for submission-based ingestion.

## 2026-09-01 — Phase 1 database foundation implemented and locally verified

**Done:**

- Created the full Drizzle implementation of canonical `schema.v1`: lookup tables, public catalog, governance/provenance, Better Auth extensions, buyer records, private price history, native enums, FKs, uniqueness, and indexes.
- Generated and applied the first schema migration plus a tracked follow-up grant migration to a fresh local Postgres 17 database.
- Closed an access-control gap before it became production debt: normal app, admin-migration, and future service-role connections are separate. The normal app role has no `private` schema usage; the dedicated service role has narrowly required `BYPASSRLS` access; `private.unit_price_history` has forced RLS with zero policies.
- Added a security-invoker `private.unit_current_bucket` view and enforced at most one current price per unit variant.
- Added an idempotent lookup seed command and seeded the explicit canonical property types (3), BHK types (6), and layout types (3). Amenity/specification vocabularies, budget buckets, and OCR field definitions are deliberately pending approved source data in a separate Deep-owned tasklist.
- Verified effective role behavior: restricted app role can read public lookups but is denied `private`; service role can query the bucket view; RLS is enabled and forced with zero policies. Added two schema-contract tests.
- Recorded the role-model and no-direct-fixture decisions in `DECISIONS.md`, so the Phase 1 proof does not create an exception to the publish-only catalog rule.

**Verified:** `bun run db:migrate` against fresh local Postgres; `bun run db:seed` twice with stable counts; `bun run format:check`; `bun run lint`; `bun run typecheck`; `bun run test` (2 passing tests); and `bun run db:generate` (no pending schema changes).

**Next up:** Deep completes [lookup catalog data](docs/tasklists/2026-09-01-lookup-catalog-data.md) from approved source material. Phase 2A then implements the publish transaction so a data-bearing private bucket mapping test can use a legitimately published fixture.

## 2026-09-01 — Shared product, API, role-flow, design, and tasklist documentation established

**Done:**

- Added `docs/README.md` as the documentation map, keeping root governance/history files in place and putting collaborative product/delivery documents under `docs/`.
- Added v1 PRD, API specification, buyer/developer/admin app flows, and a screen/component-oriented design guide. Each distinguishes planned behavior from implemented functionality and anchors to the canonical schema/trust boundary.
- Established `docs/tasklists/` as the mandatory implementation-plan checklist location and created the Phase 1 data-layer tasklist.
- Updated `AGENTS.md` so future human/Claude/Codex work creates and completes a linked tasklist; task work uses a short-lived branch, while phase baselines merge/push to `main`.
- Configured the `origin` remote as `https://github.com/pikoruarealty/propcompare.git`.
- Corrected the README's stale pre-scaffolding status by adding an explicit current-status section.

**Next up:** satisfy the local Postgres prerequisite in the Phase 1 tasklist, then begin schema/migration implementation against `docs/schema/schema.v1.md`.

Running log, most recent first. This is a journal, not a status dashboard — entries are appended, not rewritten.

---

## 2026-08-31 — Phase 0 scaffolding complete; roadmap published; schema gap found and closed

**Done:**

- Scaffolded the Next.js (App Router, Turbopack) + Tailwind v4 project with Bun as package manager/runtime, merged into repo root.
- Wired Drizzle ORM (`postgres` driver) and Better Auth (phone-OTP for buyers via the `phoneNumber` plugin, email/password for developer/admin staff), with the Better Auth Drizzle schema auto-generated to `src/db/schema/auth.ts`.
- Wrote `docker-compose.yml` + `docker/postgres-init/01-schemas.sql` for local self-hosted Postgres 17 with `public`/`private` schemas (`private` locked down via `REVOKE ALL ... FROM PUBLIC`, RLS policies deferred to Phase 1 migrations).
- Added lint/format/test tooling (ESLint via `eslint-config-next`, Prettier, Vitest) and a GitHub Actions CI skeleton (`format:check`, `lint`, `typecheck`, `test` on PR/push to main).
- Published `docs/roadmap.md` — the full phase-by-phase build plan with area-of-focus ownership between Bhavarth and Deep, linked from `README.md`.
- Found and closed a real documentation gap: the original whiteboard schema image included a `Reviews` entity and an unlabeled RERA-extract fields block that never made it into `schema.v1.md`'s first pass, and whose earlier resolution had never been written down anywhere — lost to context compaction. Re-derived from a re-shared photo of the whiteboard; resolved and written into `docs/schema/schema.v1.md` and `DECISIONS.md` (2026-08-31, second dated entry): added a `reviews` table (with verification fields, not a bare star-rating table), added RERA-extract project-level columns to `properties` (`rera_project_land_area_sqft`, `rera_carpet_area_range_min_sqft`/`_max_sqft`, `rera_construction_progress_percent`), and split layout forms (Penthouse/Duplex) into a new `layout_types` lookup separate from `bhk_types`.
- Reviewed an externally-produced VC/strategy report on the business; extracted two concrete future-schema candidates (verified reviews — now designed above; developer reputation/delivery-timeline tracking — still a Phase 2A+ candidate, not yet scheduled) and discarded the rest (TAM/SAM/SOM sizing, brand-naming, GTM sequencing) as non-engineering-actionable.

**Verified:** `bun run format:check`, `bun run lint`, `bun run typecheck`, and `bun run test` (via CI-equivalent scripts) all pass clean against the current tree.

**Not yet done / blocked:**

- Local Postgres has not been brought up — Docker Desktop's engine isn't running on this machine, and starting/diagnosing it was left to the user rather than done autonomously. Until it's up, the Better Auth API route and DB connection are unverified end-to-end (typecheck-only verification so far).
- Nothing has been committed to git yet — all Phase 0 files are untracked as of this entry.
- Phase 1 (Drizzle translation of `schema.v1.md`, first migration, `private` schema RLS policies, lookup seed data) has not started.

**Next up:** bring up local Postgres (user-directed), verify Better Auth end-to-end against it, make the first git commit, then start Phase 1 per `docs/roadmap.md`.

---

## 2026-08-31 — Project restarted from scratch; foundational decisions locked; repo documentation started

**Done:**

- Confirmed this is a ground-up rebuild of `pikorua-luxe-compare` (old project, stalled after ~5.5 weeks) — old code/schema/UI treated as requirements/lessons only, not reused.
- Locked tech stack: Next.js (App Router), Drizzle, self-hosted PostgreSQL, Better Auth, GCS.
- Locked v1 scope: full three-role platform (buyer / developer / admin), sequenced buyer-first (buyer experience + admin-run OCR ingestion ship before the developer self-serve portal).
- Locked geography (Ahmedabad/Gujarat only) and broadened target market (regular-to-ultra-luxury, up from luxury-only).
- Reviewed a Stitch UI export (16 screens + 2 design-token specs); resolved a role-mapping ambiguity (developer portal and admin/verification portal are separate surfaces, not one shell) and picked the canonical design-token spec ("Soft Daylight" v2 — Cormorant Garamond + Soft Gold verified badges).
- Walked through the user's whiteboard core-property-catalog schema, resolved all 10 open questions, and produced a finalized v1 schema covering the full system: core catalog, governance/ingestion (submission + provenance model), auth/roles, buyer experience, and a private/RLS-isolated commercial-data schema for budget bucketing. Rated 8.5/10 with two named, accepted risks.
- Initialized the git repository (`main` branch) and wrote the first documentation set: `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `AGENTS.md`, `docs/schema/schema.v1.md`, `docs/design/design-tokens.md`.

**Decisions made this session:** see `DECISIONS.md` (all dated 2026-08-31).

**Not yet done:**

- No code written yet — no Next.js app, no Drizzle schema files, no migrations.
- Auth/developer/admin/submission-workflow schema exists only as a written design (`docs/schema/schema.v1.md`), not yet implemented in Drizzle.
- No initial git commit yet (docs written but uncommitted as of this entry).
- Full role-by-role screen mapping across the Stitch export was resolved at a summary level, not screen-by-screen exhaustively (a few near-duplicate screens were never opened, per the user's own note that duplicates exist).
- OCR pipeline, RERA scrape job, and the discovery/comparison matching service are all designed on paper only — no implementation.

**Next up:** scaffold the Next.js + Drizzle project structure, translate `docs/schema/schema.v1.md` into actual Drizzle schema files and a first migration, and stand up the local self-hosted Postgres (Docker) environment.
