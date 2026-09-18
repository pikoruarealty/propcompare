# Roadmap

Phase-by-phase plan for building PropCompare, with area-of-focus ownership between the two developers on this project: Bhavarth and Deep. This is a living document — update it as phases complete or scope shifts, per `AGENTS.md`.

Phases 2A and 2B run in parallel once Phase 1 lands, so both developers are working at the same time rather than serialized.

---

## Phase 0 — Scaffolding

**Area of focus: Bhavarth**, with Deep able to pick up pieces once the structure exists.

- Next.js (App Router) project init, Tailwind wired to `docs/design/design-tokens.md` tokens (colors, fonts, spacing, radius).
- Drizzle config, Docker Compose for local self-hosted Postgres (`public` + `private` schemas, RLS enabled on `private` with zero policies per `ARCHITECTURE.md`).
- Better Auth wired for phone-OTP (buyer) and email/password (developer/admin staff).
- Lint/format/test tooling (ESLint, Prettier, Vitest), CI skeleton (format, lint, typecheck, test on PR).

**Acceptance:** `bun dev` runs a blank Next.js app against local Postgres; no live catalog tables exist yet, so the one-write-path rule in `AGENTS.md` has nothing to violate yet.

---

## Phase 1 — Data layer

**Execution tasklist:** [2026-09-01 Phase 1 data layer](tasklists/2026-09-01-phase-1-data-layer.md).

**Area of focus: Bhavarth** — translate `docs/schema/schema.v1.md` into Drizzle schema files, generate the first migration, stand up the `private` schema + RLS, write the seed script for lookup tables (`property_types`, `bhk_types`, `layout_types`, `amenity_catalog` + synonyms, `specification_catalog` + synonyms, `budget_buckets`, `property_schema_fields`).

**Area of focus: Deep** — once table shapes exist, populate seed _data_ for the catalogs (amenity/spec lists, budget bucket ranges) against the fixed schema.

**Acceptance:** migrations run clean; seed scripts populate lookup tables from approved source data; effective role/RLS checks prove the normal app connection cannot access `private` while the service role can resolve `private.unit_current_bucket`. A data-bearing current-price-to-bucket proof uses a published fixture created by the Phase 2 publish transaction — never a direct catalog insert.

---

## Phase 2A — Admin ingestion & the trust boundary

**Area of focus: Bhavarth.**

- `property_submissions` / `property_submission_fields` / `property_revisions` implementation. **Done.**
- The publish transaction — the one write path into live catalog tables. **Done.**
- Versioned, human-confirmed brochure page routing before paid OCR; multi-page
  unit scopes and many-page field evidence follow schema v3. **Done.**
- OCR provider integration against `property_schema_fields` (provider choice tracked as a dated `DECISIONS.md` entry once made). **Done.**
- Legacy-vs-new OCR evaluation reports remain comparison-only; every selected
  brochure is rerun through the new pipeline before submission review. **Done.**

**Status: library/pipeline layer complete; no UI exists yet, and the phase's definition of done has grown.** A 2026-09-18 status audit found the local catalog completely empty and found that no UI anywhere in this codebase can create a property — the only path that has ever worked is a maintainer running a one-off script. See the 2026-09-18 `DECISIONS.md` entry: the developer self-serve upload/review flow (originally Phase 4) is pulled forward and merged into finishing this phase, since Phase 2A's own admin review step was always designed to be agnostic to whether an admin or a developer created the submission (`docs/app-flows/admin.md` step 9). **What's left to finish this phase**, in flow order, tracked in [the Phase 2A completion tasklist](tasklists/2026-09-18-phase-2a-completion.md):

1. Login/signup UI (buyer phone-OTP, staff email/password) — Better Auth already implements both; no screen exists for either.
2. The developer portal's upload → page-routing confirmation → OCR-draft review → submit flow (`docs/app-flows/developer.md`), pulled forward from Phase 4.
3. The admin submission-queue, field-by-field reconciliation, approve, and publish UI (`docs/app-flows/admin.md`), wiring the already-implemented `publishSubmission`/`applySubmissionTransition` library functions to real routes and screens.
4. `rera_fetch_jobs` scrape job and cross-check logic — schema exists, no implementation, no tasklist yet.

**Explicitly deferred, the one item staying out of scope:** the human field-level OCR accuracy spot-check on the Adani Amaris and Kimana Towers brochures (`docs/tasklists/2026-09-02-ocr-provider-integration.md`'s sole unchecked line). It becomes easier once the reconciliation UI above exists, so it's left for after rather than blocking this work.

## Phase 2B — Buyer UI against a fixed contract (parallel with 2A)

**Execution plan:** [2026-09-02 Phase 2B implementation plan](tasklists/2026-09-02-phase-2b-implementation-plan.md) — ten ordered steps, one branch each.

**Area of focus: Deep**, against a read API/query contract for published properties that Bhavarth defines up front. That contract is step 1 of the execution plan and blocks all screen work.

- Landing page, property dossier (detail) page, browse/listing grid, guided-intake flow UI (persona priorities, budget range capture) — all built to `docs/design/design-tokens.md`.
- Since Phase 2A landed first, the read layer is now built as real Drizzle queries rather than fixtures alone, with fixtures kept as typed test doubles — see the 2026-09-02 entry in `DECISIONS.md`.

**Acceptance (2A + 2B convergence):** a handful of real properties, approved through the actual publish transaction, render correctly on the buyer pages built against fixtures.

**Status: complete 2026-09-07.** All ten steps landed on `task/phase-2b`. The buyer surface is `/` (landing, with a recently-published strip), `/properties` (browse and filters), `/properties/{slug}` (dossier, ISR), and `/intake` (guided intake), over a typed read layer and two public read routes. Acceptance was met by publishing five properties through `publishSubmission` — three possession statuses, three property types, single- and multi-basis areas, a plot with no unit variants, and one deliberately sparse record — and confirming every buyer page renders them against the real read layer with zero price leaks. Deferred out of the phase with dated decisions: media delivery, `PropScoreDial`, and dark mode. See the [implementation plan](tasklists/2026-09-02-phase-2b-implementation-plan.md) for the per-step record.

---

## Phase 3 — Integration & core buyer flows

**Area of focus: Bhavarth** — all backend for this phase: the discovery/comparison budget-range matching service (the only code path with a service-role connection into `private`) and the four remaining buyer API routes (`saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks`). See [the matching-service tasklist](tasklists/2026-09-01-phase-3-budget-range-matching.md), [the discovery/matches endpoint tasklist](tasklists/2026-09-18-discovery-matches-endpoint.md), and [the buyer-account routes tasklist](tasklists/2026-09-18-buyer-account-routes.md).

**Status (Bhavarth's piece): all backend complete 2026-09-18.** `src/lib/matching/budget-range.ts` implements the inclusive `[min × 0.80, max × 1.20]` matcher against `private.unit_price_history`; `POST /api/v1/discovery/matches` wires it into a stateless, price-free buyer response; and `saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks` (`src/app/api/v1/`, backed by `src/lib/buyer/`) round out the rest of the buyer API, each requiring a session and scoped to the caller's own `userId`. Boundary, role-denial, ownership-scoping, and no-leak behavior are all verified by database-backed tests; see `PROGRESS.md`'s 2026-09-18 entries. Nothing remains open on the backend side of this phase.

**Area of focus: Deep** — wire the built UI to the real endpoints Bhavarth defines and builds: comparison feature, saved properties, dossier-unlock phone-OTP gate, enquiry submission, plus pointing `/intake`'s handoff at `POST /api/v1/discovery/matches` instead of the placeholder `/properties` link it uses today. Deep owns no backend route in this phase. Each slice needs its own scoped tasklist per `docs/tasklists/README.md` before implementation starts.

**Status (Deep's piece): the intake→matches wiring is complete 2026-09-18** ([its tasklist](tasklists/2026-09-18-intake-matches-ui.md)). `/intake`'s summary step now POSTs the stated range and renders matched properties in place — inside `/intake`, because no mechanism available today could carry the range to a separate address. The slider's "₹5 crore or more" sends `maxUnbounded: true` and is resolved against the catalog's own maximum, so the open end is genuinely open; the interim ceiling this slice shipped with lasted only until Bhavarth's contract change landed the same day. The remaining UI slices (comparison, saved properties, the OTP gate, enquiry submission) are now unblocked — all four routes exist as of 2026-09-18 — and each needs its own tasklist before implementation.

**Acceptance:** a buyer can browse, get intake-matched results from the inclusive ±20% private budget-range matcher (no price ever rendered), compare, save, unlock a dossier via OTP, and submit an enquiry — end to end on real data.

---

## Phase 4 — Developer portfolio/analytics (narrowed 2026-09-18)

**Area of focus: Deep** for the portal build; **Bhavarth** defines the auth/permission boundaries and reviews.

The submission-creating half of the developer portal (upload, page routing, OCR-draft review, submit) moved to finishing Phase 2A — see the 2026-09-18 `DECISIONS.md` entry. What's left here, once a developer account can already sign in and submit:

- Portfolio/analytics dashboard (`GET /api/v1/developer/portfolio`) — completeness and interest analytics over the developer's own properties, no editorial or publishing authority.

---

## Phase 5 — Polish & production readiness

**Area of focus: Bhavarth.**

- Admin MFA enforcement flip (`admin_users.mfa_enforced`), observability/monitoring, SEO/ISR tuning on property pages, deployment hardening, backups.

---

## Working flow

- **Branching:** short-lived feature branches per task, PRs into `main`. Anything touching schema, the `private` schema, auth, or the publish transaction gets Bhavarth's review regardless of author.
- **Task tracking:** GitHub Issues/Projects, organized by the phases above.
- **Docs stay live:** `PROGRESS.md` updated as phases/tasks complete; new architectural calls get a dated `DECISIONS.md` entry when made, not reconstructed later.
- **AI agent usage:** both developers use Claude Code/Codex; `AGENTS.md` is the shared contract that keeps schema, auth, and the trust boundary from diverging across tracks — check it before introducing a new table or pattern.

## Open items to resolve before their phase starts

- OCR provider/service choice, needed before Phase 2A's extraction work.
- Confirm the repo host (this plan assumes GitHub for Issues/Projects).
