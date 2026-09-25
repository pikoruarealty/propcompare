# PropCompare canonical data schema — v17

**Status:** implemented by migration `0020_rera_snapshot`.
**Supersedes:** [schema v16](schema.v16.md) for new implementation work; v16's content is not edited.

v17 stores what the regulator states about a project beyond the fields the contract already had (`DECISIONS.md` 2026-09-24, "RERA data, second pass"; `docs/tasklists/2026-09-24-rera-second-pass.md`). The owner approved the change on 2026-09-24.

## 1. `properties.rera_snapshot` — new column

| Column          | Type  | Notes                                                                       |
| --------------- | ----- | --------------------------------------------------------------------------- |
| `rera_snapshot` | jsonb | Nullable. One versioned object; `null` until a RERA check has been applied. |

The object is `RegulatorDetails` plus `source` (the regulator's code) and `carpetGroups`, as built by `buildReraSnapshot` (`src/lib/rera/snapshot.ts`):

- `version` (1), `source`.
- `layoutLandAreaSqm`, `openAreaSqm`, `coveredAreaSqm`, `coveredParkingAreaSqm`: square metres, as printed.
- `filing`: the quarterly filing the progress comes from (`quarter`, `periodEndsOn`, `source` of `quarterly_filing` or `certified_form_one`, `progressPercent`) and per-block `progressPercent`, `floors`, `lifts`, `slabs`.
- `inventory`: `totalUnits`, `bookedUnits`, `availableUnits` and `asOn`, the date the regulator's flat list carries.
- `filings`: how many quarterly and half-yearly filings are listed and how many were submitted.
- `planPassingAuthority`, `registeredOn`.
- `architects`, `engineers`, `contractors`: name and stated completed-project count only.
- `boundary` (the drawn ring) and `centre`.
- `carpetGroups`: each distinct carpet area per block with `flatCount`, `bookedCount` and the exclusive balcony area range.

It holds no time of fetch, so a check that finds the same facts proposes nothing; each figure carries its own "as on" quarter or date. **Money and contact details never enter it**: the adapter does not read them, and validation (`reraSnapshotProblem`) refuses any key named for a cost, price, amount, phone, email, account, PAN or KYC at any depth, so the rule holds for anything that reaches the publish transaction.

Written only by the publish transaction, from the contract field `property.rera_snapshot` (data type `rera_snapshot`, RERA only, never asked of the extraction model, shown and applied in the RERA panel and not in the fields panel).

## 2. Existing columns that gain a writer

`properties.latitude` and `properties.longitude` have existed since v1 and had no writer. They are now written by the publish transaction from the contract fields `property.latitude` and `property.longitude` (data type `positive_number`, range-checked to India: latitude 6 to 38, longitude 68 to 98). RERA proposes them from the centre of the project boundary it draws; a value already held is never overwritten by a later check. They are proposed as `needs_review`, so publishing waits for an admin or the developer to look at the map.

`properties.map_url` (v15) is proposed the same way, as a pin at the boundary's centre, or as a Google Maps search from the name and place when RERA drew no boundary.

## 3. Contract fields added

`property.rera_snapshot`, `property.latitude`, `property.longitude`, all `schema_version` `v17`, all in `RERA_ONLY_FIELD_KEYS`.

## 4. Also fixed alongside

`loadLiveValues` now reports `property.pincode`, `property.launch_date` and `property.rera_project_land_area_sqft`, which were published but never read back. A RERA check therefore saw them as not held on a published property and would have proposed them again every quarter.

## Addendum, 2026-09-25: `promoter` (no migration)

The snapshot object gains an optional `promoter`: `{ yearsInGujarat, completedProjects, ongoingProjects }`, each a whole number or `null`, read from the promoter's own record (`/user_reg/promoter/promoter{id}`, the id being the project summary's `promoterId`). RERA prints the counts "by Group Entity". Absent in a snapshot stored before it was read, and `null` when the record states none of the three. A jsonb key inside an existing versioned object, so `version` stays 1 and nothing is migrated; `reraSnapshotProblem` checks the three figures. The promoter's contact details, PAN, address and website are not read, and neither are the areas the group has built (RERA reports an area for "completed projects" even where the completed count is zero). See `DECISIONS.md` 2026-09-25.

## Addendum, 2026-09-25: `towers` and `towerCount` (no migration)

Optional keys of the same versioned object. `towers`: per tower, `{ name, floors, unitsPerFloor, minPerFloor, maxPerFloor, flats }`, whole numbers counted from the registered flat numbers (`src/lib/rera/towers.ts`); null when the list was incomplete or its numbers did not read. `towerCount`: the towers the registered block names join ("A+B" is two). Only flat numbers and block names are read for these, nothing else of a flat's row. See `DECISIONS.md` 2026-09-25.
