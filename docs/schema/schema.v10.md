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

**Note on version numbering:** this was implemented before the
owner-approved `unit_variant_amenities` schema change (`DECISIONS.md`
2026-09-22, "schema v10" in the owner's own approval), so that work becomes
**v11** rather than v10 when it is built — the owner's approval named the
next version descriptively, not a specific number, and this smaller change
landed first.
