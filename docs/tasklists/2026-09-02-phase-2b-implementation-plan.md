# Implementation plan — Phase 2B buyer experience

**Status:** step 3 complete (2026-09-02); step 4 is next
**Owner:** Deep (buyer UI), with Bhavarth owning the read contract in step 1
**Branch:** `task/phase-2b` — one branch for the whole phase, merged into `main` at the phase boundary. Steps 0–2 originally took a branch each; those were collapsed into `task/phase-2b` on 2026-09-02 with no commits moved.
**Roadmap:** [Phase 2B](../roadmap.md#phase-2b--buyer-ui-against-a-fixed-contract-parallel-with-2a)

This is the master plan for Phase 2B. It is deliberately split into ordered,
independently reviewable steps; each step becomes its own commit on the phase
branch and is checked off here as it lands. Steps 1 and 2 are prerequisites for every
screen — no buyer UI is built before the read contract exists in writing.

## Scope

Build the buyer-facing surface of PropCompare against published catalog data:
the read API contract, a typed read layer, and the landing page, browse/listing
grid, property dossier, and guided-intake UI — all styled to "Soft Daylight" and
all incapable of rendering a price.

## References

- [Product requirements](../product/prd.v1.md)
- [API specification](../api/api-spec.v1.md)
- [Buyer app flow](../app-flows/buyer.md)
- [Product design guide](../design/design.v1.md)
- [Design tokens — Soft Daylight v2](../design/design-tokens.md)
- [Canonical schema v4](../schema/schema.v4.md)
- [Architecture](../../ARCHITECTURE.md)
- [Decisions](../../DECISIONS.md)
- [Contributor rules](../../AGENTS.md)

## Decisions locked for this phase

Recorded as dated entries in [DECISIONS.md](../../DECISIONS.md) on 2026-09-02:

1. **Read layer is real Drizzle queries; fixtures serve tests and component
   work.** The roadmap originally assumed fixtures only because Phase 2A had not
   landed. It has, so the production read path is built now and fixtures satisfy
   the same exported types rather than a parallel shape.
2. **shadcn/ui + Radix primitives are the buyer component foundation**, restyled
   to Soft Daylight tokens as `ARCHITECTURE.md` already anticipated.
3. **Buyer UI is tested in a jsdom environment with Testing Library**, so the
   price-restraint and honest-incompleteness rules are asserted on rendered
   output rather than assumed.

## Non-goals for Phase 2B

- No comparison / decision-brief UI. The roadmap assigns the comparison feature
  to Phase 3; only browse, dossier, landing, and intake are 2B.
- No saved properties, dossier-unlock OTP gate, enquiry submission, or discovery
  matching. All are Phase 3 and depend on routes still marked Planned.
- No `POST /api/v1/intake-sessions` call. Step 8 captures intake in client state
  only; persistence is Phase 3.
- No exact price, price-per-sqft, budget-bucket value, or any `private` schema
  read anywhere in this phase.
- No admin or developer surface work.
- No writes of any kind to live catalog tables. Every fixture property used for
  convergence testing is created through the Phase 2A publish transaction.

## Open decision gates

These must be resolved before the step that depends on them. Each resolution
gets a dated `DECISIONS.md` entry before the code is written.

- [ ] **Media delivery for `property_media.gcsPath`** — blocks step 6. The
      column stores a GCS path, not a browser-fetchable URL. Decide between a
      public bucket with direct URLs, signed URLs minted server-side, or a proxy
      route. Note that no media rows exist yet (the OCR field contract has no
      media field), so the dossier must render correctly with zero media.
- [ ] **Whether `PropScoreDial` ships in 2B** — blocks step 6. `prd.v1.md` lists
      its definition as an open product decision and requires it not imply a
      fabricated score. Recommendation: defer it out of 2B entirely.
- [x] **Filter set for the listing route** — resolved in step 1 (2026-09-02).
      Fixed at `city`, `locality`, `propertyType`, `bhk`, `possessionStatus`, and
      repeatable `amenity`, matched on lookup `key` rather than UUID. Recorded in
      `DECISIONS.md`.

## Step 0 — Tooling baseline

**Status: complete 2026-09-02**

`node_modules` was absent and no UI/component tooling existed.

- [x] `bun install` and confirm the existing suite still passes. The first
      install produced eight silently empty package directories (a corrupted
      bun cache) which broke `typecheck` and `lint`; `bun pm cache rm` plus a
      clean reinstall resolved it.
- [x] Install and configure shadcn/ui + Radix (`--base radix`), pointing its
      theme at the existing Soft Daylight CSS variables rather than generating
      a second token set. The generator did ship its own neutral grayscale
      palette, a Geist font binding, a 10px radius, and an invented dark
      theme — all reconciled onto the documented palette in
      `src/app/globals.css`, with fonts restored in `src/app/layout.tsx`.
- [x] Add `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
      `@testing-library/user-event`, and `@vitejs/plugin-react`; configure two
      Vitest projects (`node` for `.test.ts`, `ui` for `.test.tsx`) so existing
      node-env tests run unchanged.
- [x] Confirm `--color-verified-gold` remains reserved and is not pulled into
      any shadcn default palette. Locked by a regression test rather than a
      convention (`src/app/design-tokens.test.ts`).

**Fixes made beyond the original scope, all tooling-level:**

- `bun run typecheck` was latently broken on any fresh checkout: `layout.tsx`
  uses the generated `LayoutProps` type from `.next/types`, which is gitignored
  and never built in CI. The script is now `next typegen && tsc --noEmit`, so
  the documented CI pipeline can actually pass.
- Added `.gitattributes` (`* text=auto eol=lf`). Without it a Windows checkout
  materializes CRLF and `format:check` fails on every file despite correct
  formatting. Git-stored content was already LF, so this changed no content.
- The `ui` project uses `pool: "threads"`; Vitest's default `forks` pool cannot
  spawn workers when the checkout path contains a space.

**Deferred out of this step, deliberately:**

- **Dark mode.** The generator wrote a full invented dark palette. Soft Daylight
  documents no dark theme, so the values were removed rather than fabricated;
  the `dark` variant remains defined but unused. Needs a design decision if
  wanted.
- **`--destructive`.** No error/destructive colour exists in the token spec. A
  restrained editorial red is in place and flagged in `globals.css` as awaiting
  a documented value.
- **Chart and sidebar tokens.** Removed; they belong to the developer portal
  (Phase 4) and admin surfaces, and would otherwise sit unused as a second
  palette.

**Acceptance — met:** `format:check`, `lint`, and `typecheck` pass; `bun run build`
completes; `bun run test` reports 40 passed across 5 files (the 33 pre-existing
unit tests, 5 new token-contract tests, 2 button smoke tests). The 6 database
integration tests remain unrunnable locally because Postgres is not up
(`DATABASE_URL is not set`) — a pre-existing environment gap, unchanged by this
step.

## Step 1 — Buyer read API contract (prerequisite)

**Documentation only, no code.** · **Status: complete 2026-09-02**

`api-spec.v1.md`'s own contract-change process requires a route's request,
response, access rules, pagination/filter semantics, and errors to be defined
before a consumer starts work. Today both buyer routes carry only a one-line
summary, so this step is a hard blocker on every screen.

- [x] Fully specify `GET /api/v1/properties`: query parameters, the fixed v1
      filter set, pagination and sort semantics, the summary response shape, and
      error codes.
- [x] Fully specify `GET /api/v1/properties/{slug}`: the dossier response shape
      covering property facts, developer, location, RERA facts, unit variants,
      per-basis areas, dimensions, controlled amenities/specifications with their
      `not_stated` / `explicitly_not_offered` states, and media.
- [x] State explicitly that presence of a row in `properties` _is_ publication —
      there is no status column — so "published" needs no filter but must be
      documented so no one later invents one.
- [x] State the exclusion list normatively: no `unit_price_history` value, price,
      price-per-sqft, bucket, submission, provenance, evidence, or OCR confidence
      may appear in a buyer response.
- [x] Resolve the filter-set decision gate and record it in `DECISIONS.md`.

**Resolved filter set** (user sign-off, recorded in `DECISIONS.md`): `city`,
`locality`, `propertyType`, `bhk`, `possessionStatus`, and repeatable `amenity`
— the full proposed set, not the reduced alternative. `propertyType` and `bhk`
filter by lookup `key` (e.g. `apartment`, `2bhk`), not by UUID.

```text
GET /api/v1/properties
  ?page &pageSize &city &locality &propertyType &bhk &possessionStatus &amenity(repeatable) &sort
  -> { data: PropertySummary[], pagination: { page, pageSize, total, totalPages } }

GET /api/v1/properties/{slug}
  -> PropertyDossier   (404 when the slug is not in the live catalog)
```

**Acceptance — met:** both routes are fully specified in `api-spec.v1.md` —
query parameters with types and match semantics, pagination and sort, full
`PropertySummary` and `PropertyDossier` response shapes, ordering rules, an
error table, and a route-spanning normative exclusion list. A reviewer can build
a screen or a mock server from the document alone. Documentation only; no code
changed, so no test run applies beyond `format:check`.

**Decisions folded into the contract while writing it** (each derived from
existing schema or documented rules, not invented scope):

- `pageSize` defaults to 20 and is capped at 50, rejected with `422` rather than
  silently clamped — a silently clamped value lies to the caller about what it
  received.
- Repeated `amenity` narrows with AND semantics and matches only
  `status = "available"`; `not_stated` and `explicitly_not_offered` never match a
  filter, because neither is a claim that the amenity exists.
- `sort` is limited to `newest` and `name`. No relevance or price sort exists in
  v1 — there is no price in the read layer to sort by.
- An unknown `propertyType`/`bhk`/`amenity` key returns an empty result set, not
  an error; a malformed `possessionStatus`, `page`, or `pageSize` returns `422`.
  The first is a valid query with no matches, the second is a broken request.
- `amenities` and `specifications` in the dossier return every associated catalog
  row regardless of status, so the client renders the honest-incompleteness
  states explicitly rather than receiving a pre-filtered list it cannot
  distinguish from genuine absence.

## Step 2 — Typed read layer and fixtures

**Status: complete 2026-09-02**

- [x] Define exported TypeScript types mirroring the step 1 contract exactly, as
      the single shared source for routes, screens, fixtures, and tests.
      (`src/lib/properties/types.ts`)
- [x] Implement `listPublishedProperties` and `getPublishedPropertyBySlug` as
      Drizzle queries joining the catalog, lookup, and controlled-vocabulary
      tables. Read-only; no write path. (`src/lib/properties/queries.ts`)
- [x] Build fixtures that satisfy the same exported types, including a
      deliberately sparse property exercising `not_stated`,
      `explicitly_not_offered`, absent media, absent RERA facts, and a variant
      with partial areas. (`src/lib/properties/fixtures.ts`)
- [x] Tests: query shape conformance, pagination and every filter, slug
      not-found, and an assertion that no returned object graph contains a price
      or bucket key.

**Design decisions taken during implementation:**

- **The database handle is a parameter, not a module import.** `@/db` throws at
  import time when `DATABASE_URL` is unset, so importing it here would force
  every fixture-path test to require a running Postgres. `listPublishedProperties(db, params)`
  keeps the module importable and its shapes testable without one.
- **BHK and amenity filters use `EXISTS`, not joins.** A property with three
  matching variants must still count once, or pagination totals silently lie.
- **The exclusion-list guard is runtime code** (`src/lib/properties/no-price.ts`),
  not a test helper, so fixtures and database tests assert the same rule through
  one implementation. It is itself tested against planted leaks first — a guard
  that cannot fail proves nothing.
- **The contract gained two rules it was missing.** `primaryMedia` resolves to
  the `isPrimary` row, else lowest `displayOrder`, else `null`; `bhkTypes` is the
  distinct set across variants. Both are now in `api-spec.v1.md`, so the doc and
  the code do not drift.

**Acceptance — met and exceeded:** the read layer returns contract-shaped data;
fixtures typecheck against the same types; the 35 fixture-path tests pass with no
database. Beyond the original acceptance, a local Postgres was stood up this step,
so the 24 read-layer database tests (pagination, every filter, both sorts,
slug-not-found, price-absence on real query output) and the 6 previously
unrunnable publisher integration tests now run too: **105 passed across 8 files**,
the first fully green suite in this project. `format:check`, `lint`, `typecheck`,
and `build` all pass.

Database-backed read tests seed their properties through the real
`publishSubmission` transaction rather than direct catalog inserts — the
one-write-path rule binds tests too, and a raw INSERT would test a shape the
publisher cannot actually produce.

**Two defects found and fixed after review (both pre-existing on `main`):**

- **The migration journal was never committed.** `.gitignore` excluded
  `drizzle/meta/` from the first Phase 0 baseline, so `db:migrate` could not run
  on a fresh checkout, and `db:generate` emitted a second migration numbered 0000
  colliding with the existing one — which, because migration `0001` is
  hand-written SQL, would have silently dropped the `propcompare_service` grant.
  Journal reconstructed for all five migrations with the current schema snapshot;
  verified by a clean `db:migrate` into an empty database whose `pg_dump`
  structure matches the working one exactly.
- **`tsconfig.tsbuildinfo` was tracked**, a build cache rewritten by every
  `typecheck`. Now ignored and untracked.

Also corrected a privilege bug introduced by this step's own local bootstrap: it
had granted `propcompare_service` write access to all 36 public tables where the
migrations grant `SELECT` on one. Local database rebuilt through `db:migrate`.
Both recorded in `DECISIONS.md`.

## Step 3 — Buyer read routes

**Status: complete 2026-09-02**

- [x] Implement `src/app/api/v1/properties/route.ts` and
      `src/app/api/v1/properties/[slug]/route.ts` over the step 2 layer.
- [x] Validate and coerce query parameters; reject unknown or malformed values
      with the documented `{ error: { code, message } }` envelope.
      (`src/lib/properties/http.ts`)
- [x] Set caching/revalidation deliberately, given SEO/ISR was an explicit
      reason for choosing Next.js.
- [x] Tests: success, 404, invalid parameters, and price-absence on the wire.

**Acceptance — met:** both routes behave as step 1 documents, verified against
real published data. `format:check`, `lint`, `typecheck`, and `build` pass;
`bun run test` reports **144 passed across 10 files** (105 from step 2, plus 27
parameter-contract tests needing no database and 12 database-backed wire tests).
`next build` reports both routes as `ƒ (Dynamic)`, confirming request-time
execution rather than an accidental prerender.

**The caching decision gate, resolved** (user sign-off, recorded in
`DECISIONS.md`): neither route exports a route segment config, and cache policy
is expressed as HTTP `Cache-Control` for a shared cache — listing
`public, s-maxage=60, stale-while-revalidate=300`, dossier
`public, s-maxage=300, stale-while-revalidate=3600`, errors `no-store`.
Three constraints were checked against the Next 16 docs bundled in
`node_modules` rather than assumed: `cacheComponents` is off, so `GET` handlers
already run at request time; `dynamic = "force-static"` cannot apply to the
listing route at all, because a force-static handler cannot read
`request.nextUrl.searchParams`; and prerendering the dossier route would need
Postgres reachable at build time. Page-level ISR stays with the dossier _page_
in step 6, which is where SEO actually lives.

**Decisions taken during implementation, each with a `DECISIONS.md` entry:**

- **The error envelope's `code` was genuinely ambiguous in step 1's contract** —
  it read as either the HTTP status restated or a failure-class name. Resolved
  as a machine-readable slug (`invalid_query_parameter`, `property_not_found`,
  …), and `api-spec.v1.md` amended so the ambiguity does not survive.
- **Validation repairs nothing.** A non-repeatable parameter given twice, an
  empty value (`?city=`), and a non-strict integer (`1.5`, `1e2`) are each
  `422` rather than coerced — the same reasoning that already rejects an
  over-large `pageSize` instead of clamping it.
- **The exclusion-list guard now runs in production**, not only in tests.
  `buyerJsonResponse` scans every successful body immediately before
  serialisation and fails the request rather than stripping the key. Tested
  against a planted leak, per the standing rule that a guard which cannot fail
  proves nothing.
- **Validation lives in `src/lib/properties/http.ts`, not in the route files.**
  A `route.ts` imports `@/db`, which throws at import time without
  `DATABASE_URL`; keeping the parameter contract outside it means the branchiest
  part of the step is testable with no database, matching how step 2 is split.

## Step 4 — Shared buyer components

- [ ] Buyer app shell: header, footer, page frame on the 12-column grid with
      documented gutters/margins and the 8px rhythm.
- [ ] Typography primitives binding Cormorant Garamond to display text and Plus
      Jakarta Sans to UI/data, plus the `data-tabular` treatment for areas,
      dates, and counts.
- [ ] `VerifiedBadge` — Soft Gold, rendered only when a concrete verified
      condition holds, never decoratively.
- [ ] `FactValue` — the honest-incompleteness primitive rendering `not_stated`
      and `explicitly_not_offered` distinctly, never as a blank or a plausible
      placeholder.
- [ ] Tests asserting the gold badge cannot render without its verified
      condition and that missing facts render as explicit states.

**Acceptance:** components match the token spec and the design guide's stated
behaviors, with the two trust rules covered by tests.

## Step 5 — Browse / listing grid

- [ ] Property summary card per the design guide: published facts, dossier link,
      no price, and no save/compare wiring yet (Phase 3).
- [ ] Listing grid with the step 1 filters, pagination, and sort.
- [ ] Empty and no-match states that retain filters and offer refinement rather
      than fabricating results.
- [ ] Responsive behavior down to the 16px mobile margin.
- [ ] Tests: card content, filter/pagination interaction, empty state.

## Step 6 — Property dossier

**Blocked on the media and PropScoreDial gates.**

- [ ] Dossier page at the property slug route, organizing facts progressively
      rather than as a table dump: identity and developer, location, possession,
      RERA facts, unit variants with per-basis areas and room dimensions,
      controlled amenities and specifications with explicit states, and media.
- [ ] Render correctly with zero media and with absent RERA facts.
- [ ] No price element anywhere, including in metadata and structured data.
- [ ] SEO/ISR treatment for the property page.
- [ ] Tests: full dossier, sparse dossier, price absence, and 404 handling.

## Step 7 — Landing page

- [ ] Decision-first landing composed from the shared components, with entry
      points into browse and guided intake.
- [ ] Replace the remaining `create-next-app` scaffold in `src/app/page.tsx`.
- [ ] Tests: renders, and its calls to action route correctly.

## Step 8 — Guided intake UI

- [ ] Multi-step intake capturing persona priorities, desired BHK, city, and a
      stated budget range, held in client state only.
- [ ] The budget range is presented as a stated preference, never as a price or
      a bucket, and is not sent anywhere in this phase.
- [ ] Back/forward navigation preserves answers; the flow is skippable per the
      buyer flow's "intake is optional".
- [ ] Tests: step navigation, state retention, and that no network call carries
      the budget range.

## Step 9 — Convergence and documentation

This satisfies the roadmap's stated 2A+2B convergence acceptance.

- [ ] Publish a handful of real properties through the actual Phase 2A publish
      transaction — never a direct insert — and confirm the buyer pages render
      them correctly against the real read layer.
- [ ] Update `api-spec.v1.md` route statuses from Planned to implemented.
- [ ] Update `docs/roadmap.md`, `PROGRESS.md`, and this plan's completion record.
- [ ] Confirm every decision made during the phase has a dated `DECISIONS.md`
      entry, per the standing rule that decisions are recorded when made rather
      than reconstructed later.

## Verification (every step)

- [ ] `bun run format:check`
- [ ] `bun run lint`
- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] `git diff --check`

## Completion record

Not started. Steps are checked off above as their branches merge; this section
records the final outcome, date, and follow-up links when the phase closes.
