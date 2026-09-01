# V1 property schema-fields proposal — 2026-09-01

**Status:** approved initial seed — seeded as schema version `v1`
**Task:** [Lookup catalog data](../tasklists/2026-09-01-lookup-catalog-data.md)

## Purpose

This is the proposed initial seed for `property_schema_fields`, the allowlist
used by the Phase 2 OCR pipeline. It is deliberately smaller than the legacy
OCR envelope: a field is included only when it has one canonical destination
in [schema v1](../schema/schema.v1.md), or is a controlled reference to an
already approved catalog. Everything else is discarded at ingestion.

`jsonb_path` identifies the legacy extraction value that informed this
proposal; it is not a promise that a future OCR provider must use the legacy
JSON shape. A future provider adapter must emit the named, typed field value
and evidence envelope for the same contract field.

All rows use `schema_version = "v1"` and `is_active = true`. The listed data
types are contract names for the Phase 2 validator; they are not free-form OCR
value types.

## Proposed seed rows

| Field key                                        | Label                      | Data type                  | JSONPath                                                 | Description                                                                                                                                                                                  |
| ------------------------------------------------ | -------------------------- | -------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `property.name`                                  | Property name              | `string`                   | `$.basics.property_name.value`                           | Proposed published property name; a curator resolves identity before publication.                                                                                                            |
| `developer.name`                                 | Developer name             | `string`                   | `$.basics.developer.value`                               | Proposed developer name; the publish workflow resolves it to the canonical developer record.                                                                                                 |
| `property.type`                                  | Property type              | `property_type_key`        | `$.basics.category.value`                                | Normalized only to an approved `property_types` key: `apartment`, `bungalow`, or `plot`.                                                                                                     |
| `property.city`                                  | City                       | `city_name`                | `$.basics.city.value`                                    | Canonical city name after location review.                                                                                                                                                   |
| `property.locality`                              | Locality                   | `locality_name`            | `$.basics.location.value`                                | Canonical locality after location review.                                                                                                                                                    |
| `property.possession_status`                     | Possession status          | `possession_status`        | `$.basics.status.value`                                  | Maps only to `under_construction`, `ready_to_move`, or `nearing_possession`; ambiguous wording requires review.                                                                              |
| `property.possession_date`                       | Possession date            | `date`                     | `$.basics.possession.value`                              | Parsed possession date; unresolved or approximate wording is review material.                                                                                                                |
| `property.total_towers`                          | Total towers               | `positive_integer`         | `$.project_structure.towers.value`                       | Project-level tower count.                                                                                                                                                                   |
| `property.total_units`                           | Total units                | `positive_integer`         | `$.project_structure.units.value`                        | Project-level unit count.                                                                                                                                                                    |
| `property.rera_registration_number`              | RERA registration number   | `rera_registration_number` | `$.rera.rera_id.value`                                   | Proposed registration number; OCR alone never sets `rera_registered` or a verified badge.                                                                                                    |
| `property.rera_construction_progress_percent`    | RERA construction progress | `percentage_0_to_100`      | `$.rera.construction_progress.value`                     | RERA-declared construction progress, parsed only to a value in the inclusive 0–100 range.                                                                                                    |
| `unit_variants`                                  | Unit configurations        | `unit_variant_array`       | `$.configurations[*]`                                    | Array of reviewed unit variants containing only a BHK key, variant name, explicit area-basis rows, and supported room-dimension objects. Floor ranges and unsupported details are discarded. |
| `property.amenities`                             | Amenities                  | `amenity_key_array`        | `$.amenities[*].value`                                   | Array matched only to approved `amenity_catalog` keys and approved `amenity_synonyms`; unmatched text is review material, not a new amenity.                                                 |
| `property.specifications.construction_quality`   | Construction quality       | `specification_text`       | `$.construction_amenities.construction_quality.value`    | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.flooring`               | Flooring                   | `specification_text`       | `$.construction_amenities.flooring.value`                | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.sanitary_fittings`      | Bath & sanitary fittings   | `specification_text`       | `$.construction_amenities.bath_sanitary_fittings.value`  | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.window_glazing`         | Window glazing             | `specification_text`       | `$.construction_amenities.window_glasses.value`          | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.ceiling_height`         | Ceiling height             | `specification_text`       | `$.construction_amenities.internal_ceiling_height.value` | Preserve reviewed display text; do not silently convert units.                                                                                                                               |
| `property.specifications.open_space`             | Open space                 | `specification_text`       | `$.construction_amenities.open_space.value`              | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.podium_structure`       | Podium structure           | `specification_text`       | `$.construction_amenities.podium_structure.value`        | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.clubhouse_size`         | Clubhouse size             | `specification_text`       | `$.construction_amenities.clubhouse_size.value`          | Preserve reviewed display text; do not silently convert units.                                                                                                                               |
| `property.specifications.lifts_per_tower`        | Lifts per tower            | `specification_text`       | `$.construction_amenities.lifts_per_tower.value`         | Preserve reviewed display text; do not silently convert units.                                                                                                                               |
| `property.specifications.parking_levels`         | Parking levels             | `specification_text`       | `$.construction_amenities.parking_levels.value`          | Preserve reviewed display text; do not silently convert units.                                                                                                                               |
| `property.specifications.density_units_per_acre` | Units per acre             | `specification_text`       | `$.construction_amenities.density_units_per_acre.value`  | Preserve reviewed display text; do not silently convert units.                                                                                                                               |
| `property.specifications.geyser_heat_pump`       | Geyser / heat pump         | `specification_text`       | `$.construction_amenities.geyser_heat_pump.value`        | Evidence-backed display text for the approved specification key.                                                                                                                             |
| `property.specifications.vrv_ac_provided`        | VRV air conditioning       | `specification_text`       | `$.construction_amenities.vrv_ac_provided.value`         | Evidence-backed display text for the approved specification key.                                                                                                                             |

## Explicit exclusions

- Exact configuration prices and rates (`configurations[].price` and
  `configurations[].rate_per_sqft`) remain outside the OCR contract until the
  separate private-commercial-data decision and Phase 2 handling are approved.
- `state`, source URLs, source file paths, image candidates, warnings, and the
  legacy `verified` flag have no canonical property fact destination. The
  source-document workflow retains approved provenance separately.
- `project_structure.floors`, `units_per_floor`, and configuration floor ranges
  are excluded because schema v1 has no canonical destination for them. They
  must not be hidden in `dimensions` or a new free-text field.
- Room details are included only within `unit_variants` when they validate
  against the existing `unit_variants.dimensions` shape. Fixture names,
  parking allocations/counts, brands, marketing claims, and nearby landmarks
  are discarded.
- RERA start/completion dates and links are cross-check material for the
  dedicated RERA workflow; this brochure OCR contract does not create a
  second possession-date source. Project land area and carpet-area range are
  also excluded because the audited legacy RERA envelope did not establish
  source fields for them.

## Approval effect

Approval authorized idempotent seed rows in `property_schema_fields`. It does
not authorize an OCR provider, extraction run, submission, private-price write,
or any direct write to a live catalog table.
