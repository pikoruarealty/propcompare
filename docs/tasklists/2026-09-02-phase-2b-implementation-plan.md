# Implementation plan — Phase 2B buyer experience

**Status: complete 2026-09-07.** All ten steps (0–9) landed on `task/phase-2b`. See the [completion record](#completion-record) at the foot of this document. No open decision gates remain.
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

- [x] **Media delivery for `property_media.gcsPath`** — **resolved 2026-09-07 by
      deferring it out of Phase 2B entirely** (user sign-off, recorded in
      `DECISIONS.md`). Two findings drove it: `property_media.media_type`
      includes `brochure_pdf`, so buyer-facing media can itself be a brochure —
      the document class that carries price lists — and `ARCHITECTURE.md` puts
      brochures and buyer media in the same GCS storage, so "public bucket" is
      not a small decision; and nothing can populate media this phase, since the
      OCR field contract has no media field and no GCS SDK or credentials are
      configured. The summary card reserves a neutral frame, the dossier renders
      zero media correctly and lists the media inventory where rows exist, and
      tests fail if any `gcsPath` is fetched. A proxy route remains the strongest
      candidate when the gate is finally taken.
- [x] **Whether `PropScoreDial` ships in 2B** — **resolved 2026-09-07: deferred
      out of 2B entirely** (user sign-off, recorded in `DECISIONS.md`), as this
      plan recommended. No calculation is defined, and a dial built from the
      current catalog would present a number the data does not support.
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

**Status: complete 2026-09-02**

- [x] Buyer app shell: header, footer, page frame on the 12-column grid with
      documented gutters/margins and the 8px rhythm.
      (`src/components/buyer/page-frame.tsx`, `site-header.tsx`,
      `site-footer.tsx`)
- [x] Typography primitives binding Cormorant Garamond to display text and Plus
      Jakarta Sans to UI/data, plus the `data-tabular` treatment for areas,
      dates, and counts. (`src/components/buyer/typography.tsx`)
- [x] `VerifiedBadge` — Soft Gold, rendered only when a concrete verified
      condition holds, never decoratively.
- [x] `FactValue` — the honest-incompleteness primitive rendering `not_stated`
      and `explicitly_not_offered` distinctly, never as a blank or a plausible
      placeholder.
- [x] Tests asserting the gold badge cannot render without its verified
      condition and that missing facts render as explicit states.

**Acceptance — met:** `format:check`, `lint`, `typecheck`, and `build` pass;
`bun run test` reports **191 passed across 15 files** (144 from step 3, plus 47
component and token tests).

**Both trust rules are enforced structurally, not by convention:**

- **`VerifiedBadge` takes a verified fact or `null` — no boolean, no `variant`,
  no `children`, no `className`.** There is no shape of the component that
  renders Soft Gold decoratively, and the fact is only derivable from a RERA
  registration that carries an actual registration number, which the badge then
  displays as its evidence. Recorded in `DECISIONS.md`.
- **`FactValue` owns the absence vocabulary** — "Not stated" for an unanswered
  question, "Not offered" for an answered one — distinct in wording, styling,
  and explanatory `title`. An explicit status beats a value passed beside it, so
  a contradiction surfaces as a defect instead of rendering as though correct;
  and zero is a stated value, not absence.

**Worth knowing before step 6:** the verified badge is currently unreachable, by
design rather than by omission. Nothing sets `properties.rera_registered`, which
defaults to `false`, and the field contract records against
`property.rera_registration_number` that "OCR never sets RERA verification or a
verified badge". The badge waits on a real verification path — the GujRERA
cross-check job (`DECISIONS.md`, 2026-08-31). The dossier must therefore render
correctly with no badge at all, exactly as it must with zero media.

**The layout grid moved into tokens.** `--layout-columns`, `--layout-gutter`,
`--layout-margin-mobile`, `--layout-margin-desktop`, and `--layout-max-width`
are now declared in `globals.css` and read by the page frame, so the documented
12-column / 24px / 48px / 16px grid is stated once rather than restated as
utility classes that can drift. `design-tokens.test.ts` locks the values and
asserts each sits on the 8px rhythm.

**A second gold guard was added.** The existing token test keeps Soft Gold out
of every shadcn colour slot, which does not stop a component reaching for
`--color-verified-gold` directly to make a card feel premium.
`src/components/verified-gold-reservation.test.ts` scans the source and fails if
any file other than the token declaration and the badge itself names the token.
It was verified by planting a violation in the footer and watching it fail with
that file named — a guard that cannot fail proves nothing.

**Not done here, deliberately:** `src/app/page.tsx` still holds the
`create-next-app` scaffold and does not yet use `PageFrame`. Replacing it is
step 7's checklist item, so these components are exercised by tests but not yet
by a rendered route.

## Step 5 — Browse / listing grid

**Status: complete 2026-09-07**

- [x] Property summary card per the design guide: published facts, dossier link,
      no price, and no save/compare wiring yet (Phase 3).
      (`src/components/buyer/property-card.tsx`)
- [x] Listing grid with the step 1 filters, pagination, and sort.
      (`src/components/buyer/browse-screen.tsx`, `browse-filters.tsx`,
      `src/app/properties/page.tsx`)
- [x] Empty and no-match states that retain filters and offer refinement rather
      than fabricating results.
- [x] Responsive behavior down to the 16px mobile margin.
- [x] Tests: card content, filter/pagination interaction, empty state.

**Acceptance — met:** `/properties` renders real published data through the
step 2 read layer, filterable by every parameter in the step 1 contract, with
pagination, sort, both empty states, and no price anywhere. `format:check`,
`lint`, `typecheck`, and `build` pass; `bun run test` reports **282 passed
across 20 files** (191 from step 4, plus 91 for this step). `next build` reports
`/properties` as `ƒ (Dynamic)`, which is correct — the screen _is_ its query
string.

**Verified by running it, not only by testing it.** Against three properties
published through the real `publishSubmission` transaction: the grid, the
vocabularies drawn from published data, the sparse property rendering "Not
stated" twice, both empty states, the AND semantics of two amenity filters,
both sorts, and pagination with its inert ends. The seeded rows were removed
afterwards; the catalog is back to empty.

**Three open questions were resolved with the user before any code was written**
(all recorded in `DECISIONS.md`, 2026-09-07), because each would have been
expensive to unwind:

- **Data fetching.** The page calls `listPublishedProperties(db, params)`
  directly rather than fetching its own HTTP API — a same-process server
  component fetching its own route needs an absolute origin URL it cannot
  reliably know, adds a hop per render, and returns JSON typed only by
  assertion. The two things the HTTP edge contributes are kept rather than
  skipped: the page validates with the same `parseListParams` and guards with
  the same `assertNoExcludedData` the API route uses, so it cannot be more
  permissive than the contract it implements.
- **The card image.** Not built. `gcsPath` is a storage path, not a URL, and the
  media-delivery gate below still blocks step 6; the card holds a neutral,
  textless, `aria-hidden` frame so resolving that gate is a one-element change.
  The frame makes no "no photo" claim — a property may have one this build
  cannot display.
- **The verified badge.** Not on the card. `PropertySummary` carries
  `reraRegistered` but not the registration number that `VerifiedBadge` requires
  as its evidence, so the card literally cannot construct a verified fact. The
  badge stays with the dossier rather than widening the step 1 contract as a
  side effect of a listing-grid task.

**Decisions taken during implementation:**

- **The filter form is a plain `GET` form, and the page canonicalises its
  output.** A `GET` form submits every control it owns, so "Any city" emits
  `?city=` — which the contract rejects with `422`, correctly, because over the
  API an empty value is a broken request rather than an absent filter. The page
  drops empty values and explicit defaults and redirects when that changed
  anything, so every filtered view is a clean, shareable address that works
  before any JavaScript arrives. Canonicalisation drops only what a form could
  not help sending: a malformed value still reaches validation and is still
  reported, and an unknown parameter is still rejected as unknown.
- **A rejected query explains itself rather than failing the page.** A buyer
  following a stale link gets the unfiltered catalog plus a notice carrying the
  API's own message, not a `422` body.
- **Filter vocabularies come from published data** (`filter-options.ts`), not
  from the catalog in full. Publishing writes a `property_amenities` row for
  every catalog amenity — selected ones `available`, the rest `not_stated` — so
  a status-blind query would offer all 26, every unselected one of which returns
  an empty page.
- **Possession dates are formatted by hand, not through `Date`.**
  `new Date("2027-01-01")` is UTC midnight and renders as 31 December for any
  reader west of Greenwich; silently shifting a published date by a day is
  exactly the kind of invented fact this product exists to avoid.
- **`LIST_PARAMETER_NAMES` moved into `http.ts` and is now exported**, so the
  screen's URL building and the API's validation read one list instead of two
  that drift.

**Guards were verified by planting violations,** per the standing rule that a
guard which cannot fail proves nothing: removing the amenity status filter made
the vocabulary test fail with all 26 catalog amenities offered, and rendering
`gcsPath` as an `<img src>` made the media-reservation test fail.

**Worth knowing:** running `next dev` rewrites the tracked `next-env.d.ts` to
point at `.next/dev/types/...`, where `next build`/`next typegen` point at
`.next/types/...`. It is a generated file; restore it (`git checkout --
next-env.d.ts`) rather than committing the dev variant.

## Step 6 — Property dossier

**Status: complete 2026-09-07** · Both blocking gates were resolved first, by
deferral (see Open decision gates above).

- [x] Dossier page at the property slug route, organizing facts progressively
      rather than as a table dump: identity and developer, location, possession,
      RERA facts, unit variants with per-basis areas and room dimensions,
      controlled amenities and specifications with explicit states, and media.
      (`src/app/properties/[slug]/page.tsx`,
      `src/components/buyer/dossier-screen.tsx`,
      `src/lib/properties/dossier.ts`)
- [x] Render correctly with zero media and with absent RERA facts.
- [x] No price element anywhere, including in metadata and structured data.
- [x] SEO/ISR treatment for the property page.
- [x] Tests: full dossier, sparse dossier, price absence, and 404 handling.

**Acceptance — met:** `/properties/{slug}` renders the full dossier from the
step 2 read layer. `format:check`, `lint`, `typecheck`, and `build` pass;
`bun run test` reports **345 passed across 22 files** (282 from step 5, plus 63
for this step). `next build` reports the route as `● (SSG)` — incrementally
regenerated, and built without a database because no paths are prerendered.

**Verified by running it.** Against properties published through the real
`publishSubmission` transaction: the full and sparse dossiers, `200` on both
slugs, `404` on an unknown one, the page title, meta description, and JSON-LD,
and the zero-media empty state. The seeded rows were removed afterwards.

**Decisions taken, each with a `DECISIONS.md` entry:**

- **ISR, with paths rendered on first visit.** `revalidate = 3600` plus a
  `generateStaticParams` returning an empty array, `dynamicParams` left at its
  default. Checked against the Next 16 docs bundled in `node_modules`, which
  state that returning an array — even an empty one — is what keeps the route
  statically rendered, and that an empty one renders each path on first visit
  and caches it. This needs no database at `next build`, which step 3 had
  already flagged as a blocker for prerendering.
- **Structured data models a residence, never an offer.** schema.org
  `ApartmentComplex`, no `Offer` and no price property, run through the same
  `findForbiddenKeys` guard that protects API responses. An offer exists to
  state a price. Amenities map honestly: `available` → `value: true`,
  `explicitly_not_offered` → `value: false`, `not_stated` omitted, since no
  claim has been made either way.
- **`rera_registered: false` renders "Not stated", never "Not registered".**
  Nothing sets the flag, so `false` means "no registration recorded" — not the
  accusation of non-compliance the other wording would publish.
- **Unrecorded catalog facts sit behind a counted disclosure.** The amenity
  catalog has 26 entries and publishing writes a row for every one, so a real
  property rendered a wall of "Not stated" that buried its few real answers —
  found by looking at the running page, not by reasoning about it. Stated facts
  now lead; the rest sit in a `<details>` whose summary names the count. Every
  row is still in the markup, and it opens without JavaScript.
- **Coordinates are not displayed.** `latitude`/`longitude` exist for map and
  locality search later; printing them as text is the database dump this screen
  exists to avoid.
- **Opaque `dimensions` jsonb is read defensively.** A room renders only with a
  non-empty name and two positive finite measurements; any other shape renders
  nothing. Raw JSON is never shown to a buyer, and a room whose measurements
  could not be read is never half-rendered.

**Guards verified by planting violations:** deriving built-up area from carpet
area at a 1.2 ratio failed both the unit test and the rendered-screen test;
adding an `Offer` to the JSON-LD failed five tests, including the production
exclusion guard.

## Step 7 — Landing page

**Status: complete 2026-09-07**

- [x] Decision-first landing composed from the shared components, with entry
      points into browse and guided intake.
      (`src/components/buyer/landing-screen.tsx`, `src/app/page.tsx`)
- [x] Replace the remaining `create-next-app` scaffold in `src/app/page.tsx`.
- [x] Tests: renders, and its calls to action route correctly.

**Acceptance — met:** `/` renders the buyer landing inside the shared shell.
`format:check`, `lint`, `typecheck`, and `build` pass; `bun run test` reports
**357 passed across 23 files** (345 from step 6, plus 12 for this step).
`next build` reports `/` as `○ (Static)`.

**The landing reads no data, deliberately.** A strip of recently published
properties was the obvious alternative and would have reused `PropertyCard`
honestly, but nothing on this page varies by request, visitor, or catalog
state — so the most-visited page in the product prerenders with no database
dependency, and no "featured" ordering is invented that the catalog could not
justify. Revisit the content strip in step 9, when real published properties
exist to design it against rather than an empty table.

**The page says only what the product can support.** Its four principles each
restate a rule enforced elsewhere in the codebase — areas are never converted
between bases, facts are reviewed before publication, gaps are stated rather
than filled, and RERA is a cross-check rather than a badge. Tests assert it
promises no shortlist, no saved properties, and no side-by-side comparison,
since all three are Phase 3.

**The price stance gets a section, not a footnote.** A buyer who cannot find a
price will assume the data is broken unless told it is deliberate; the footer's
single line was not enough to carry that.

**Calls to action come from `BUYER_NAV`**, so the header and the landing page
cannot drift apart, with a test asserting it. Note `/intake` returns `404`
until step 8 — expected, the header has carried the same link since step 4, and
nothing merges to `main` before the phase boundary.

**Scaffold fully removed:** `src/app/page.tsx` no longer holds the
`create-next-app` starter, and the five unreferenced starter SVGs
(`next`, `vercel`, `globe`, `file`, `window`) were deleted from `public/`,
where they were being served publicly from a property site.

**A flaky step 5 test was found and fixed here.** The suite failed once during
verification; rather than re-run and move on, it was reproduced — the ordering
assertion in `filter-options.integration.test.ts` failed in three of five
isolated runs. The test, not the code, was wrong: it checked Postgres's ordering
by re-sorting the list in JavaScript, but Postgres orders by the database
collation (`English_India.1252` here, confirmed by querying `pg_database`),
which is case-insensitive, while JavaScript uses code-point order. A random
fixture suffix starting with a letter flipped the expected order. It now
asserts the relative order of two values that differ at their first letter,
which holds under any collation. **A database's ordering must never be asserted
by re-sorting in the application language.**

## Step 8 — Guided intake UI

**Status: complete 2026-09-07**

- [x] Multi-step intake capturing persona priorities, desired BHK, city, and a
      stated budget range, held in client state only.
      (`src/lib/properties/intake.ts`, `src/components/buyer/intake-flow.tsx`,
      `src/components/buyer/intake-screen.tsx`, `src/app/intake/page.tsx`)
- [x] The budget range is presented as a stated preference, never as a price or
      a bucket, and is not sent anywhere in this phase.
      (`src/components/buyer/stated-range-slider.tsx`)
- [x] Back/forward navigation preserves answers; the flow is skippable per the
      buyer flow's "intake is optional".
- [x] Tests: step navigation, state retention, and that no network call carries
      the budget range.

**Acceptance — met:** `/intake` renders the four-question flow inside the shared
shell and no longer 404s. `format:check`, `lint`, `typecheck`, `build`, and
`git diff --check` pass; `bun run test` reports **396 passed across 27 files**
(357 from step 7, plus 39 for this step). `next build` reports `/intake` as
`ƒ (Dynamic)`, with the rest of the route table unchanged from step 7.

**The priority vocabulary was agreed, not invented.** Nothing in this repo
defined a "persona priority": the column is unshaped `jsonb`, the PRD says only
"capture buyer priorities", and the sole concrete hint was a non-normative
example comment in `schema.v1.md`. Six keys were agreed with the maintainer —
`family_space`, `location`, `possession_speed`, `amenities`, `privacy`,
`build_quality` — each carrying a `grounding` line naming the published facts it
reads, shown to the buyer beside the option, capped at three choices. A priority
the catalog cannot answer would be a question asked in bad faith, and a
vocabulary guessed here would have become a second de-facto contract the moment
Phase 3 built matching against it.

**The first `"use client"` component in the buyer surface, and it deliberately
does not copy browse.** Browse puts its filter set in the URL so a filtered view
is a shareable address; intake keeps every answer in `useState` and puts none of
it in the URL, in storage, or on a server. A query string reaches browser
history, access logs, and the `Referer` header of every following request, which
is as close as this application could come to publishing a monetary figure. The
client boundary stays tight: the frame, heading, and standing copy render on the
server, and only the flow ships to the browser.

**Intake ends somewhere real without inventing a match.** Matching is Phase 3
and `POST /api/v1/intake-sessions` remains an explicit non-goal, so the closing
brief links to `/properties` carrying only city and configuration — the two
answers that map to filters the read contract actually has. `handoffParams`
names those two fields one at a time rather than spreading the answers object,
and the summary states in words which filters the link carries and that the
stated range is not among them.

**The range control is a slider by the maintainer's explicit choice**, over
typed figures and preset bands. The concern raised against it was answered in
the control rather than overruled: five-lakh steps so no exact figure is
implied, an open-ended top end ("₹5 crore or more"), a "You said …" readout, and
no property figure ever shown against it. Preset bands were rejected on the
record — a preset list of ranges is a bucket in all but name, and buckets are
the private matching mechanism. Built from two overlaid native range inputs
rather than Radix's `Slider`: each handle is then a real labelled control, and
Radix's measures itself with `ResizeObserver`, which jsdom does not implement.

**Client state is named to survive the production guard.** `no-price.ts` matches
`/inr/i` and runs in production, so mirroring `budget_min_inr` / `budget_max_inr`
would have forced a choice between weakening that guard and carrying an
unusable shape. The state is `statedRange: { fromLakh, toLakh }`, with a test
asserting the answers object passes `findForbiddenKeys`.

**Both new guards were verified by planting a violation.** A `fetch` to
`/api/v1/intake-sessions` on the summary step failed the no-network-call test;
appending the range to the hand-off URL failed both the parameter-set and the
unfiltered-catalog assertions. Both plants were reverted and the suite re-run.

**A real bug was caught by reading the route table, not the code.** `next build`
first reported `/intake` as `○ (Static)`: `listFilterOptions` is a Drizzle query
rather than a `fetch`, so Next.js could not tell it was uncached and
`dynamic: "auto"` rendered the page once at build — freezing the questions to
build-day catalog contents while `/properties` stayed dynamic against the same
query. Fixed with `export const dynamic = "force-dynamic"`. **A page whose only
data dependency is an ORM call will prerender silently; check the route table
against the previous step's every time.**

**Not verified visually.** No browser automation is available in this
environment, so the slider's overlay CSS was checked by confirming the compiled
rules are present in the production stylesheet, not by dragging it. Worth a
manual click-through before the phase merges.

## Step 9 — Convergence and documentation

This satisfies the roadmap's stated 2A+2B convergence acceptance.

**Status: complete 2026-09-07**

- [x] Publish a handful of real properties through the actual Phase 2A publish
      transaction — never a direct insert — and confirm the buyer pages render
      them correctly against the real read layer.
- [x] Update `api-spec.v1.md` route statuses from Planned to implemented.
      Verified rather than edited: both buyer read routes already read
      `Implemented (Phase 2B step 3)`, and `POST /api/v1/intake-sessions`
      correctly still reads `Planned (Phase 3)`, which step 8 deliberately
      honoured by calling nothing.
- [x] Update `docs/roadmap.md`, `PROGRESS.md`, and this plan's completion record.
- [x] Confirm every decision made during the phase has a dated `DECISIONS.md`
      entry, per the standing rule that decisions are recorded when made rather
      than reconstructed later. Audited: 31 entries dated 2026-09-02 or
      2026-09-07 cover steps 0–8, and step 9 added three more.

**Acceptance — met.** Five properties were published through `publishSubmission`
and every buyer page was checked against them on a running production server.
`format:check`, `lint`, `typecheck`, `build`, `test` and `git diff --check` all
pass; `bun run test` reports **401 passed across 27 files**.

**The seed goes through the one write path, like everything else.** A throwaway
script constructed an approved `property_submissions` row plus confirmed
`property_submission_fields` for each property and called `publishSubmission`;
nothing touched `properties` or any child table directly. The script was deleted
after running, so nothing about the seed is committed. The properties are left in
the local database by the maintainer's decision — steps 5–7 cleaned up because
they were testing, while this step is the convergence deliverable.

**The set is chosen to exercise the surface, not to look full:**

| Property                 | Type      | Possession         | Exercises                                    |
| ------------------------ | --------- | ------------------ | -------------------------------------------- |
| Riverstone Greens        | Apartment | Ready to move      | All three area bases, room dimensions, foyer |
| Satyam Skyline           | Apartment | Under construction | Carpet-only variant, a duplex layout type    |
| Aarambh Residency        | Apartment | Nearing possession | Deliberately sparse — no specs, one amenity  |
| Vraj Bungalows           | Bungalow  | Ready to move      | Built-up + super built-up with **no** carpet |
| Shivalik Plotting Scheme | Plot      | Under construction | **No unit variants at all**                  |

**Verified against the real read layer**, not just rendered: every filter returns
the expected count (`city=Ahmedabad` 3, `city=Gandhinagar` 2, `bhk=3bhk` 2,
`propertyType=plot` 1, `possessionStatus=ready_to_move` 2,
`amenity=clubhouse+gymnasium` 2 — confirming amenities narrow rather than widen);
`findForbiddenKeys` reports zero forbidden keys across all five dossiers and the
listing; a slug with no property still 404s. **The never-derive rule holds on
real data**: Vraj Bungalows publishes built-up and super built-up and shows no
carpet figure rather than computing one.

**The recently-published strip promised in step 7 was built here**, since the
condition it was waiting on — real content to design against — is now met. `/`
therefore changes from `○ (Static)` to `ƒ (Dynamic)`, which partly supersedes the
step 7 decision. It is not ISR: a route with no dynamic segment has no
`generateStaticParams` escape hatch, so `revalidate` would prerender at build and
require a live database during `next build`. **That was measured, not assumed** —
building against an unreachable `DATABASE_URL` succeeds as written and fails with
`revalidate = 3600`. The strip is omitted entirely when the catalog is empty
rather than rendering an empty shelf, and is called "Recently published" rather
than "featured", which would be an assessment nothing here supports.

**A contract gap was found and recorded rather than worked around.** No property
in the catalog can reach the `explicitly_not_offered` amenity state: the publish
transaction marks every unlisted amenity `not_stated`, and the active field
contract has only `property.amenities`, an array of keys that _are_ available.
The "Not stated" / "Not offered" distinction is implemented, tested and correct
on the render side; one of the two facts simply has no input path yet. That
belongs to the phase that owns developer submission, and faking it with a seed
script would fabricate a claim about a real developer.

**Expected gaps, confirmed as correct rather than fixed:** no property shows an
image (media delivery deferred out of 2B by a dated decision, and nothing can
populate `property_media` this phase) and none shows the RERA verified badge
(no code path sets `properties.rera_registered`; it waits on the GujRERA
cross-check job). Both render through the standard absence vocabulary.

## Verification (every step)

- [x] `bun run format:check`
- [x] `bun run lint`
- [x] `bun run typecheck`
- [x] `bun run test`
- [x] `git diff --check`

Run at the end of every step, and again at the phase boundary. Final run:
**401 passed across 27 files**, all five checks clean.

## Completion record

**Phase 2B is complete, 2026-09-07.** All ten steps (0–9) landed on
`task/phase-2b` as one commit each.

**What shipped.** A buyer surface of four screens over a typed read layer and
two public read routes:

| Route                                                     | Render                                     | Step |
| --------------------------------------------------------- | ------------------------------------------ | ---- |
| `/`                                                       | Dynamic (recent strip)                     | 7, 9 |
| `/properties`                                             | Dynamic (reads searchParams)               | 5    |
| `/properties/{slug}`                                      | SSG + ISR, revalidate 3600                 | 6    |
| `/intake`                                                 | Dynamic                                    | 8    |
| `GET /api/v1/properties`, `GET /api/v1/properties/{slug}` | Request-time, shared-cache `Cache-Control` | 3    |

**Acceptance met.** Five properties published through the real
`publishSubmission` transaction render correctly on every buyer page, with zero
forbidden keys reported by the production leak guard and every filter returning
its expected count. See step 9 above for the set and the numbers.

**Deferred out of the phase, each with a dated decision:** media delivery for
`property_media.gcsPath`; `PropScoreDial`; dark mode; a documented
`--destructive` token value.

**Carried into Phase 3 as known gaps:** `POST /api/v1/intake-sessions` and
matching remain unbuilt, so intake captures answers in client state and hands
off to browse rather than producing matches; no amenity can reach
`explicitly_not_offered`, because the active field contract has no input for it;
and `properties.rera_registered` is never set, so no verified badge appears
until the GujRERA cross-check job exists.

**The three habits that found the real defects**, all worth keeping: run the
thing rather than reading it (the dossier table dump, the static `/intake`, the
static `/` this step would have shipped); reproduce a flaky test rather than
re-running it (the collation bug in step 7); and prove a guard by planting a
violation and watching it fail (every guard this phase).

**The phase branch is not merged.** `task/phase-2b` is complete and verified but
still unmerged, by the maintainer's decision on 2026-09-07: the merge into `main`
will be raised as a pull request rather than done locally. Two facts the merge
will have to deal with, both established while closing this step:

- **`origin/main` moved during the phase.** It is five commits ahead of the
  `main` this branch forked from (`4e998d1` → `9b2726d`), carrying Phase 2A OCR
  work: schema v5 with four new nullable `properties` columns, migration
  `0005_military_red_skull.sql`, and changes to `publisher.ts`, `validation.ts`,
  `seed.ts`, and the OCR adapter. A local database that has only run migrations
  through `0004` needs `bun run db:migrate` before the merged tree's integration
  tests will pass.
- **Three files will conflict.** `DECISIONS.md` and `PROGRESS.md` were appended
  and prepended on both sides — both sets of entries are wanted, so the
  resolution is to keep both. `tsconfig.tsbuildinfo` is a TypeScript incremental
  build cache that is tracked at `origin/main`; it has no reviewable content and
  will conflict on every branch merge. Untracking it is deliberately left to the
  pull request rather than bundled into this phase's work.

**Verification numbers in this document describe `task/phase-2b` as it stands,
not a merged result.** They must be re-run after the merge.

**Follow-ups:** [roadmap Phase 3](../roadmap.md#phase-3--integration--core-buyer-flows),
[decisions log](../../DECISIONS.md), [progress journal](../../PROGRESS.md).
