# PropCompare canonical data schema — v18

**Status:** implemented by migration `0021_drop_dead_rera_columns_retire_specs`.
**Supersedes:** [schema v17](schema.v17.md) for new implementation work; v17's content is not edited.

v18 removes columns nothing ever wrote and switches off two contract fields the regulator now covers. The owner approved both on 2026-09-24 (`DECISIONS.md`, "RERA second pass, as built" and "clean-up").

## 1. Columns dropped from `properties`

| Column                            | Why it went                                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rera_last_verified_at`           | No code ever wrote it, so it was `null` on every property and the "RERA Verified" badge never showed a date. The date of the latest successful RERA check (`rera_fetch_jobs`) is now what the badge and dossier read. |
| `rera_carpet_area_range_min_sqft` | No writer. The dossier's "Carpet area range" was always empty. It now shows the regulator's own range from `rera_snapshot.carpetAreaRangeSqm`, converted once when read.                                              |
| `rera_carpet_area_range_max_sqft` | As above.                                                                                                                                                                                                             |

All three were `null` on every row when dropped. `DossierRera.lastVerifiedAt` was removed with them; `lastCheckedAt` is the one date.

## 2. Contract fields switched off (data change, no structure change)

`property.specifications.open_space` and `property.specifications.density_units_per_acre` are set `is_active = false` in `property_schema_fields`. They are **deactivated, not deleted**: the rows, the specification catalog entries and any value a property ever held stay, so this is reversible by setting the flag back. The extraction model is no longer asked for them and the review panel no longer lists them.

Why these two: the regulator states open area (square metres, on every registration checked) and the land area and unit count from which density is calculated. Both now appear as numbers in the comparison and the dossier ("Open area", "Density"), so a brochure's free-text version added nothing and could disagree. The seed marks them retired (`RETIRED_FIELD_KEYS` in `src/db/seed.ts`) so a fresh database matches.

## 3. Nothing else changes

No table is added; no live-catalog write path changes.
