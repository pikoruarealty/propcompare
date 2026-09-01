# Progress

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
