# PropCompare canonical data schema — v11

**Status:** implemented by migration `0015_minor_scalphunter` (table, foreign keys, unique index); app-role grants applied via the database's default-privilege grant (same mechanism as every other `public` table since `0008_needy_ricochet`'s comment documents — no explicit `GRANT` needed for ordinary read/write access).
**Supersedes:** [schema v10](schema.v10.md) for new implementation work; v10's content is not edited.

v11 is one additive table, owner-approved 2026-09-22 (`DECISIONS.md`), first proposed 2026-09-21 (`docs/tasklists/2026-09-21-page-review-ux-and-lighter-categorization.md`): a unit type's own amenities, distinct from the property's.

## Why this exists

`unit_variants` already carries `layout_type_id` (penthouse, duplex) and per-room dimensions, but amenities exist only at property level (`property_amenities`). A penthouse type's private pool, or a garden-floor unit's private garden, cannot be recorded on that unit type today — putting it on the property instead would wrongly say every unit in the building has it.

## 1. `unit_variant_amenities` — new table

```text
unit_variant_amenities (
  id                   uuid primary key default gen_random_uuid(),
  unit_variant_id      uuid not null references unit_variants(id) on delete cascade,
  amenity_catalog_id   uuid not null references amenity_catalog(id),
  status               catalog_item_status not null,   -- available | not_stated | explicitly_not_offered
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (unit_variant_id, amenity_catalog_id)
)
```

Exact mirror of `property_amenities`'s shape, with `unit_variant_id` in place of `property_id` and the same `on delete cascade` (a removed unit type takes its own amenity rows with it, matching how `unit_areas` already behaves). Reuses the existing `amenity_catalog` / `amenity_synonyms` controlled vocabulary and the existing `catalog_item_status` enum — no new enum, no free-text amenity field, per `AGENTS.md`'s standing rule.

Added to `liveCatalogTables` (`src/db/schema/catalog.ts`) alongside the other live catalog tables — **AGENTS.md's "no code path other than the `property_submissions` publish transaction writes to live catalog tables" rule now names this table explicitly.**

## Not yet built (schema only, this entry)

This entry is the storage shape alone. Still queued, per the original 2026-09-21 proposal and `docs/tasklists/2026-09-23-unit-variant-amenities.md`:

- A unit-type amenities field in the extraction contract (so OCR/manual submission can actually populate this table through the publish transaction).
- A "Private amenities" row in the dossier's unit type view.
- A "Private amenities" row in the comparison, matched unit-type-to-unit-type (penthouse against penthouse) per the comparison's like-for-like principle.

No buyer-facing or admin-facing surface reads or writes this table yet — it exists in the schema and nowhere else, same as `reviews` did between 2026-08-31 and its own later decision. This is deliberate: the table shape needed owner sign-off and a version bump before anything is built against it, not the other way around.
