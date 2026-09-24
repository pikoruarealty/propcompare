# Tasklist — comparison's zero-new-extraction derived metrics

**Status:** done, verified 2026-09-24 (not looked at in a browser)
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** nothing new — every input here is already in the schema (`properties.plotAreaSqft`, `properties.totalUnits`, `unit_variants[].unitsPerFloor`, `unit_variants[].areas` [carpet + super_built_up, schema v12's duplicate-basis fix], `dimensions.balconies`, `amenity_catalog.category`)
**References:** `DECISIONS.md` 2026-09-23 ("Competitive review against Propsoch"), `docs/design/comparison.v1.md`, `src/lib/compare/model.ts` (the "project" group ~line 654, the amenities group ~line 687)

## Why this exists

Reviewing a competitor (Propsoch) surfaced that `/compare`'s "The project" group never rendered `plotAreaSqft`, despite it existing since schema v1, and never computed the numbers a buyer would actually want from it (density, efficiency). None of this needs a brochure re-read — it's arithmetic and a rendering change over data already paid for.

## Scope

1. **Land area row** — `properties.plotAreaSqft`, formatted (consider showing acres alongside sq ft, matching how Propsoch's audience reads land size — decide unit display, not raw addition).
2. **Unit density** (units/acre) — `totalUnits / (land area / 43_560)`. Land area is the property's own plot area, else RERA's registered land area, labelled "per RERA" (owner decision 2026-09-24). Missing-data rule: if either input is null, the row is "not stated," never a guess.
3. **Units per floor** — _changed by owner decision 2026-09-24:_ the chosen unit type's own stated value, in "The unit type" group; no project-level sum (on Kimana every unit type states 2, so a sum reads 12 for a floor that has about 4).
4. **Efficiency %** (carpet ÷ super_built_up × 100) — per unit type, in "The unit type" group, not "The project" (Propsoch shows it per-configuration, and our unit-type matching already makes that the natural home). Only computed when a unit type states both bases.
5. **Balcony area ratio %** — balcony and terrace room area(s) ÷ the unit type's stated **carpet area** (owner decision 2026-09-24), same group and same missing-data rule.
6. **Amenity category sub-headers** — `amenity_catalog.category` is already loaded and sorted by in `model.ts`; render it as a visible group heading within the Amenities section instead of a silent sort key. Every amenity still shown (principle 2, unchanged) — this only adds structure, not hiding.
7. **Developer completed-projects count** — count of the developer's own `properties` rows at `possession_status = 'ready_to_move'`, computed at read time, not stored.

## Non-goals (see DECISIONS.md for why each is deferred, not rejected)

- Open area %, park area, floor area ratio, elevator count/crowd factor, clubhouse area as a number, common walls % — all need a **new extraction field**, several needing a genuinely numeric data type `specification_text` doesn't provide. Separate tasklist once scoped.
- Restructuring `nearby_connectivity`/`nearby_hospitals`/`nearby_schools` (schema v12) into discrete numeric distance-pair fields for real comparison bars — a real improvement, but its own design pass, not a rendering change.
- "Common amenities" grouped-but-shown bucket, "(Rare)" tagging, neighbourhood natural-feature proximity — all new feature ideas, not decided.
- Master Bedroom Area as its own field — confirm first whether "largest bedroom, already sorted first" already satisfies this before adding a field for the same fact under a new name.

## Non-goals, permanent (standing principles, not open questions)

- No price, price/sqft, or budget bucket, anywhere (`AGENTS.md`, comparison principle 7).
- No score, rank, "winner," or subjective rating (Propscore, Investment Potential, Livability) — comparison principle 7, reaffirmed against this exact competitor in `DECISIONS.md`.
- No generated narrative text — the rule-based "if you choose A over B" summary (principle 3) is the sanctioned mechanism; it is not being replaced or supplemented with prose.

## Implementation checklist

- [x] Confirm missing-data behavior for each computed row against `docs/design/comparison.v1.md`'s data rules (shown only when at least one side has a value; "differs" on normalized values) — a _computed_ row needs the same honesty a stated one gets: never compute from a partial input and call it a real number.
- [x] Land area and unit density rows in "The project" group; units per floor (per unit type) in "The unit type" group.
- [x] Efficiency %, balcony area ratio rows in "The unit type" group.
- [x] Amenity category sub-headers in the Amenities group render.
- [x] Developer completed-projects count in the Developer-facing rows (check whether a "Developer" group/row exists in `model.ts` today or needs adding).
- [x] Tests: a computed row with all inputs stated, a computed row with one side's input missing (must read "not stated," never a wrong number), amenity categories render as grouped headings without changing which amenities show.
- [x] `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run`.

## Acceptance

A comparison shows land area, unit density, units-per-floor, per-unit-type efficiency and balcony ratio, and amenities grouped by category — all computed from data already in the database, none of it requiring a new brochure read, none of it violating the no-price/no-score principles.

## Completion record

Built in `src/lib/compare/model.ts` (rows and helpers), `src/lib/compare/lock.ts` (category kept in the locked model) and `src/components/buyer/compare-screen.tsx` (category headings). Tests: `src/lib/compare/derived-measures.test.ts`, `src/components/buyer/compare-categories.test.tsx`. Reasoning and the live-data findings: `DECISIONS.md` 2026-09-24 (derived metrics).

Deviations from the plan above: units per floor is per unit type, not summed; balcony ratio is over carpet area; category headings also apply to specifications. Efficiency shows nothing yet because no project stores a super built-up area. The developer's completed-projects count was already in the dossier; the comparison now shows it as "Developer's completed projects listed here".
