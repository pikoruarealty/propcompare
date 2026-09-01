# Legacy OCR structure audit — 2026-09-01

**Status:** complete — review required before any seed data is created
**Tasklist:** [Legacy OCR structure audit](../tasklists/2026-09-01-legacy-ocr-structure-audit.md)

## Purpose and boundary

This report records only the reusable _shape_ of the user-authorized legacy OCR corpus. It is not a property import, source-data archive, or approval of catalog data.

No raw JSON, property identity, address, developer, price, source URL, media path, document text, or duplicate-comparison token was copied into this repository. PDFs and images were excluded. The legacy source remains outside this repository.

## Corpus and duplicate finding

| Corpus                                      | JSON files | Structurally identifiable records | Distinct normalized name-and-city comparisons |
| ------------------------------------------- | ---------: | --------------------------------: | --------------------------------------------: |
| Current extraction jobs                     |         27 |                                27 |                                            26 |
| Current + historical hashed extraction jobs |         69 |                                69 |                                            28 |
| User-confirmed usable property set          |          — |                                 — |                                            24 |

The comparison was ephemeral and aggregate-only: a normalized name-and-city value was used in memory, then discarded. It is useful for detecting obvious copies, but it is not a durable identity rule and cannot determine which records belong in the confirmed 24-property set. Historical backups are therefore unsuitable as import input.

**Required later:** before Phase 2 ingestion, create a review-owned source manifest that selects the 24 accepted records and defines their canonical identity. Do not derive that manifest from filename, name, or city matching alone.

## Reusable extraction envelope

Every current job is an object with these top-level sections:

`basics`, `configurations`, `amenities`, `construction_amenities`, `developer`, `highlights`, `project_structure`, `rera`, `source_files`, `warnings`, `images`, and `image_candidates`.

The scalar extraction sections consistently use the same evidence envelope:

```text
value, found, confidence, evidence, source_file, source_page,
derived, verified, validation_warning
```

This aligns with the v1 submission model: a proposed value belongs in the submission payload; confidence and a resolved source-document/page reference belong in `property_submission_fields`. The legacy `verified` flag is not trustworthy as an approval signal: it is `false` on all 27 current jobs.

## Coverage summary

Counts below are file-level across 27 current extraction jobs. They demonstrate whether a field is worth supporting, not whether its value is correct.

| Source group         | Consistently shaped fields                                                                                                        | Non-empty coverage                                                           | Use in PropCompare                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Basic identity       | property name, developer, category, city, locality, state, status, possession                                                     | Name 27; developer 25; locality 23; city 18; category 9; status/possession 4 | Candidate submission fields; admin review required.                                  |
| Project structure    | towers, units, floors, units per floor, BHK types, plot size                                                                      | 10–18 depending on field                                                     | Candidate structured property/unit fields.                                           |
| RERA                 | ID, link, start date, completion date, construction progress                                                                      | ID 23; start date 21; completion 21; progress 20                             | Candidate cross-check fields, never automatic verification.                          |
| Unit configurations  | BHK, variant label, carpet/built-up/super-built-up area, floor range, room dimensions, price/rate                                 | 26 jobs have configurations; 168 configuration entries                       | Candidate unit payload shape; exact price/rate is excluded from the public contract. |
| Construction details | flooring, sanitary fittings, glazing, ceiling height, lifts, parking, podium, open space, clubhouse size, density, heat pump, VRV | 3–20 depending on field                                                      | Candidate `specification_catalog` taxonomy, with value text after review.            |
| Amenities            | array of value-plus-evidence entries                                                                                              | 24 jobs; 949 entries                                                         | Candidate matching source only; must be normalized through catalog + synonym tables. |

The construction-detail and configuration values are mostly strings, including values that need numeric or date parsing. A Phase 2 ingestion validator must parse and reject/route ambiguous values for review; it must not coerce them silently.

## Catalog recommendation — candidates only

The current amenity array has **789 distinct source labels** after only per-property repetition is removed. It mixes facilities with unit details, measurements, marketing phrases, nearby-place claims, and operational features. It is not safe to seed as-is.

These are the strongest proposed starting groups for a reviewed amenity taxonomy, based on repeated generic facility concepts and evident synonym variants:

| Proposed category | Candidate canonical keys                                                           |
| ----------------- | ---------------------------------------------------------------------------------- |
| Wellness          | `swimming_pool`, `gymnasium`, `spa`, `sauna`, `steam_room`, `jacuzzi`, `yoga_deck` |
| Recreation        | `indoor_games`, `home_theatre`, `library`, `box_cricket`, `multipurpose_court`     |
| Social            | `multipurpose_hall`, `banquet_hall`, `lounge`                                      |
| Outdoor/family    | `children_play_area`, `landscaped_garden`, `gazebo`, `lawn`, `walkway`, `pet_park` |
| Access/safety     | `security`, `visitor_parking`, `service_lift`                                      |

Examples of normalization that should be reviewed as synonyms rather than separate catalog records include gym/gymnasium/fully-equipped gym, children/kids/toddler play-area variants, clubhouse spellings, theatre spellings, and landscape-garden variants.

Do **not** turn room names, fixtures, parking counts, lift counts, dimensions, nearby landmarks, marketing claims, or proprietary branded labels into amenities. Those need either a reviewed specification definition or exclusion from v1.

## Candidate OCR contract mapping

The table is a proposed field set for review. It is not a `property_schema_fields` seed and does not authorize an OCR pipeline to extract every listed field.

| Legacy source path                                                           | Candidate destination                                                | Required treatment                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `basics.property_name`, `developer`, `city`, `location`, `state`, `category` | Core property/developer/location fields                              | Normalize names and location; require human identity resolution.                                   |
| `basics.status`, `possession`, `possession_confirmed_as_of`                  | Possession status/date                                               | Map only to the canonical enum/date after parser validation.                                       |
| `project_structure.*`                                                        | Property totals and supported BHK types                              | Parse numeric values; preserve absence as `not_stated`, never fabricate.                           |
| `rera.rera_id`, dates, progress                                              | Existing RERA fields on `properties`                                 | Use as a cross-check submission; do not set a verified badge from OCR.                             |
| `configurations[].bhk_type`, `variant_label`, areas, floor range, rooms      | `unit_variants` and `unit_areas` via the Phase 2 publish transaction | Parse area basis explicitly. Room dimensions need a payload schema before acceptance.              |
| `amenities[].value`                                                          | `amenity_catalog` + `amenity_synonyms` match                         | Match only approved synonyms; unresolved text is review material, not a new catalog value.         |
| `construction_amenities.*`                                                   | `specification_catalog` + value text                                 | Seed a reviewed specification key first; preserve values only through submission review.           |
| `configurations[].price`, `rate_per_sqft`                                    | Private commercial path, if approved                                 | Excluded from the public OCR contract. Requires a separate Phase 2 private-data handling decision. |

## Decision needed to continue lookup seeding

Approve, amend, or reject the proposed amenity groups; select the specification keys to keep; define INR budget buckets; and approve the exact `property_schema_fields` rows (key, label, data type, JSONPath, schema version, description). Only then may the lookup seed be written.
