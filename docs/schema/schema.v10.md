# PropCompare canonical data schema — v10

**Status:** implemented by migration `0014_intake_sessions_city_nullable`.
**Supersedes:** [schema v9](schema.v9.md) for new implementation work; v9's content is not edited.

v10 is one loosening change, found while building the pre-login intake cookie
(`docs/tasklists/2026-09-18-pre-login-intake-cookie.md`, `DECISIONS.md`
2026-09-22): `buyer_intake_sessions` is the first table anything has ever
written to, and its `city` column was `not null` even though the guided-intake
city question is optional ("No preference" is a valid, unanswered state,
`docs/design/...` and `src/lib/properties/intake.ts`). A buyer who states a
range or a configuration but skips city could never be written.

## 1. `buyer_intake_sessions.city` — nullable

```text
buyer_intake_sessions (
  ...existing columns...
  city  text null   -- was: text not null
)
```

No other column changes. `budget_min_inr`, `budget_max_inr`, `desired_bhk_type_id`
and `user_id` were already nullable in schema v1 (each answer is independently
optional); `city` was the one column the original whiteboard schema left
`not null` with no accompanying note, which reads as an oversight rather than
a decision once matched against how guided intake actually works. Nothing else
in the table changes, and nothing yet reads from it — see the tasklist above
for the write path this unblocks.

**Note on version numbering:** the owner's 2026-09-22 approval named this
change "schema v10" descriptively — the next version, not a specific number.
It landed first, ahead of two other approved changes still to come
(comparison analytics' events table, and `unit_variant_amenities`), so
whichever of those is actually built next takes v11, and the other v12,
in build order rather than approval order. Each one's own doc states which
number it ended up as when it lands; do not assume a fixed mapping from this
note.
