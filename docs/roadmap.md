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

**Status: complete.** Login/signup UI, the developer portal's submission-creating half (on hold for developer-facing exposure per the 2026-09-20 owner decision, but the library/routes exist), the admin submission-queue/reconciliation/approve/publish UI, and the `rera_fetch_jobs` scrape/quarterly-refresh worker (`docs/tasklists/2026-09-20-close-phase-2a.md`, built and verified 2026-09-20) are all built. This entry was last accurate as of 2026-09-18 and understated progress since; see `PROGRESS.md` for the day-by-day record.

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

> **Priority (2026-09-20): the comparison experience comes first.** It is the product's reason to exist (`AGENTS.md`, `docs/design/comparison.v1.md`). It was listed below as one of Deep's slices and never got a screen (only the stored-comparison API exists), which hid how central it is. It is now the first Phase 3 deliverable, ahead of saved properties, the OTP gate and enquiries. Tasklist: [the comparison experience](tasklists/2026-09-20-comparison-experience.md).

**Area of focus: Bhavarth** — all backend for this phase: the discovery/comparison budget-range matching service (the only code path with a service-role connection into `private`) and the four remaining buyer API routes (`saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks`). See [the matching-service tasklist](tasklists/2026-09-01-phase-3-budget-range-matching.md), [the discovery/matches endpoint tasklist](tasklists/2026-09-18-discovery-matches-endpoint.md), and [the buyer-account routes tasklist](tasklists/2026-09-18-buyer-account-routes.md).

**Status (Bhavarth's piece): all backend complete 2026-09-18.** `src/lib/matching/budget-range.ts` implements the inclusive `[min × 0.80, max × 1.20]` matcher against `private.unit_price_history`; `POST /api/v1/discovery/matches` wires it into a stateless, price-free buyer response; and `saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks` (`src/app/api/v1/`, backed by `src/lib/buyer/`) round out the rest of the buyer API, each requiring a session and scoped to the caller's own `userId`. Boundary, role-denial, ownership-scoping, and no-leak behavior are all verified by database-backed tests; see `PROGRESS.md`'s 2026-09-18 entries. Nothing remains open on the backend side of this phase.

**Area of focus: Deep** — wire the built UI to the real endpoints Bhavarth defines and builds: comparison feature, saved properties, dossier-unlock phone-OTP gate, enquiry submission, plus pointing `/intake`'s handoff at `POST /api/v1/discovery/matches` instead of the placeholder `/properties` link it uses today. Deep owns no backend route in this phase. Each slice needs its own scoped tasklist per `docs/tasklists/README.md` before implementation starts.

**Status (Deep's piece): the intake→matches wiring is complete 2026-09-18** ([its tasklist](tasklists/2026-09-18-intake-matches-ui.md)). `/intake`'s summary step now POSTs the stated range and renders matched properties in place — inside `/intake`, because no mechanism available today could carry the range to a separate address. The slider's "₹5 crore or more" sends `maxUnbounded: true` and is resolved against the catalog's own maximum, so the open end is genuinely open; the interim ceiling this slice shipped with lasted only until Bhavarth's contract change landed the same day. The remaining UI slices (comparison, saved properties, the OTP gate, enquiry submission) are now unblocked — all four routes exist as of 2026-09-18 — and each needs its own tasklist before implementation.

**Status update 2026-09-21:** comparison slices 2 and 3 (room by room, floor plans, focus chips, saved comparisons, `/saved`), Save on the dossier, the enquiry form with the phone unlock, and the admin enquiry inbox are built ([tasklist](tasklists/2026-09-21-phase-3-buyer-flows.md)). Held for the owner: the pre-login intake cookie, report a problem (since built), and comparison analytics (slice 4). Phase 3 is therefore not fully closed.

**Status update 2026-09-22:** the owner reviewed the comparison on the three live properties and raised seven findings, all now fixed or resolved ([tasklist](tasklists/2026-09-22-comparison-review-fixes.md)): derived possession status/RERA registration from related facts, floor-plan fallback and Maruti 360's ten floor plans published (matched from the brochure's own printed captions), the tray hidden on `/compare`, rooms one per line with area, missing Floors/Locality/City/Pincode/RERA-land-area rows surfaced, an Other-rooms row added, and the differ/fact count dropped from section headers. Also closed the field-contract gap found along the way (pincode, launch date, RERA project land area now writable; `rera_registered` derived) — approved by the owner since it changes publish logic ([tasklist](tasklists/2026-09-22-field-contract-gap.md)) — and fixed two structural bugs found while doing this work: `postgres`/Drizzle were double-parsing `jsonb` (silently corrupting a numeric-looking string), and a picture-only edit of an already-published property had no way to reach its original brochure. The router prompt was also tweaked so a single-facility marketing spread counts as an amenities page. Still held for the owner, unchanged from 2026-09-21: the pre-login intake cookie, report a problem (since built), and comparison analytics (slice 4).

**Status update 2026-09-22 (later):** the pre-login intake cookie is built ([tasklist](tasklists/2026-09-18-pre-login-intake-cookie.md)) — an explicit "Sign in to keep this search" choice on the intake summary carries stated answers across sign-in and reapplies them as editable filters, never silently and never locked in. **A major flow pivot followed the same day, owner direction** ([tasklist](tasklists/2026-09-22-intake-first-landing-and-comparison-gate.md), `DECISIONS.md`): guided intake is now the site's front door (off the nav, the landing hero's primary call to action) rather than one of several equal links, and `/compare` now locks its detailed row groups behind phone sign-in — only the column identity and the differences-first summary are open to everyone. This reverses the 2026-09-20 "no sign-in to compare" rule, updated in `AGENTS.md` and `docs/design/comparison.v1.md` alongside the code. The landing page's own further "much richer" content (the other half of the same direction) is not started — it needs the owner's scope, not a guess. **"Report a problem" is also now built** ([tasklist](tasklists/2026-09-22-report-a-problem-placeholder.md)): a placeholder link and dialog on every dossier, no table, no storage, no contact address invented ahead of one being chosen. Comparison analytics (slice 4) and schema v11 (`unit_variant_amenities`) remain held, unchanged; "claim this listing" stays out of scope with the on-hold developer portal.

**Status update 2026-09-25:** the enquiry flow is now admin-first (the admin forwards an enquiry to the developer or closes it; schema v19), units per floor is the whole floor's, and the price categorization was verified against the live data. Everything in the acceptance below is built. Comparison analytics (slice 4) was then decided and built the same day, with an admin Analytics screen (schema v20). The one remaining Phase 3 item is the landing page's richer content, which needs the owner's scope.

**Status update 2026-09-26: Phase 3 is closed (owner).** The one item left in the 2026-09-25 note, the landing page's richer content, moves to the UI redesign (owner direction, 2026-09-26). The analytics work built after the acceptance below (anonymous events, the visitors screens, table drill-down, the events rate limit) is recorded in `PROGRESS.md`. The database-backed tests now run one file at a time (`DECISIONS.md` 2026-09-26).

**Acceptance:** a buyer can browse, get intake-matched results from the inclusive ±20% private budget-range matcher (no price ever rendered), compare, save, unlock a dossier via OTP, and submit an enquiry — end to end on real data.

---

## Phase 4 — Developer analytics over schema v20

> **Scope set 2026-09-25 — Deep:** Phase 4 is the developer-facing, aggregates-only view of the first-party analytics Bhavarth built in Phase 3 completion (schema v20, `DECISIONS.md` 2026-09-25 "First-party analytics built", item 7). It builds on v20 and does not rebuild capture: no second event table, cookie or events route. A developer sees thresholded aggregates for their own properties only, plus deterministic listing completeness; nothing reaches a buyer or becomes a score. **Execution tasklists:** [2026-09-25 Phase 4 developer analytics](tasklists/2026-09-25-phase-4-developer-analytics.md) and [portal completion](tasklists/2026-09-26-phase-4-portal-completion.md). Parts 1, 2, 4 and 5 are built; Part 3 needed no new event. On 2026-09-26 the owner approved gates 2, 4 and 5, confirmed the benchmark and rival limits, added property-scoped intake BHK/city demand (schema v24), and authorised Part 6 and a PR to `main`. The app host analytics schedulers stay off until hosting.
>
> **Area of focus:** Deep builds the vertical slice. Bhavarth reviews analytics read access, any schema/grant change, the event vocabulary, developer auth/ownership, and the merge.
>
> The paragraphs below are the earlier record, kept as history.

> The developer-facing submission screens pulled forward on 2026-09-18 are **on hold** (owner decision 2026-09-20): maintainers upload everything until developers join. Revisit only if the project is ahead of schedule. _(Still true 2026-09-25 — Deep: Phase 4 does not include them.)_

**Area of focus (2026-09-18, superseded 2026-09-25 above): Deep** for the portal build; **Bhavarth** defines the auth/permission boundaries and reviews.

The submission-creating half of the developer portal (upload, page routing, OCR-draft review, submit) moved to finishing Phase 2A — see the 2026-09-18 `DECISIONS.md` entry. What's left here, once a developer account can already sign in and submit:

- Portfolio/analytics dashboard (`GET /api/v1/developer/portfolio`) — completeness and interest analytics over the developer's own properties, no editorial or publishing authority.

**Future scope — the paid developer analytics platform (recorded 2026-09-19, not scheduled).** The revenue model is charging developers for presence and for insights, and the intended product is a property-specific analytics platform in the spirit of Google Analytics but going well beyond it (discovery-to-enquiry funnels, competitor comparison behaviour, demand by budget band/configuration/locality, listing-quality benchmarks). It is designed after the app is live in beta, as its own tasklist; the beta start date is the deadline for event capture to exist because history cannot be rebuilt. The dashboard above is only its first, small slice. See the 2026-09-19 `DECISIONS.md` entry for the constraints it must respect (no exact prices, aggregates only for developers, declared trackers).

**Design work opened 2026-09-22/23 (still not scheduled as implementation):** the event taxonomy this platform and comparison slice 4 both need is being designed on paper in `docs/tasklists/2026-09-23-analytics-event-taxonomy.md`, since Phase 3 is nearly closed and beta is the next real milestone. A comparison preference/"win-rate" index, if it comes of this, is a developer-facing aggregate only — never a buyer-facing score (`DECISIONS.md` 2026-09-23). If paid presence/sponsored placement is ever built as part of this platform's revenue model, it must never affect match ordering or comparison content, and must be visibly disclosed (`DECISIONS.md` 2026-09-23) — recorded now, ahead of any such feature existing, so monetisation cannot quietly compromise comparison neutrality.

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
