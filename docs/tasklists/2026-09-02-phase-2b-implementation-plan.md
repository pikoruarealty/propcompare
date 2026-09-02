# Implementation plan — Phase 2B buyer experience

**Status:** step 0 complete (2026-09-02); step 1 is next
**Owner:** Deep (buyer UI), with Bhavarth owning the read contract in step 1
**Branch:** this plan on `task/phase-2b-implementation-plan`; each step below takes its own `task/` branch
**Roadmap:** [Phase 2B](../roadmap.md#phase-2b--buyer-ui-against-a-fixed-contract-parallel-with-2a)

This is the master plan for Phase 2B. It is deliberately split into ordered,
independently reviewable steps; each step becomes its own short-lived branch and
is checked off here as it lands. Steps 1 and 2 are prerequisites for every
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
- [ ] **Filter set for the listing route** — blocks step 1. `prd.v1.md` says
      browsing is supported "as the read contract matures"; step 1 must fix the
      v1 filter list rather than leave it open-ended.

## Step 0 — Tooling baseline

**Branch:** `task/phase-2b-tooling` · **Status: complete 2026-09-02**

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

**Branch:** `task/phase-2b-read-contract` · **Documentation only, no code.**

`api-spec.v1.md`'s own contract-change process requires a route's request,
response, access rules, pagination/filter semantics, and errors to be defined
before a consumer starts work. Today both buyer routes carry only a one-line
summary, so this step is a hard blocker on every screen.

- [ ] Fully specify `GET /api/v1/properties`: query parameters, the fixed v1
      filter set, pagination and sort semantics, the summary response shape, and
      error codes.
- [ ] Fully specify `GET /api/v1/properties/{slug}`: the dossier response shape
      covering property facts, developer, location, RERA facts, unit variants,
      per-basis areas, dimensions, controlled amenities/specifications with their
      `not_stated` / `explicitly_not_offered` states, and media.
- [ ] State explicitly that presence of a row in `properties` _is_ publication —
      there is no status column — so "published" needs no filter but must be
      documented so no one later invents one.
- [ ] State the exclusion list normatively: no `unit_price_history` value, price,
      price-per-sqft, bucket, submission, provenance, evidence, or OCR confidence
      may appear in a buyer response.
- [ ] Resolve the filter-set decision gate and record it in `DECISIONS.md`.

A proposed starting shape, to be settled in this step rather than treated as
already agreed:

```text
GET /api/v1/properties
  ?page &pageSize &city &locality &propertyType &bhk &possessionStatus &amenity(repeatable) &sort
  -> { data: PropertySummary[], pagination: { page, pageSize, total, totalPages } }

GET /api/v1/properties/{slug}
  -> PropertyDossier   (404 when the slug is not in the live catalog)
```

**Acceptance:** both routes are fully specified in `api-spec.v1.md`; a reviewer
can build a screen or a mock server from the document alone.

## Step 2 — Typed read layer and fixtures

**Branch:** `task/phase-2b-read-layer`

- [ ] Define exported TypeScript types mirroring the step 1 contract exactly, as
      the single shared source for routes, screens, fixtures, and tests.
- [ ] Implement `listPublishedProperties` and `getPublishedPropertyBySlug` as
      Drizzle queries joining the catalog, lookup, and controlled-vocabulary
      tables. Read-only; no write path.
- [ ] Build fixtures that satisfy the same exported types, including a
      deliberately sparse property exercising `not_stated`,
      `explicitly_not_offered`, absent media, absent RERA facts, and a variant
      with partial areas.
- [ ] Tests: query shape conformance, pagination and every filter, slug
      not-found, and an assertion that no returned object graph contains a price
      or bucket key.

**Acceptance:** the read layer returns contract-shaped data; fixtures typecheck
against the same types; tests pass without a database for the fixture path.

## Step 3 — Buyer read routes

**Branch:** `task/phase-2b-api-routes`

- [ ] Implement `src/app/api/v1/properties/route.ts` and
      `src/app/api/v1/properties/[slug]/route.ts` over the step 2 layer.
- [ ] Validate and coerce query parameters; reject unknown or malformed values
      with the documented `{ error: { code, message } }` envelope.
- [ ] Set caching/revalidation deliberately, given SEO/ISR was an explicit
      reason for choosing Next.js.
- [ ] Tests: success, 404, invalid parameters, and price-absence on the wire.

**Acceptance:** both routes behave exactly as step 1 documents.

## Step 4 — Shared buyer components

**Branch:** `task/phase-2b-components`

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

**Branch:** `task/phase-2b-browse`

- [ ] Property summary card per the design guide: published facts, dossier link,
      no price, and no save/compare wiring yet (Phase 3).
- [ ] Listing grid with the step 1 filters, pagination, and sort.
- [ ] Empty and no-match states that retain filters and offer refinement rather
      than fabricating results.
- [ ] Responsive behavior down to the 16px mobile margin.
- [ ] Tests: card content, filter/pagination interaction, empty state.

## Step 6 — Property dossier

**Branch:** `task/phase-2b-dossier` · **Blocked on the media and PropScoreDial gates.**

- [ ] Dossier page at the property slug route, organizing facts progressively
      rather than as a table dump: identity and developer, location, possession,
      RERA facts, unit variants with per-basis areas and room dimensions,
      controlled amenities and specifications with explicit states, and media.
- [ ] Render correctly with zero media and with absent RERA facts.
- [ ] No price element anywhere, including in metadata and structured data.
- [ ] SEO/ISR treatment for the property page.
- [ ] Tests: full dossier, sparse dossier, price absence, and 404 handling.

## Step 7 — Landing page

**Branch:** `task/phase-2b-landing`

- [ ] Decision-first landing composed from the shared components, with entry
      points into browse and guided intake.
- [ ] Replace the remaining `create-next-app` scaffold in `src/app/page.tsx`.
- [ ] Tests: renders, and its calls to action route correctly.

## Step 8 — Guided intake UI

**Branch:** `task/phase-2b-intake`

- [ ] Multi-step intake capturing persona priorities, desired BHK, city, and a
      stated budget range, held in client state only.
- [ ] The budget range is presented as a stated preference, never as a price or
      a bucket, and is not sent anywhere in this phase.
- [ ] Back/forward navigation preserves answers; the flow is skippable per the
      buyer flow's "intake is optional".
- [ ] Tests: step navigation, state retention, and that no network call carries
      the budget range.

## Step 9 — Convergence and documentation

**Branch:** `task/phase-2b-convergence`

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
