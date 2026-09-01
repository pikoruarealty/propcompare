# PropCompare canonical data schema — v2

**Status:** active schema baseline as of 2026-09-01
**Supersedes:** [schema v1](schema.v1.md) for new implementation work

Schema v2 retains every v1 entity and relationship except the replacement below.
`schema.v1.md` remains an immutable historical record of the original
implementation contract.

## Private budget bucket boundary

`budget_buckets` is no longer a `public` lookup table. Its one live
representation is:

```text
private.budget_buckets (
  id, label, min_inr numeric, max_inr numeric, display_order unique,
  created_at, updated_at
)
```

The ranges are internal-only and use an inclusive lower bound plus an exclusive
upper bound: `price_inr >= min_inr AND price_inr < max_inr`. This prevents a
boundary price from belonging to two buckets. The final fixed band has a
deliberately high operational ceiling; it is not exposed as a buyer price range.

`private.unit_current_bucket` remains security-invoker and service-only, now
joining `private.budget_buckets`:

```sql
SELECT uv.id AS unit_variant_id, bb.id AS budget_bucket_id
FROM public.unit_variants AS uv
JOIN private.unit_price_history AS ph
  ON ph.unit_variant_id = uv.id AND ph.effective_to IS NULL
JOIN private.budget_buckets AS bb
  ON ph.price_inr >= bb.min_inr AND ph.price_inr < bb.max_inr;
```

The normal application role has no `private` schema usage. Only the dedicated
service role can read the view and bucket table; the controlled private seed
path uses that service-role connection. The Phase 3 private matcher still
evaluates the buyer's stated range with the approved inclusive ±20% rule and
returns identifiers only.
