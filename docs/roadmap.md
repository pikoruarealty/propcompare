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

- `property_submissions` / `property_submission_fields` / `property_revisions` implementation.
- The publish transaction — the one write path into live catalog tables.
- OCR provider integration against `property_schema_fields` (provider choice tracked as a dated `DECISIONS.md` entry once made).
- `rera_fetch_jobs` scrape job and cross-check logic.
- Admin UI: submission queue, Data Reconciliation screen (field + OCR confidence + source page + confirm/edit).

## Phase 2B — Buyer UI against a fixed contract (parallel with 2A)

**Area of focus: Deep**, against a read API/query contract for published properties that Bhavarth defines up front so this can proceed against fixtures without waiting on 2A's writers.

- Landing page, property dossier (detail) page, browse/listing grid, guided-intake flow UI (persona priorities, budget range capture) — all built to `docs/design/design-tokens.md`.

**Acceptance (2A + 2B convergence):** a handful of real properties, approved through the actual publish transaction, render correctly on the buyer pages built against fixtures.

---

## Phase 3 — Integration & core buyer flows

**Area of focus: Bhavarth** — the discovery/comparison budget-range matching service (the only code path with a service-role connection into `private`), implementing the documented inclusive ±20% range without returning price data. See [its tasklist](tasklists/2026-09-01-phase-3-budget-range-matching.md).

**Area of focus: Deep** — wire the built UI to real endpoints: comparison feature, saved properties, dossier-unlock phone-OTP gate, enquiry submission, following the contracts Bhavarth defines.

**Acceptance:** a buyer can browse, get intake-matched results from the inclusive ±20% private budget-range matcher (no price ever rendered), compare, save, unlock a dossier via OTP, and submit an enquiry — end to end on real data.

---

## Phase 4 — Developer self-serve portal

**Area of focus: Deep** for the portal build; **Bhavarth** defines the auth/permission boundaries and reviews.

- `developer_users` auth flow, portfolio/analytics dashboard, submission form UI that produces `property_submissions` rows — same trust boundary as admin ingestion, no shortcut path.

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
