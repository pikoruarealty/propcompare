# Tasklist — the Location section: map link, small map, connectivity lists

**Status:** done, verified 2026-09-24
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** `docs/schema/schema.v12.md` (the location specification fields), the Location review tab added earlier the same day
**References:** `DECISIONS.md` 2026-09-24 and 2026-09-23 (geocoding direction), `docs/schema/schema.v15.md`

## Scope

Owner direction: the Location section shows a Google Maps link (set from the review panel for now, automation to be worked out later) and a small map iframe, connectivity is a normal list, and none of these are kept under specifications, in review or on the dossier.

## Non-goals

- No automatic link or coordinates: geocoding stays an open owner decision (`DECISIONS.md` 2026-09-23). The link is typed by an admin.
- No distances computed or verified; the lists show what the brochure printed.
- No focus chip for location in the comparison.

## Implementation checklist

- [x] `properties.map_url` (migration `0018`), field `property.google_maps_url` (`map_url` type, seeded v15), validator that accepts only https Google Maps links.
- [x] Publisher writes it (new property and edit); the edit prefill reads it.
- [x] Never asked of the extraction model; in the review panel's Location tab.
- [x] `src/lib/properties/map-url.ts`: what counts as a Google Maps link, and what can be drawn as an embedded map (pin, coordinates, place text, embed link; never a guess for a short link).
- [x] Dossier query splits connectivity, hospitals, schools and plot number out of the specifications into `location.nearby`.
- [x] Dossier Location section: facts, small map, "Open in Google Maps", the three lists, and a plain line when nothing nearby is stated.
- [x] Comparison: a Location and connectivity group (one landmark per line); the specifications group no longer carries them.
- [x] Tests: map-url rules, the split, the dossier section (map, short link, none), the comparison group, and a database-backed publish and read.
- [x] typecheck, lint, full suite.

## Acceptance criteria

- An admin can paste a Google Maps link in the Location tab; after publish the dossier shows it as a link and, when it can be drawn, a small map.
- Connectivity, hospitals and schools appear as lists in the Location section and nowhere among specifications (dossier, comparison, review panel).

## Completion record

2026-09-24. Anamika has no map link yet (the owner pastes it in the Location tab; it was not guessed). The embed uses Google's `output=embed` address form for a full link, which is not part of Google's documented Maps Embed API (that needs a key); a documented embed link pasted by the admin is used as is. Not looked at in a browser.
