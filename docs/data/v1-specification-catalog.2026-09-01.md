# V1 specification catalog — 2026-09-01

**Status:** approved initial seed — extensible through catalog review
**Task:** [Lookup catalog data](../tasklists/2026-09-01-lookup-catalog-data.md)

## Purpose

Construction and building-detail facts appear as an evidence-backed **Specifications** section on a property detail page. They are not buyer discovery filters in v1.

Each specification has one canonical key and label. Its evidence-backed value may vary by property; the field name itself never varies by casing, spacing, or brochure wording. A missing value is `not_stated`, not an invented claim.

## Initial catalog

| Category           | Key                      | Buyer-facing label       | Source-field synonym      |
| ------------------ | ------------------------ | ------------------------ | ------------------------- |
| Finish quality     | `construction_quality`   | Construction quality     | `construction_quality`    |
| Finish quality     | `flooring`               | Flooring                 | `flooring`                |
| Finish quality     | `sanitary_fittings`      | Bath & sanitary fittings | `bath_sanitary_fittings`  |
| Finish quality     | `window_glazing`         | Window glazing           | `window_glasses`          |
| Design & space     | `ceiling_height`         | Ceiling height           | `internal_ceiling_height` |
| Design & space     | `open_space`             | Open space               | `open_space`              |
| Design & space     | `podium_structure`       | Podium structure         | `podium_structure`        |
| Design & space     | `clubhouse_size`         | Clubhouse size           | `clubhouse_size`          |
| Building operation | `lifts_per_tower`        | Lifts per tower          | `lifts_per_tower`         |
| Building operation | `parking_levels`         | Parking levels           | `parking_levels`          |
| Building operation | `density_units_per_acre` | Units per acre           | `density_units_per_acre`  |
| Mechanical systems | `geyser_heat_pump`       | Geyser / heat pump       | `geyser_heat_pump`        |
| Mechanical systems | `vrv_ac_provided`        | VRV air conditioning     | `vrv_ac_provided`         |

## Interpretation rules

- The catalog key and label are controlled through `specification_catalog`; source spellings map through `specification_synonyms`.
- A property-specific value is attached only via a reviewed `property_submissions` publish transaction, with source evidence. It is never seeded directly.
- Numeric-looking values such as ceiling height, clubhouse size, lift count, parking levels, or density must be parsed and reviewed before publication. Until a unit/normalization policy is implemented, preserve the approved source value as evidence-backed display text rather than silently converting it.
- Amenity availability and specifications remain separate: `clubhouse` is an amenity; `clubhouse_size` is its optional specification.
