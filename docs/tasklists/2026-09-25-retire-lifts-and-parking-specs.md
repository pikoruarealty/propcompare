# Tasklist — retire `lifts_per_tower` and `parking_levels`

**Status:** done (2026-09-25).
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `DECISIONS.md` 2026-09-24 "RERA clean-up" (the same retirement done for `open_space` and `density_units_per_acre`; these two were left for the owner) and 2026-09-24 "RERA data, second pass" (RERA states lifts and covered parking as numbers), `docs/schema/schema.v18.md`, `AGENTS.md` (one live representation of each fact).

## Why

RERA's latest filing states lifts per block and covered parking as numbers, and the comparison and dossier already show them ("Lifts", "Covered parking" rows and the RERA section). Keeping a brochure-read specification of the same fact beside them gives two answers to one question. The owner's direction (2026-09-25, in chat): if RERA states them and shows them better, retire ours.

## Steps

1. [x] Data migration `0022`: deactivate the two contract fields (`property.specifications.lifts_per_tower`, `property.specifications.parking_levels`); deactivated, not deleted, so it is reversible and nothing is lost. Seed's retired list gains them.
2. [x] Publisher: a candidate on a retired field no longer blocks publishing while `needs_review` (its value is ignored anyway, so a reviewer would be asked to judge a value that goes nowhere).
3. [x] Buyer read: the dossier (and so the comparison and `GET /api/v1/properties/{slug}`) and `loadLiveValues` skip a specification whose contract field is retired. A stored value is kept, not deleted (only the publish transaction writes live tables), so re-activating the field brings it back.
4. [x] Tests: retired field is not extracted, not shown, does not block a publish; a live one still is.
5. [x] Docs: `DECISIONS.md`, `PROGRESS.md`.
6. [x] Verification: typecheck, lint, format, the full suite (no OCR worker up), migration applied locally.

## Known consequence

Anamika High Point is the only live property that holds these two values (5 lifts, 3 parking levels, from its brochure). No live property has a RERA snapshot yet, so until an admin fetches and applies RERA's record from the RERA panel, Anamika shows neither figure. That is the owner's step (the RERA panel), not something to bypass.

## Non-goals

- Not deleting the stored values or the catalog rows.
- Not touching any other specification.

## Completion record

Done 2026-09-25 on `task/phase-3-completion`; see `PROGRESS.md` (2026-09-25 (2)) and `DECISIONS.md` (2026-09-25). Open for the owner: apply RERA's record to Anamika from the RERA panel so it shows lifts and parking from the regulator.
