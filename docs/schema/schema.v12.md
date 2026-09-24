# PropCompare canonical data schema — v12

**Status:** implemented — data-only, no migration. `property_schema_fields` and `specification_catalog` rows added by `src/db/seed.ts`; run `bun run db:seed`.
**Supersedes:** [schema v11](schema.v11.md) for new implementation work; v11's content is not edited.

v12 is 20 new `specification_text` field-contract entries, found necessary while reviewing a real extraction (Godrej Altus flipchart, 2026-09-23, 37 pages — the richest brochure processed so far).

## Why this exists

That run's `amenities`, `project-details`, `specifications`, and `floor-plans` scopes correctly read vastu compliance, connectivity to named landmarks (metro, airport, railway), nearby hospitals and schools, clubhouse and courtyard area, the plot number, and 13 more construction-spec facts — but none of those concepts had an active field key, so the model put them in `unmappedRawEvidence`, and nothing downstream of the adapter persists that array. The data was read, paid for, and discarded on every run, not just this one.

`specification_text` (existing since schema v1) already covers exactly this shape — an evidence-backed string tied to a controlled key, rendered generically on the dossier with no per-field UI code. No new table, no new data type: 20 new `specification_catalog` keys plus their matching `property_schema_fields` rows, following the identical pattern `flooring` and `clubhouse_size` already use.

## New fields

| Key | Category |
|---|---|
| `windows`, `doors`, `toilet_flooring_dado`, `wall_finishing`, `kitchen_finishes`, `material_tolerances` | Finish quality |
| `electricals`, `power_backup` | Mechanical systems |
| `waterproofing`, `drainage`, `damp_proofing`, `safety_features` | Building operation |
| `special_features`, `courtyard_area` | Design & space |
| `vastu_compliance` | Certifications & compliance (new category) |
| `plot_no`, `nearby_connectivity`, `nearby_hospitals`, `nearby_schools` | Location & legal (new category) |
| `amenities_full_list` | Amenities as stated by developer (new category) |

Each field is `property.specifications.<key>` / `specification_text`, matched into `property_specifications` by the existing publish-transaction logic (`SPEC_FIELD_PREFIX` matching in `src/lib/submissions/publisher.ts`) — unchanged code, new data only.

## `amenities_full_list` — the one field with a deliberate, different rule

Every other field here compares like any other specification row. This one does not: it is **every amenity the brochure names, exactly as printed** (35+ on the flipchart brochure, versus the 14 that matched `amenity_catalog`), and it is **dossier-only** — never rendered as a comparison row.

Reason: `property.amenities` (catalog-matched, schema v1) is what makes a comparison row mean the same thing on both sides — two brochures calling the same rooftop lounge "SKYPLEX" and "Sky Lounge" would otherwise read as two different amenities and manufacture a difference that isn't real (`DECISIONS.md` 2026-09-23). `amenities_full_list` exists so **"we can't show less than the brochure printed"** is still true on the dossier, without weakening that comparison guarantee. A recurring name in this field across brochures is exactly the signal for promoting it into `amenity_catalog` proper — that promotion is a human decision (per the existing 2026-08-31 "seed a limited set, don't create a filter simply because it occurs in a brochure" rule), made periodically, not automatically.

## Not done here

- `unmappedRawEvidence` itself is still discarded once extraction finishes — this closes the specific gap a real brochure just proved costly, not the general one. A masterplan legend item, a floor-level note, or any other one-off fact this schema didn't anticipate still has nowhere to go. Whether that becomes a genuinely general admin-reviewable store, versus continuing to promote named gaps as they're found (as this entry does), is an open product question, not decided here.

## Follow-up closed 2026-09-23

The dossier now renders `amenities_full_list` in its own labelled block beside the catalog-matched Amenities section (`splitAmenitiesFullList` in `src/lib/properties/dossier.ts`), rather than inside the generic Specifications category grouping alongside true specs. It is the one field this schema version treats differently by design (see above), so it is the one field with dedicated dossier UI — every other v12 field still renders through the generic `specification_text` path with no per-field code.
