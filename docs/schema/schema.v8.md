# PropCompare canonical data schema — v8

**Status:** approved by the owner (2026-09-20: "give the feature… obviously soft delete") and implemented by migration `0012_listing_status_and_unit_removal`.
**Supersedes:** [schema v7](schema.v7.md) for new implementation work; v7's content is not edited.

v8 is one additive change: everything an admin can take away from a live listing is **soft**. Nothing is deleted, so price history, saved comparisons, enquiries and revision snapshots keep pointing at real rows.

## 1. `properties.listing_status` — listed, unlisted, deleted

```text
listing_status = enum('listed', 'unlisted', 'deleted')

properties (
  ...existing columns...
  listing_status             listing_status not null default 'listed',
  listing_status_changed_at  timestamptz null
)
```

- Buyers see only `listed` properties. `unlisted` is a reversible hide; `deleted` is a soft delete (also hidden, restorable by an owner). Both are recoverable by listing the property again.
- Changed **only by the publish transaction**, like every other live column: an admin action creates an edit submission carrying the contract field `property.listing_status`, takes it through review, and publishes it. It is therefore a recorded version of the property.
- A new property can only be `listed`; the publisher refuses anything else.

## 2. `unit_variants.removed_at` — soft removal of a unit type

```text
unit_variants (
  ...existing columns...
  removed_at  timestamptz null
)
```

- Set when an edit lists the type in the contract field `unit_variants_removed`. A type with `removed_at` set is hidden from buyers (the dossier, BHK filters and options, matching, enquiries, comparisons, and any picture tied to it).
- A later edit that lists the same name again in `unit_variants` clears it. Names are the identity of a type, so the name of a published type is fixed.
- A type cannot be both kept and removed in one edit; removing a type that is not live is refused.

## 3. Three contract fields (data in `property_schema_fields`, seed)

| Field key                    | Data type            | Meaning                                                                            |
| ---------------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `property.amenities_removed` | `amenity_key_array`  | Amenities taken off a live listing: set back to `not_stated`, never "not offered". |
| `unit_variants_removed`      | `variant_name_array` | Unit types taken off a live listing (soft, see 2).                                 |
| `property.listing_status`    | `listing_status`     | Listed, unlisted or deleted (see 1).                                               |

They apply to an **existing property only** and are **never read from a brochure and never asked of the extraction model** (`EDIT_ONLY_FIELD_KEYS`, renamed from `ADMIN_ONLY_FIELD_KEYS` in v9, excluded in `src/lib/ocr/ingestion.ts`).

## 4. Where buyer visibility is enforced

`src/lib/properties/visibility.ts` defines the rule once (`isListed`, `variantIsLive`, `mediaIsLive`) and it is applied by every buyer-facing read: browse and count, filter options, the dossier, the media route and thumbnails, saved properties, comparisons, enquiries, dossier unlocks, and discovery matching.

**The private budget matcher cannot check listing state.** Its database role reads only the tables it needs, not `properties` (found when a join to it failed with "permission denied"), so it ignores removed unit types only, and `matchPublishedProperties` applies `isListed` to the ids it returns. An unlisted property therefore never reaches a buyer, and no price ever leaves the private path.
