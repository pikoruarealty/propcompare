# PropCompare canonical data schema — v9

**Status:** approved by the owner (2026-09-20: "do the property pictures thing, I approve schema change") and implemented by migration `0013_media_removal`.
**Supersedes:** [schema v8](schema.v8.md) for new implementation work; v8's content is not edited.

v9 is one additive change and continues v8's rule: everything taken off a live listing is **soft**. Nothing is deleted, so revision snapshots, saved comparisons and enquiries keep pointing at real rows.

## 1. `property_media.removed_at` — soft removal of a published picture

```text
property_media (
  ...existing columns...
  removed_at  timestamptz null
)
```

- Set by the publish transaction when an edit lists the picture in the contract field `property.media_removed`. A picture with `removed_at` set is hidden from buyers everywhere, the same way a picture of a removed unit type is: the dossier, the media route and thumbnails, the card image on browse, saved properties, comparisons, discovery matches. `mediaIsLive` in `src/lib/properties/visibility.ts` is the one rule, and it now also requires `removed_at is null`.
- The row, the stored file and the history stay. A card whose primary picture is removed falls back to the next best (a photo before a floor plan).
- Only a live picture of the same property can be removed. A picture already removed, another property's, or one that does not exist refuses the whole publish, so a mistake changes nothing.
- **Replace** is a removal plus a new picture in the same edit; there is no in-place edit of a picture.

## 2. One contract field (data in `property_schema_fields`, seed)

| Field key                | Data type        | Meaning                                                                   |
| ------------------------ | ---------------- | ------------------------------------------------------------------------- |
| `property.media_removed` | `media_id_array` | Ids of published pictures an edit takes off a live listing (soft, see 1). |

Like the v8 removal fields it applies to an **existing property only** and is **never read from a brochure and never asked of the extraction model**. `media_id_array` is a list of picture ids, each a UUID, none repeated.

## 3. These are not admin-only

The v8 and v9 removal and listing fields (`property.amenities_removed`, `unit_variants_removed`, `property.media_removed`, `property.listing_status`) describe a change to a live listing; the code calls them the **edit-only** fields (`EDIT_ONLY_FIELD_KEYS`, formerly named for admins). They are not a permission. The property's own developer may ask for any of them for their own property; nothing changes for buyers until an admin reviews, approves and publishes the edit (`DECISIONS.md` 2026-09-20).
