# PropCompare canonical data schema — v14

**Status:** implemented by migration `0017_main_photo_index` and a seeded field-contract row (`bun run db:seed`).
**Supersedes:** [schema v13](schema.v13.md) for new implementation work; v13's content is not edited.

v14 makes a project's **main photo** a real, single choice (owner-approved 2026-09-24; `DECISIONS.md` 2026-09-24, `docs/tasklists/2026-09-24-main-project-photo.md`). Until now `property_media.is_primary` existed and was read by the listing cards, the comparison and the dossier, but nothing ever set it, so every project fell back to "whichever picture comes first".

## 1. New field-contract entry

| Key                   | Data type             | Meaning                                                                                                                           |
| --------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `property.main_photo` | `media_id` (one UUID) | The picture that stands for the project: the id of a live picture of this property, or of a new picture this submission proposes. |

- `media_id` is a new single-UUID data type (the list form, `media_id_array`, has existed since v9).
- Chosen by an admin in the Pictures panel. It is **never read from a brochure and never asked of the extraction model**, and it is not a value typed in the Fields panel or counted as a field the listing is missing.
- Unlike the v8 and v9 removal fields, it applies to a **new property too** (a first publish can name one of its own new pictures).

## 2. Publish rules

Applied by the `property_submissions` publish transaction, the only writer:

- The chosen picture must be a **photo** (never a floor plan, video or brochure) that is live after the publish: a live, non-removed photo of this same property that the edit does not remove, or a new picture in the submission that is approved (`confirmed`) and public.
- Anything else fails the publish with a plain message and changes nothing.
- Choosing one clears the previous main photo in the same transaction. A submission that does not name one leaves the current main photo alone.
- A property with no main photo still gets a sensible plate: a photo before a floor plan, never a video or brochure (`identityPicture`, unchanged).

## 3. New constraint

```text
property_media (
  ...existing columns...
)
UNIQUE INDEX property_media_one_primary_idx (property_id)
  WHERE is_primary AND removed_at IS NULL
```

At most one live main photo per property, enforced by the database as well as by the publisher, so a future writer cannot leave a property with two.

## 4. Not in this version

No column was added to `property_submission_media`: a candidate is named by its id in the field above rather than flagged on its own row. A developer-portal control for choosing the main photo belongs with the portal, which is on hold.
