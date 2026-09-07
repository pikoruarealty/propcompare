# Progress

## 2026-09-07 — Phase 2B step 8 complete: guided intake, and the dead link closed

**Done:** `/intake` exists. Four optional questions — priorities, configuration,
city, and the range the buyer is working with — then a brief that restates every
answer and hands off to `/properties`. `src/lib/properties/intake.ts` holds the
vocabulary and the URL arithmetic, `src/components/buyer/intake-flow.tsx` is the
flow, `src/components/buyer/stated-range-slider.tsx` is the range control,
`src/components/buyer/intake-screen.tsx` is the screen, and
`src/app/intake/page.tsx` is the route. The `/intake` link the header has
carried since step 4, and the landing page since step 7, no longer 404s.

**"Persona priorities" had no definition anywhere in this repo, so one was
agreed rather than invented.** `buyer_intake_sessions.persona_priorities` is
unshaped `jsonb`; the PRD says "capture buyer priorities"; `buyer.md` says
"choose persona priorities"; the only concrete hint was a non-normative example
comment in `schema.v1.md`. Guessing here would have created a second de-facto
contract the moment Phase 3 built matching against it. Six keys were agreed with
the maintainer, each carrying a `grounding` line naming the published facts it
reads, shown to the buyer beside the option. A priority the catalog cannot
answer would be a question asked in bad faith.

**This is the first `"use client"` component in the buyer surface, and it
deliberately does not copy the browse screen.** Browse puts its whole filter set
in the URL so a filtered view is a shareable address. Intake does the opposite:
every answer lives in `useState` and none of it reaches the URL, storage, or a
server. A query string lands in browser history, in access logs, and in the
`Referer` header of every following request — which is as close as this
application could come to publishing a monetary figure. The client boundary is
drawn as tightly as it goes: the frame, the heading, and the standing copy all
still render on the server.

**Intake ends somewhere real without inventing a match.** Matching is Phase 3
and `POST /api/v1/intake-sessions` is an explicit non-goal, so the brief links
to `/properties` carrying only the two answers that map to filters the read
contract actually has — city and configuration. `handoffParams` names those two
fields one at a time rather than spreading the answers, so a future field cannot
reach the URL by an inattentive edit, and the summary says in words which
filters the link carries and that the stated range is not among them.

**The range is a slider, by the maintainer's explicit choice**, over the two
alternatives put to them. The concern raised against it — that a slider implies
precise rupee figures on a site that publishes none — was answered in the
control rather than overruled: it steps in five-lakh notches, its top end is
open-ended ("₹5 crore or more") so it never puts a ceiling in the buyer's mouth,
it reads back as "You said …", and nothing is ever shown as costing it. Preset
bands were rejected on the record; a preset list of ranges is a bucket in all
but name. It is built from two overlaid native range inputs rather than Radix's
`Slider`, so each handle is a real labelled control — Radix's measures itself
with `ResizeObserver`, which jsdom does not implement, and the one interactive
control in this phase would have been the one its tests could not drive.

**The client state is named to survive the production guard, not to dodge it.**
`no-price.ts` matches `/inr/i` and runs in production. Mirroring the column
names `budget_min_inr` / `budget_max_inr` in client state would trip it, leaving
a choice between weakening the product's central structural guard and carrying a
shape nothing could be handed. The state is `statedRange: { fromLakh, toLakh }`,
and a test asserts the whole answers object passes `findForbiddenKeys`.

**Both new guards were verified by planting a violation and watching them
fail.** A `fetch("/api/v1/intake-sessions", …)` added to the summary step failed
the "makes no network call at any point in the flow" test; appending the range
to the hand-off URL failed both the parameter-set assertion and the
unfiltered-catalog assertion. Both plants were reverted and the suite re-run.

**A real bug was found by running the build, not by reading the code.**
`next build` reported `/intake` as `○ (Static)`: `listFilterOptions` is a
Drizzle query rather than a `fetch`, so Next.js could not tell it was uncached
and `dynamic: "auto"` rendered the page once at build — freezing the questions
to whatever was published on build day, while `/properties` stayed dynamic
against the same query. Fixed with `export const dynamic = "force-dynamic"`;
the route table now reports `ƒ /intake`. Found by checking the route table
against the one recorded at step 7 rather than assuming a new page would behave.

**Verified:** `bun run test` reports **396 passed across 27 files** (357 from
step 7, plus 39 for this step); `format:check`, `lint`, `typecheck`, `build`,
and `git diff --check` all pass. The route table is otherwise unchanged from
step 7. Confirmed against the running production server: `/intake` returns
`200` and server-renders the first question, the standing exit, and the
"nothing is saved or sent" copy.

**Not verified visually:** no browser automation is available in this
environment, so the slider's overlay CSS — two transparent range inputs with
`pointer-events` re-enabled on their thumbs — was checked by confirming the
compiled rules are present in the production stylesheet
(`::-webkit-slider-thumb`, `::-moz-range-thumb`, both `pointer-events` values),
not by dragging it. Worth a manual click-through before the phase merges.

**Known and expected:** the catalog is still empty, so the configuration and
city questions render their "nothing is published yet" message rather than
options. That path is covered by a test, the flow still completes through it,
and step 9 is where real published properties arrive.

## 2026-09-07 — Phase 2B step 7 complete: the landing page, and the last of the scaffold

**Done:** `/` is the buyer landing page
(`src/components/buyer/landing-screen.tsx`, `src/app/page.tsx`): the
proposition, two entry points into browse and guided intake, four principles
describing how the catalog treats facts, a section on why no prices appear, and
the real scope of what is covered. The `create-next-app` scaffold that had
survived in `src/app/page.tsx` since Phase 0 is gone, along with the five
unreferenced starter SVGs in `public/` — which were being served publicly from
a property site.

**The landing reads no data, deliberately.** A strip of recently published
properties was the obvious alternative and would have reused `PropertyCard`
against the existing `newest` ordering honestly. But nothing on this page varies
by request, visitor, or catalog state, so the most-visited page in the product
prerenders at build with no database dependency — consistent with the reasoning
that kept build-time Postgres out of the dossier's ISR — and no "featured"
ordering is invented that the catalog could not justify. Worth revisiting in
step 9, when real published properties exist to design a content strip against
rather than an empty table.

**The page says only what the product can support.** Its four principles each
restate a rule enforced elsewhere in this codebase rather than making a promise:
areas are never converted between bases, facts are reviewed before publication,
gaps are stated rather than filled, and RERA is a cross-check rather than a
badge. Tests assert the page promises no shortlist, no saved properties, and no
side-by-side comparison — all three are Phase 3, and a landing page advertising
them would be describing a product that is not there.

**The price stance gets a section rather than a footnote.** A buyer who cannot
find a price will assume the data is broken unless told it is deliberate, and
the footer's single line was not enough to carry that.

**Calls to action come from `BUYER_NAV`.** The header has linked `/properties`
and `/intake` since step 4; the landing destructures the same constant rather
than restating the paths, with a test asserting the rendered hrefs match. Two
hand-written copies of a route are the smallest version of the divergence
problem this project exists to prevent.

**Verified:** `bun run test` reports **357 passed across 23 files** (345 from
step 6, plus 12 for this step); `format:check`, `lint`, `typecheck`, and `build`
all pass, with `/` reported as `○ (Static)`. Confirmed against the running app:
`/` and `/properties` return `200`, and `/next.svg` now correctly returns `404`.

**Known and expected:** `/intake` returns `404` until step 8 lands. The header
has carried that link since step 4, and nothing merges to `main` before the
phase boundary.

**A flaky test from step 5 was found and fixed.** The full suite failed once
during this step's verification and passed on a re-run — a re-run is not an
answer, so it was reproduced: `filter-options.integration.test.ts`'s ordering
assertion failed in three of five isolated runs. The cause was in the test, not
the code. It compared Postgres's ordering against JavaScript's own by
re-sorting the list, but Postgres orders by the database collation —
`English_India.1252` on this checkout, confirmed by querying `pg_database`
rather than assumed — which is case-insensitive, while JavaScript's comparison
operators use code-point order. The two disagree whenever values differ in
case, so a random fixture suffix beginning with a letter (`"North a1b2"` versus
`"North Locality"`) flipped the expected order. The assertion now checks the
relative order of two localities that differ at their first letter, which is
the same under any collation. Worth remembering more generally: a database's
ordering must never be asserted by re-sorting in the application language.
Confirmed with six consecutive clean runs of the integration files and three of
the full suite.

## 2026-09-07 — Phase 2B step 6 complete: the property dossier, and both blocking gates closed

**Done:** `/properties/{slug}` renders the full dossier
(`src/app/properties/[slug]/page.tsx`,
`src/components/buyer/dossier-screen.tsx`, `src/lib/properties/dossier.ts`):
identity and developer, possession and scale, unit variants with per-basis areas
and room dimensions, amenities and specifications with their explicit states,
media, RERA facts, location, and the developer's own record — organised
progressively rather than dumped as a table.

**Both open decision gates were resolved before any code was written, both by
deferral.** **Media delivery** moves out of Phase 2B: `property_media.media_type`
includes `brochure_pdf`, so buyer-facing media can itself be a brochure — the
document class that carries price lists — and `ARCHITECTURE.md` puts brochures
and buyer media in the same GCS storage, which makes "public bucket" a much
larger question than it looks. Nothing can populate media this phase anyway,
since the OCR field contract has no media field and no GCS SDK or credentials
exist. **`PropScoreDial`** is out of 2B entirely: no calculation is defined, and
a dial built from the current catalog would present a number the data does not
support — a decorative trust signal in its most damaging form, because a score
looks like a measurement.

**The dossier is incrementally statically regenerated.** `revalidate = 3600`
with a `generateStaticParams` returning an empty array, `dynamicParams` left at
its default — checked against the Next 16 docs bundled in `node_modules`, which
state that returning an array, even an empty one, keeps the route statically
rendered and that an empty one renders each path on first visit. This needs no
database at `next build`, which step 3 had already flagged as a blocker for
prerendering, and a newly published property is served on its first request
rather than 404-ing until a redeploy. `next build` confirms `● (SSG)`.

**Structured data describes a residence, never an offer.** schema.org
`ApartmentComplex` with no `Offer` and no price property, run through the same
`findForbiddenKeys` guard that protects API responses — an offer exists to state
a price, so modelling the page as one would force a choice between fabricating
one and publishing a conspicuously priceless offer. Amenities map honestly:
offered is `true`, explicitly refused is `false`, and unrecorded is omitted,
because no claim has been made either way.

**Two absence rules were decided here.** `rera_registered: false` renders "Not
stated", never "Not registered" — nothing sets the flag, so false means "no
registration recorded", not the accusation of non-compliance the other wording
would publish. And an unpublished area basis is never derived from a published
one; carpet area is not a fixed ratio of super built-up area, and a computed
number sitting beside published ones is indistinguishable from a fact.

**A table dump was caught by running the page, not by reasoning about it.** The
amenity catalog has 26 entries and publishing writes a row for every one, so a
real property rendered a wall of "Not stated" that buried its two real answers.
Stated facts now lead the section and the unrecorded ones sit in a `<details>`
whose summary names the count ("24 not recorded for this property"). Every row
is still in the markup, grouped and labelled, and it opens without JavaScript —
progressive disclosure, not concealment.

**Guards verified by planting violations,** per the standing rule: deriving
built-up area from carpet area at a 1.2 ratio failed both the unit test and the
rendered-screen test; adding an `Offer` to the JSON-LD failed five tests,
including the production exclusion guard.

**Verified:** `bun run test` reports **345 passed across 22 files** (282 from
step 5, plus 63 for this step); `format:check`, `lint`, `typecheck`, and `build`
all pass. Confirmed against real published data too: both dossiers, `200` on
each slug and `404` on an unknown one, the title, meta description, and JSON-LD.

**Also worth knowing:** the dossier is the first surface where `VerifiedBadge`
is reachable at all, since `PropertyDossier` is the only shape carrying the RERA
registration number that is its evidence. It still cannot appear in real data,
because nothing sets `rera_registered`.

## 2026-09-07 — Phase 2B step 5 complete: `/properties` is a real, filterable browse screen

**Done:** The first buyer screen mounted at a route. `src/app/properties/page.tsx`
renders published catalog data through `BrowseScreen`
(`src/components/buyer/browse-screen.tsx`), with the summary card
(`property-card.tsx`), the filter form and its removable filter chips
(`browse-filters.tsx`), the URL arithmetic behind every control
(`src/lib/properties/browse.ts`), and the filter vocabularies
(`src/lib/properties/filter-options.ts`). Every filter in the step 1 contract has
a control, plus pagination, both sorts, and two distinct empty states.

**The page calls the read layer directly rather than fetching its own API.** A
server component fetching its own HTTP route would need an absolute origin URL
it has no reliable way to know, add a network hop to every render, and hand back
JSON typed only by assertion. What the HTTP edge contributes is kept rather than
skipped: the page validates with the same `parseListParams` the route uses, so it
cannot accept a query the API would reject, and passes its result through the
same `assertNoExcludedData` guard, so a price reaching the read layer fails the
page as loudly as it fails the API. The route's `Cache-Control` policy is
untouched and still serves its own consumers.

**Filtering is a plain `GET` form, and the page canonicalises what it submits.**
There is no `"use client"` anywhere in this step. A `GET` form submits every
control it owns, so "Any city" emits `?city=` — which the contract rejects with
`422`, correctly, because over the API an empty value is a broken request rather
than an absent filter. The page drops empty values and explicit defaults and
redirects when that changed anything, so every filtered view is a clean,
shareable, bookmarkable address that works before any JavaScript arrives.
Canonicalisation drops only what a form could not help sending: a malformed
value still reaches validation and is still reported, and an unknown parameter
is still rejected as unknown. A rejected query shows the unfiltered catalog with
a notice carrying the API's own message, rather than a `422` body — the buyer
following a stale link did nothing wrong.

**Three absences on the card were decided, not overlooked**, and each is held by
a test that fails if reversed. **No image:** `gcsPath` is a storage path, not a
URL, and the media-delivery gate still blocks step 6; the card holds a neutral,
textless, `aria-hidden` frame, which makes no "no photo" claim because a
property may well have one this build cannot display. **No verified badge:**
`PropertySummary` carries `reraRegistered` but not the registration number
`VerifiedBadge` requires as evidence, so the card literally cannot construct a
verified fact — the badge stays with the dossier rather than widening the step 1
contract as a side effect of a listing-grid task. **No save or compare:** both
are Phase 3 and depend on routes that do not exist.

**Filter options are derived from published data, never from the catalog in
full.** Publishing writes a `property_amenities` row for every catalog amenity —
the selected ones `available` and the rest `not_stated` — so a status-blind
query would offer all 26, every unselected one of which returns an empty page
and reads as a broken screen. Verified by removing the status filter and
watching the count reach the full catalog, per the standing rule that a guard
which cannot fail proves nothing. The media reservation was verified the same
way, by rendering `gcsPath` as an `<img src>`.

**Possession dates are formatted by hand rather than through `Date`.**
`new Date("2027-01-01")` is UTC midnight, which renders as 31 December 2026 for
any reader west of Greenwich. Shifting a published date by a day is exactly the
kind of invented fact this product exists to avoid.

**Verified by running it, not only by testing it.** Against three properties
published through the real `publishSubmission` transaction: the grid, the
vocabularies, the sparse property rendering "Not stated", both empty states, the
AND semantics of two amenity filters, both sorts, and pagination with its inert
ends. The seeded rows were removed afterwards.

**Verified:** `bun run test` reports **282 passed across 20 files** (191 from
step 4, plus 91 for this step). `format:check`, `lint`, `typecheck`, and `build`
all pass, and `next build` reports `/properties` as `ƒ (Dynamic)`.

**Worth knowing:** running `next dev` rewrites the tracked `next-env.d.ts` to
point at `.next/dev/types/...` where `next build`/`next typegen` point at
`.next/types/...`. It is generated; restore it rather than committing the dev
variant.

## 2026-09-02 — Phase 2B step 4 complete: the buyer shell and the two trust primitives

**Done:** The shared buyer components, under `src/components/buyer/` —
`page-frame.tsx` (the shell plus `PageContainer`, `GridRow`, `PageSection`),
`site-header.tsx`, `site-footer.tsx`, `typography.tsx` (`DisplayHeading`,
`BodyText`, `Eyebrow`, `TabularValue`), `verified-badge.tsx`, and
`fact-value.tsx`. This is the buyer shell specifically; the developer and admin
portals are separate surfaces and this must not grow into one shell gated by
role.

**The two trust rules are enforced by shape, not by discipline.**
`VerifiedBadge` takes a verified _fact_ or `null` — no boolean, no `variant`, no
`children`, no `className` — so there is no way to call it that renders Soft
Gold decoratively, and `null` renders nothing at all. The fact is only derivable
from a RERA registration that carries an actual registration number, which the
badge then displays: the claim and its evidence are inseparable, which is what
`design.v1.md` means by an evidence path. `FactValue` owns the absence
vocabulary — "Not stated" for an unanswered question, "Not offered" for an
answered one — distinct in wording, styling, and explanatory title. A stray
value passed beside an explicit status loses to the status, so a contradiction
surfaces as a defect rather than rendering as though correct, and zero is
treated as a stated value rather than absence.

**The verified badge is currently unreachable, and that is correct.** Nothing
sets `properties.rera_registered`, which defaults to `false`, and the field
contract records against `property.rera_registration_number` that "OCR never
sets RERA verification or a verified badge". A trust signal that extraction
alone could produce would not be a trust signal. It waits on the GujRERA
cross-check path. Step 6's dossier must render correctly with no badge, exactly
as it must with zero media.

**The layout grid is now a token, not a habit.** `--layout-columns`,
`--layout-gutter`, `--layout-margin-mobile`, `--layout-margin-desktop`, and
`--layout-max-width` live in `globals.css`, and the page frame reads them
instead of hard-coding `px-12`. The documented 12-column / 24px / 48px / 16px
grid is therefore stated once; `design-tokens.test.ts` locks the values and
checks each sits on the 8px rhythm.

**A gap in the existing gold guard was closed.** The token test keeps Soft Gold
out of every shadcn colour slot, but nothing stopped a component naming
`--color-verified-gold` directly to make a card feel premium.
`src/components/verified-gold-reservation.test.ts` now scans the source and
fails if any file other than the token declaration and the badge itself
references it. Verified by planting a violation in the footer and watching the
guard fail with that file named — a guard that cannot fail proves nothing.

**Verified:** `bun run test` reports **191 passed across 15 files** (144 from
step 3, plus 47 component and token tests). `format:check`, `lint`, `typecheck`,
and `build` all pass.

**Left for step 7, deliberately:** `src/app/page.tsx` still holds the
`create-next-app` scaffold, so these components are covered by tests but are not
yet mounted in a rendered route.

## 2026-09-02 — Phase 2B step 3 complete: the two buyer read routes are live

**Done:** `GET /api/v1/properties` and `GET /api/v1/properties/{slug}` are
implemented over the step 2 read layer, at
`src/app/api/v1/properties/route.ts` and
`src/app/api/v1/properties/[slug]/route.ts`. Both are thin: parse, query,
respond. Everything with branches — parameter validation, the error envelope,
the cache policy, and the response builders — lives in
`src/lib/properties/http.ts`, because a `route.ts` imports `@/db`, which throws
at import time without `DATABASE_URL`, and the parameter contract should not
need Postgres to be tested.

**Caching was a real decision, not a default.** Three things were checked
against the Next 16 docs bundled in `node_modules` rather than assumed:
`cacheComponents` is off, so `GET` Route Handlers already run at request time;
`dynamic = "force-static"` cannot apply to the listing route at all, because a
force-static handler cannot read `request.nextUrl.searchParams` and that route
is entirely query parameters; and prerendering the dossier route would require
Postgres reachable at build time. So neither route exports a segment config, and
caching is expressed as HTTP `Cache-Control` for a shared cache — listing
`s-maxage=60`, dossier `s-maxage=300`, both with `stale-while-revalidate`, and
`no-store` on every error so a 404 cannot outlive the publish that resolves it.
Shared-cache only, no browser `max-age`, so changing a filter never returns
something the buyer's own browser is holding. Page-level ISR stays with the
dossier page in step 6, which is where SEO actually lives. `next build` reports
both routes as `ƒ (Dynamic)`, confirming it.

**One ambiguity in the step 1 contract had to be resolved rather than guessed.**
The error envelope's `code` field read as either the HTTP status restated or a
failure-class name, and the spec never said which. It is now a machine-readable
slug (`invalid_query_parameter`, `unknown_query_parameter`,
`property_not_found`, `internal_error`), with the HTTP status carrying the
status and `message` naming the offending parameter — and `api-spec.v1.md` has
been amended so the ambiguity does not survive the step.

**Validation repairs nothing.** The contract already said an over-large
`pageSize` is rejected rather than clamped, because a silent clamp lies to the
caller. The same reasoning was extended and documented: a non-repeatable
parameter given twice, an empty value (`?city=`), and a loose integer (`1.5`,
`1e2`, a leading space) are each `422` rather than coerced. The distinction the
routes turn on is unchanged and now tested from both sides — an unknown lookup
key (`propertyType=nonsense`) is a valid query answered with an empty page,
while a malformed value is a broken request answered with `422`.

**The exclusion-list guard now runs in production, not only in tests.**
`no-price.ts` existed from step 2 but was invoked only by tests, so a leak
introduced by a later `select()` would be caught only where a test happened to
walk. Every successful buyer response is now scanned immediately before
serialisation; a body carrying an excluded key fails with `500` rather than
being served with the key quietly stripped, and the offending paths are logged
server-side, never returned. It is tested against a planted leak first — a guard
that cannot fail proves nothing.

**Verified:** `bun run test` reports **144 passed across 10 files** — the 105
from step 2, plus 27 parameter-contract tests needing no database and 12
database-backed wire tests that call the real handlers, with real published
data, and scan the serialised response body for excluded keys. `format:check`,
`lint`, `typecheck`, and `build` all pass. Route test fixtures are published
through the real `publishSubmission` transaction, as in step 2.

**Branching changed at the user's instruction:** Phase 2B now uses one branch,
`task/phase-2b`, instead of one per step. The step branches were a single linear
chain wearing four labels, so collapsing them moved no commits and left `main`
untouched. `AGENTS.md`'s branch rule was amended to match.

## 2026-09-02 — Phase 2B step 2 complete: typed read layer, fixtures, and a working local database

**Done:** Built the buyer read layer under `src/lib/properties/`: `types.ts`
(the step 1 contract as TypeScript, describing the wire shape so numerics stay
strings and timestamps stay ISO), `queries.ts` (`listPublishedProperties` and
`getPublishedPropertyBySlug` as read-only Drizzle queries), `fixtures.ts`
(typed doubles including a deliberately sparse property), and `no-price.ts`
(the exclusion-list guard).

**Three implementation decisions worth knowing:** the database handle is a
function parameter rather than a module import, because `@/db` throws at import
time without `DATABASE_URL` and would otherwise force every fixture test to need
Postgres. BHK and amenity filters use `EXISTS` rather than joins, so a property
with three matching variants still counts once instead of inflating pagination
totals. And the exclusion-list guard is runtime code rather than a test helper,
so fixtures and database tests assert the same rule through one implementation —
and the guard is itself tested against planted leaks first, since a guard that
cannot fail proves nothing.

**Local Postgres is now running, routed entirely through env.** Docker could not
be used (Docker Desktop cannot start — WSL is not installed on this machine), but
a native PostgreSQL 18 install was already present on port 5432. Created the
`propcompare` database, the `private` schema, and the three roles, replicating
`docker/postgres-init/*.sql` plus the ownership grants the container otherwise
gets for free. Nothing is hard-coded: `.env` is gitignored and `.env.example`
remains the template, so a second developer points the same three variables at
their own instance. Documented in
[docs/local-database-setup.md](docs/local-database-setup.md), covering both the
Docker path and the native path. Verified the privilege split holds — the
application role is refused on `private`, the service role is allowed.

**Verified:** `bun run test` reports **105 passed across 8 files** — the first
fully green suite in this project. That includes 35 fixture-path tests needing no
database, 24 new read-layer database tests (pagination, every filter, both sorts,
slug-not-found, price-absence on real query output), and the 6 publisher
integration tests that had never once been runnable here. `format:check`, `lint`,
`typecheck`, and `build` all pass. Read-layer database tests seed their
properties through the real `publishSubmission` transaction, never direct catalog
inserts — the one-write-path rule binds tests too.

**Contract gained two rules it was missing**, found by implementing against it:
`primaryMedia` resolves to the `isPrimary` row, else lowest `displayOrder`, else
`null`; `bhkTypes` is the distinct set across a property's variants. Both are now
in `api-spec.v1.md` so the document and the code cannot drift.

**Defect found and fixed: the migration journal was never committed.**
`.gitignore` had excluded `drizzle/meta/` since the first Phase 0 baseline, so
`db:migrate` could not run on a fresh checkout. Reproducing it rather than
assuming showed the worse half: `db:generate` emitted a _second_ migration
numbered 0000, colliding with the existing one, and because migration 0001 is
hand-written SQL that drizzle-kit cannot regenerate, a regenerated baseline
silently drops the `propcompare_service` grant. Fixed by un-ignoring
`drizzle/meta/` and reconstructing the journal for all five migrations plus the
current schema snapshot — verified both ways: `db:generate` now reports no schema
changes, and `db:migrate` against an empty throwaway database applied all five
and produced a `pg_dump` structure identical to the working one. Also untracked
`tsconfig.tsbuildinfo`, a build cache that was committed and churns on every
typecheck.

**A privilege bug in this session's own setup, caught by that comparison.** The
hand-written local bootstrap had added `ALTER DEFAULT PRIVILEGES` as a
convenience, which granted `propcompare_service` write access to all 36 public
tables — the migrations grant it `SELECT` on `public.unit_variants` alone. The
migrations were already self-sufficient for privileges. The local database was
rebuilt through `db:migrate` and now matches the design exactly: the service role
holds zero write grants on public and one SELECT, and the app role is still
refused on `private`. Both corrections are recorded in `DECISIONS.md`.

**Next up:** step 3 — the buyer read routes (`task/phase-2b-api-routes`):
`src/app/api/v1/properties/route.ts` and `[slug]/route.ts` over this layer, query
parameter validation and coercion returning the documented `422` envelope, and
deliberate caching/revalidation.

## 2026-09-02 — Phase 2B step 1 complete: buyer read contract specified

**Done:** Both buyer read routes are now fully specified in
[docs/api/api-spec.v1.md](docs/api/api-spec.v1.md), replacing the one-line
summaries that blocked every screen in this phase. `GET /api/v1/properties`
documents its query parameters with types and match semantics, pagination, sort,
the `PropertySummary` shape, and its error cases;
`GET /api/v1/properties/{slug}` documents the full `PropertyDossier` shape —
property facts, developer, location, possession, RERA facts, unit variants with
per-basis areas and dimensions, controlled amenities and specifications carrying
their `not_stated` / `explicitly_not_offered` status, and media — plus ordering
rules and 404 behavior. Both routes moved from Planned to Specified in the route
table. Documentation only; no code changed.

**Decision gate resolved:** the v1 listing filter set is fixed at `city`,
`locality`, `propertyType`, `bhk`, `possessionStatus`, and repeatable `amenity`
— the full set matching `prd.v1.md`'s stated browsing dimensions, chosen over a
reduced set that would have deferred amenity filtering. `propertyType` and `bhk`
filter by lookup `key` rather than UUID, keeping listing URLs human-readable and
stable across a re-seed. Recorded as a dated `DECISIONS.md` entry.

**Two rules written down normatively so they cannot be re-invented later:**
presence of a row in `properties` _is_ publication — there is no status column,
and rows only ever arrive through the publish transaction, so "published" needs
no filter and no one should add one. And the exclusion list now binds both
routes at any nesting level: no `unit_price_history`, price, price-per-sqft,
private bucket, submission or review status, provenance, evidence, or OCR
confidence may appear in a buyer response.

**Judgement calls made while writing the contract**, all derived from existing
schema or documented rules: `pageSize` caps at 50 and rejects rather than
silently clamps; repeated `amenity` narrows with AND and matches only
`status = "available"`, since neither honest-incompleteness state is a claim the
amenity exists; `sort` offers only `newest` and `name`, as there is no price to
sort by; an unknown lookup key returns an empty result while a malformed enum or
page number returns `422`; and the dossier returns every associated
amenity/specification row regardless of status, so the client can render absence
explicitly instead of receiving a pre-filtered list.

**Verified:** `bun run format:check` passes. No other check applies — nothing
executable changed.

**Next up:** step 2 — the typed read layer and fixtures
(`task/phase-2b-read-layer`): exported TypeScript types mirroring this contract
exactly, `listPublishedProperties` and `getPublishedPropertyBySlug` as read-only
Drizzle queries, and fixtures satisfying the same types including a deliberately
sparse property.

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
