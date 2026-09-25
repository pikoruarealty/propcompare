# PropCompare canonical data schema — v16

**Status:** implemented by migration `0019_private_prices`.
**Supersedes:** [schema v15](schema.v15.md) for new implementation work; v15's content is not edited.

v16 adds the storage behind budget matching on real properties (`DECISIONS.md` 2026-09-24, "price data"; `docs/tasklists/2026-09-24-private-prices.md`). Both tables live in the `private` schema. Nothing here is ever returned to a buyer, and no public table gains a price.

## 1. `private.rera_price_ranges` — new

The project-wide price range a regulator states, kept as the fallback the budget matcher uses for a property that has no admin-entered unit price.

| Column                | Type              | Notes                                                                                                                              |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `registration_number` | text, primary key | As the regulator prints it, upper case, single spaces. Keyed by the number so a draft can have a range before its property exists. |
| `regulator_code`      | text              | For example `gujrera`.                                                                                                             |
| `min_inr`, `max_inr`  | numeric           | Whole rupees. The regulator's own minimum and maximum cost for the project.                                                        |
| `fetched_at`          | timestamptz       | When the regulator last stated it.                                                                                                 |

Written only by the pricing module after a successful RERA check (`syncReraPriceRange`), replaced on each check that states a range, left alone when a check states none. Never part of a `RegulatorRecord` or of `rera_fetch_jobs.fetched_payload`.

## 2. `private.staged_unit_prices` — new

A price an admin has typed for a unit type, held until the submission is published.

| Column              | Type        | Notes                                                                                                            |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                | uuid        |                                                                                                                  |
| `submission_id`     | uuid        | References `property_submissions`, `ON DELETE CASCADE`, so a deleted submission takes its staged prices with it. |
| `unit_variant_name` | text        | The unit type's name in the submission; unique per submission.                                                   |
| `price_inr`         | numeric     | Whole rupees.                                                                                                    |
| `entered_by`        | text        | References `users`; becomes `created_by` on the live price row.                                                  |
| `applied_at`        | timestamptz | Null until copied into `unit_price_history`; cleared again if the price is retyped.                              |

Held here, not in `property_submission_fields`, so no price sits in a public table. After the publish transaction commits, the pricing module copies each unapplied row into `private.unit_price_history` (source `admin_manual`), ending the unit type's previous current price the same day, so the one-current-price-per-unit-type index always holds. A name that matches no live unit type stays staged and is reported.

## 3. Permissions (in the same migration)

- Both tables: row-level security enabled and forced with no policies; all access revoked from `propcompare_app`; `SELECT, INSERT, UPDATE, DELETE` granted to `propcompare_service` only.
- `propcompare_service` gains a **column-level** `SELECT (id, rera_registration_number)` on `public.properties`, so the matcher can tie a range to a property and the pricing module can resolve a property's unit types. It can read nothing else about a property.

## 4. What matching does with it

`matchPropertiesByBudgetRange` (service role) matches, in order:

1. **Unit level, as before:** a live unit type whose current `unit_price_history` price lies in `[min × 0.80, max × 1.20]`.
2. **RERA fallback:** only for a property with **no** current price on any live unit type: every live unit type of it matches when its stored range overlaps that band. With "no upper limit" only the lower edge is checked.

So once any unit type of a property has an admin price, RERA's range no longer applies to it and an unpriced unit type does not match. The result is still property and unit type identifiers only.

## 5. No change to

`private.unit_price_history` (its columns, the `price_source` enum and the partial unique index are as in v1), the public catalog, the field contract, or the publish transaction's own writes.
