# Tasklist — the visual pass (image-led buyer UI) and the admin add/edit flow

**Status:** planned 2026-09-20; waiting for the owner to add 2 to 3 more properties (real pictures, several developers) so the result can be judged on real data. No code yet.
**Owner:** Bhavarth
**References:** `docs/design/visual-direction.v1.md` (findings and order), `docs/design/comparison.v1.md`, `docs/design/design.v1.md`, `docs/design/design-tokens.md`, the Stitch export `_stitch_export/stitch_propcompare_residence_concierge/`, `AGENTS.md` (comparison is the product; no price; gold only for trust)

## Owner feedback this answers (2026-09-20)

**Admin add and edit**

1. Do not make the admin click Edit on every field; find a more intuitive way.
2. The "Edited" tag and the Edit button stack in a row with plenty of free space.
3. Buttons should create intention and lead through every field ("take me through it"), while saving without finishing stays possible, as a secondary action; the guided path is the primary one.
4. An image says "Needs review" and cannot be reviewed anywhere, so the property cannot be published.
5. Version history belongs at the end of the page, not the start.
6. An admin adding a property should not "submit for review, start review, approve, publish" to themselves.

**Look and feel:** the buyer UI looks empty and like a document, not a website; the landing page has no images or expressive hero typography; data is tables and text rather than the objects Stitch designs.

## Non-goals

- No price or score anywhere on the buyer side (replacements are listed in the visual direction doc).
- No change to the publish transaction, the review states, or who may approve. The one-step Publish for an owner still passes through the same recorded transitions, so the history is unchanged.

## Checklist

### Admin flow (independent of the visual pass)

- [ ] Fields are always editable inline (no Edit toggle), saved on leaving a field, with a quiet "Saved" mark; the status tag sits right-aligned in the field's header row, never stacked with a button.
- [ ] Guided path: a progress line ("12 of 30 fields"), a primary "Next: <section>" on every tab, "Save draft and leave" as the secondary action, and a last step "Review and publish". Sections show how much is filled. Nothing forces completion.
- [ ] Images an admin uploads are approved (public, with credit) unless they choose otherwise, so there is no dead end; brochure-extracted pictures keep their review.
- [ ] One **Publish** for an owner (submit, start review, approve and publish in one action, each recorded); a verifier sees "Send for approval". A developer's own submission keeps the review steps.
- [ ] Version history moves to the end of the page.
- [ ] Tests, and a real-browser run of adding a property from nothing to published.

### Visual pass (see `visual-direction.v1.md`, in this order)

- [ ] 1 Foundations: type scale, elevated cards, tonal layers, chips, icons, hero treatment, buttons.
- [ ] 2 Landing with the split hero, tagline, featured properties, three icon cards.
- [ ] 3 Browse cards.
- [ ] 4 Dossier (hero, gallery mosaic, key tiles, sticky side stack, amenity icons, completeness ring).
- [ ] 5 Comparison restyle.
- [ ] 6 Intake and shortlist.
- [ ] Real-browser check on at least four properties at desktop and phone width.

### Documentation

- [ ] `PROGRESS.md`, `DECISIONS.md`, this tasklist.

## Acceptance

A first-time visitor sees a real residence, a large confident headline and a clear next step on the landing page; a dossier opens on its picture; facts read as tiles, chips and icons rather than rows of text; and an admin can take a property from nothing to published in one guided path without submitting to themselves.

## Completion record

_(fill in at completion)_
