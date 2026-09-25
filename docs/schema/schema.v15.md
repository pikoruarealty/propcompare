# PropCompare canonical data schema — v15

**Status:** implemented by migration `0018_property_map_url` and a seeded field-contract row (`bun run db:seed`).
**Supersedes:** [schema v14](schema.v14.md) for new implementation work; v14's content is not edited.

v15 adds the project's Google Maps link (`DECISIONS.md` 2026-09-24, `docs/tasklists/2026-09-24-location-section.md`).

## 1. `properties.map_url` — new, nullable text

The Google Maps link an admin sets for the project. Written only by the publish transaction, like every other property column.

## 2. New field-contract entry

| Key                        | Data type | Meaning                                                                                                                                          |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `property.google_maps_url` | `map_url` | The project's Google Maps link. Set by an admin in the review panel's Location tab; never read from a brochure or asked of the extraction model. |

`map_url` is a new data type: an `https` link to Google Maps (`google.com/maps…`, `maps.google.com`, or a `maps.app.goo.gl` / `goo.gl/maps` share link), at most 2000 characters, no embedded credentials. Anything else fails validation. The rules live in `src/lib/properties/map-url.ts`.

## 3. What the dossier draws from it

- A **full link** with a pin (`@lat,lng`), coordinates or a place or search text is also drawn as a small map on the dossier; a Google "Embed a map" link is used as it is.
- A **short share link** cannot be turned into a place without following it over the network, so it is kept and offered as an "Open in Google Maps" link only. No map is guessed.
- `properties.latitude` and `longitude` (unchanged, still unwritten) remain reserved for the geocoding work in `DECISIONS.md` 2026-09-23; this link does not populate them.

## 4. Nearby facts leave the specifications (no schema change)

Connectivity, hospitals, schools and the plot number stay stored as the v12 `specification_text` keys (`nearby_connectivity`, `nearby_hospitals`, `nearby_schools`, `plot_no`), so there is still one representation. They are no longer shown as specifications: the dossier query splits them out into `location.nearby` (one entry per landmark, split on semicolons and lines, nothing reworded), the review panel groups them under the Location tab, and the comparison shows them as a Location and connectivity group.
