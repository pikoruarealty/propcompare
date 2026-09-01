# Tasklist — Phase 3 budget-range matching

**Status:** planned — do not implement during Phase 1
**Owner:** Bhavarth
**Branch:** to be created from the Phase 3 baseline
**Depends on:** Phase 2 publish transaction and approved budget-bucket seed data

## Product contract

For a buyer-stated range `[min, max]`, match current unit prices in the inclusive private range `[min × 0.80, max × 1.20]`. Example: ₹3–4 crore matches ₹2.4–4.8 crore.

Exact price values, bounds, and bucket calculations must never appear in an API response, log, UI, or public-schema table. The matching service returns only published property/unit identifiers.

## Implementation checklist

- [ ] Create a service-only private matcher that considers only the current price record for each published unit.
- [ ] Validate positive buyer bounds with `min <= max` before querying private data.
- [ ] Keep normal application connections unable to access `private`.
- [ ] Preserve `private.unit_current_bucket` as coarse classification only; do not use adjacent buckets as the tolerance implementation.
- [ ] Ensure the query path returns identifiers only, without price fields or derived price ranges.
- [ ] Test the lower and upper inclusive boundaries with a fixture published through `property_submissions`.
- [ ] Test that normal app queries remain denied and that service output contains no price data.
- [ ] Record the final implementation shape in `DECISIONS.md` if it changes the private service boundary.

## Handoff

- [ ] Run format, lint, typecheck, tests, and the private-role integration tests.
- [ ] Update `PROGRESS.md` and the Phase 3 roadmap acceptance when complete.
