# Tasklist — RERA second pass: read what the regulator states, keep it, compare it

**Status:** in progress (started 2026-09-24)
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `DECISIONS.md` 2026-09-24 ("RERA data, second pass": findings, owner decisions, proposed rows), `docs/design/comparison.v1.md`, `docs/schema/schema.v16.md` (schema.v17.md is written with the migration), `src/lib/rera/` (adapter, mapping, refresh), `src/lib/submissions/publisher.ts` (the only writer of live tables), `src/lib/compare/model.ts`.
**Owner decisions in force:** schema change approved; RERA outranks every source except price, with the source shown where it differs; always the latest quarter, refreshed each quarter by the existing scheduler; "Units per acre (calculated)" becomes "Density"; open area added; availability wanted; map link proposed from RERA's polygon (else a name search) and confirmed by an admin or the developer beside a small map.

## Design (mine, for the owner to veto)

- **One new column, `properties.rera_snapshot` (jsonb, schema v17).** The regulator's latest normalised project facts that no other source states (open and covered area, units booked and available with the date, lifts and floors per block, per-block progress, compliance counts, plan-passing authority, registration and start dates, the team, per-unit-type availability and exclusive area). One representation, one field key (`property.rera_snapshot`, data type `rera_snapshot`, RERA-only, never asked of the extraction model), written only by the publish transaction. A fact that another source can also state keeps its own scalar field so a difference is reviewed fact by fact: land area, total units, construction progress, possession date, amenities, pincode, and the latitude, longitude and map link that already have columns.
- **Why not a column per fact:** about twenty columns, field keys, display names and publisher lines for facts that have no second source to disagree with; the snapshot carries its own version and quarter label, and any fact can be promoted to a column later without losing anything.
- Nothing money-valued enters the record, the snapshot or any test fixture except as an obvious poison marker that tests assert never appears.

## Checklist

### 1. Adapter and record (no database)

- [ ] `RegulatorRecord` gains: layout land area (the figure RERA prints as the project's land area, now preferred), open area, covered area, covered parking area, latest filing (progress, per-block progress, floors, lifts, quarter), inventory (units, booked, available, as-on date), per-group availability and exclusive area, boundary polygon and centre, filing counts, plan-passing authority, registration and start dates, team names with stated project counts, declared amenity yes and no.
- [ ] Latest filing read from `quarter/public/get-qtr-form-details/{id}`, falling back to the certified Form 1 endpoint; each figure labelled with where it came from.
- [ ] Inventory from the latest quarter's form three, not the summary's newer draft (matches the site's "as on" date).
- [ ] `withDefaults` fills every new field for records stored before this change.
- [ ] Fixtures and tests: each new figure read; money and personal details never reach the record (poison markers); a missing piece is a recorded gap.
- [ ] Not read, on purpose: rupee figures, bank details, partners' and signatories' names, phone numbers, emails, documents, RERA's own score.

### 2. Schema v17 and publish (surface to the owner: approved 2026-09-24)

- [ ] `docs/schema/schema.v17.md`; migration renamed descriptively, `when` set past the latest (mind the journal gotcha in the session handoff).
- [ ] Field keys and seed rows: `property.rera_snapshot`, `property.latitude`, `property.longitude`; validators; `RERA_ONLY_FIELD_KEYS`.
- [ ] Publisher writes them; live values and dossier queries read them.
- [ ] Mapping: RERA-authoritative rules for the new scalar fields; snapshot proposed whenever it differs; map link proposed only when none is held.
- [ ] Integration tests: publish writes the snapshot and coordinates; an edit without them leaves them alone.

### 3. Comparison and dossier

- [ ] Rename "Units per acre (calculated)" to "Density" (the note "land area per RERA" stays where it applies); use the regulator's land area.
- [ ] Rows: open area, covered area and open share, construction progress with its quarter, units booked and available as on the date, lifts and units per lift (calculated), plan-passing authority, registration date and project age, filing record; per unit type: units available and RERA's carpet and exclusive area; team rows.
- [ ] Every row honest when a value is missing; regulator source shown; tests in the style of `derived-measures.test.ts`.
- [ ] Dossier shows the same facts under a RERA heading with the "as on" dates.

### 4. Map link and confirmation

- [ ] Centre of RERA's polygon becomes a proposed Google Maps link and coordinates; without a polygon, a search link from the property name and locality.
- [ ] Location tab shows the small map beside the link for the admin or developer to confirm or edit before publish.

### 5. Admin panel

- [ ] The RERA panel shows the new facts and where each differs from what is held.

### 6. Field audit (owner request 2026-09-24, after the above)

- [ ] List every column and contract field that nothing can fill (for example `rera_carpet_area_range_min_sqft` and `max_sqft`, `launch_date` on RERA-only projects, `rera_last_verified_at`) and every fact we already fetch and do not use; for each, say whether to fill it from RERA, from the brochure, by hand, or drop it. Report to the owner before changing anything.

### 7. Verification and records

- [ ] `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (not while the OCR worker runs).
- [ ] `PROGRESS.md` entry; `DECISIONS.md` updated for anything decided while building.

## Open items needing the owner or the browser

- Promoter group history (years of experience, completed and ongoing projects): the endpoint rejects every parameter we can guess. Copy the request URL from DevTools, Network tab, on the Promoters tab.
- Whether availability should refresh more often than quarterly.
- Check the exclusive-balcony figure against Anamika's brochure page 11 before it is relied on.
