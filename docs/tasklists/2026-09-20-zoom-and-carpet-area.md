# Tasklist — pop-up zoom, and where carpet area should come from

**Status:** zoom built and verified 2026-09-20; carpet-area work approved and built (see `2026-09-20-rera-carpet-area.md`)
**Owner:** Bhavarth
**Branch:** `task/phase-2a-completion`
**Parent:** `2026-09-20-units-thumbnails-removal-listing.md`
**References:** `docs/schema/schema.v8.md` (`unit_areas`), `docs/tasklists/2026-09-20-gujrera-regulator-sync.md`, `DECISIONS.md` 2026-09-20 (zoom and carpet area)

## What the owner asked

1. Make the pictures in the buyer pop-up carousel zoomable.
2. Can carpet area be calculated from the dimensions provided in the floor plan?

## Checklist

### 1. Zoom

- [x] Pure zoom and pan maths (`src/lib/properties/zoom.ts`, 16 tests).
- [x] `ZoomableImage` (buttons, wheel and trackpad pinch, double-click and double-tap, keys, drag, two-finger pinch); each picture starts fitted; arrow keys still change picture.
- [x] Component tests (buttons, wheel, keys, double-click, reset per picture, arrows while zoomed).
- [x] Real-browser check on Kimana: zoom in and out, point stays under the cursor vertically, pan clamped, keys, arrows, page behind does not scroll, phone-width layout, no console warnings.
- [x] Decision entry.

### 2. Carpet area: finding

- [x] Compared RERA per-flat carpet area with the sum of stored room sizes for all six Kimana unit types: differences from -15% to +18% (see `DECISIONS.md`). Not derivable; not built.

### 3. Carpet area: proposed, needs the owner's yes

- [x] Read per-flat `carpetArea` from GujRERA form-three (flat, block, carpet area only; never prices or booked status), convert once from square metres, group into unit types.
- [x] Offer the RERA carpet area on each unit type in the RERA panel, applied as the `carpet` basis for the admin to confirm; mismatch with an existing value shows "differs from RERA".
- [x] Admin-only cross-check: "rooms add up to X sq ft; RERA says Y", warning on a large gap; computed and never stored.
- [x] Tests against the saved Kimana response; real-browser check.

## Not done

- Nothing: section 3 is built in `2026-09-20-rera-carpet-area.md`.
