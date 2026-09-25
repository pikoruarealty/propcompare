# Tasklist — a project's main photo

**Status:** done, verified 2026-09-24
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**Depends on:** `docs/tasklists/2026-09-24-delete-and-archive-submissions.md` (raised there as an open decision)
**References:** `DECISIONS.md` 2026-09-24, `docs/schema/schema.v14.md`, `AGENTS.md` (publish-transaction changes are surfaced for review; the owner approved this one on 2026-09-24)

## Scope

The owner approved a separately designated main photo per project, used as its identity picture. Cards, the comparison and the dossier already prefer `property_media.is_primary`; nothing set it. This adds the choice, the publish rule and the database guarantee.

## Non-goals

- No developer-portal control (the portal is on hold; the same field is what it would set later).
- No automatic main photo at first publish: a project with none keeps the photo-before-floor-plan fallback.
- No change to which pictures buyers see, only to which one stands for the project.

## Implementation checklist

- [x] Field-contract row `property.main_photo` (`media_id`, seeded as v14); `media_id` validator.
- [x] Never asked of the extraction model; not shown or counted in the Fields panel (`isManagedElsewhere`).
- [x] Publisher: resolve the choice (live photo or approved public candidate), clear the previous main photo, set the new one, all in the publish transaction; refuse a floor plan, another property's picture, a picture the same edit removes, and an unapproved or private candidate.
- [x] Migration `0017`: partial unique index, one live main photo per property.
- [x] Pictures panel: "Make main photo" on every eligible photo, a marker on the current one.
- [x] Deleting a candidate clears a choice that named it; and no longer deletes a stored file that a live picture or another candidate still uses (a related risk found here).
- [x] Tests: publisher integration (first publish, edit to a live photo, edit with a new photo, four refusals, the index), panel behaviour.
- [x] typecheck, lint, full suite.

## Acceptance criteria

- An admin can pick a main photo in the Pictures panel; after publish it is what cards, comparison columns and the dossier show.
- Exactly one live main photo per property, guaranteed by the database.

## Completion record

2026-09-24. No property has a main photo chosen yet, Anamika included: that is the owner's pick in the Pictures panel. Not looked at in a browser.
