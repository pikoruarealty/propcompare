# PropCompare canonical data schema — v5

**Status:** active schema baseline as of 2026-09-02
**Supersedes:** [schema v4](schema.v4.md) for new implementation work

Schema v5 retains every v4 entity and constraint. It adds four brochure-sourced
fields that the original whiteboard schema called for but that
`docs/data/v1-property-schema-fields.proposal.2026-09-01.md` had excluded for
lack of an audited legacy source field (see the 2026-09-02 `DECISIONS.md`
entry "Schema v5 adds total floors, units-per-floor, non-RERA-gated plot/land
area, and a developer profile narrative field").

```text
developers (
  ...,
  profile_narrative text nullable,
  ...
)

properties (
  ...,
  total_floors int nullable,
  plot_area_sqft numeric nullable,
  ...
)

unit_variants (
  ...,
  units_per_floor int nullable,
  ...
)
```

- `developers.profile_narrative` is evidence-backed free text describing the
  builder, sourced the same way as other OCR contract fields. It is not a
  controlled-vocabulary value and carries no synonym table.
- `properties.total_floors` is the building's total storey count. It is
  distinct from the existing `total_towers` (tower count) and
  `total_units` (unit count).
- `properties.plot_area_sqft` is the brochure/developer-stated land area. It
  is distinct from `rera_project_land_area_sqft`: the RERA column stays
  gated to `rera_registered = true` and sourced only from the RERA extract,
  while `plot_area_sqft` is populated whenever a submission's evidence
  states it, RERA-registered or not. The two are never reconciled or
  overwritten by one another; a property may carry both, either, or neither.
- `unit_variants.units_per_floor` is scoped to a variant (configuration),
  not the property as a whole, because a tower with mixed configurations
  does not have one property-wide units-per-floor count.

None of these four fields participate in the RERA-registration-gated
fallback logic that governs `rera_*` columns, and none replace or alias an
existing column — each is a genuinely new fact with no prior canonical home.

## Field-contract and evidence impact

Adding these columns requires corresponding new `property_schema_fields`
contract rows (extending the table in
`docs/data/v1-property-schema-fields.proposal.2026-09-01.md`) before the OCR
adapter or extraction prompt may emit them — the adapter only accepts fields
from the active contract (schema v3 foundation). Evidence for these fields
flows through the existing `property_submission_field_evidence` table; no new
provenance mechanism is introduced. This contract extension and the adapter/
migration work are implemented in the schema-v5 tasklist, not this document.
