# Product design guide — v1

**Status:** active implementation guide. Visual tokens remain canonical in [design-tokens.md](design-tokens.md).

## Product stance

The experience should feel like an editorial, calm senior advisor: guide a decision progressively, substantiate facts with evidence, and avoid presenting a raw database dump. “Soft Daylight” v2 uses Cormorant Garamond for editorial display text and Plus Jakarta Sans for UI/data.

## Surface boundaries

| Surface          | Design intent                                                  | Must not become                               |
| ---------------- | -------------------------------------------------------------- | --------------------------------------------- |
| Buyer app        | Calm exploration, focused property brief, informed comparison. | An admin dashboard or price-led listing site. |
| Developer portal | Clear portfolio ownership and submission status.               | A review/approval workspace.                  |
| Admin portal     | Dense but legible evidence-based reconciliation.               | A developer analytics shell.                  |

The Stitch export sometimes reuses an Editorial Desk or Admin Console shell across unrelated roles. Treat that as generator noise; use the boundaries above.

## Interaction principles

- Progressive disclosure: lead with the facts needed for the next decision, then reveal comparable depth.
- Evidence-led trust: a verified/document-backed claim has an understandable evidence path; do not use decorative trust signals.
- Decision over data: comparison foregrounds consequential differences while retaining precise source facts.
- Honest incompleteness: show `not_stated` or `explicitly_not_offered`, never plausible placeholders.
- Price restraint: do not show exact price, price per square foot, or a budget-bucket value in buyer UI.

## Component inventory

| Component                   | Surface         | Required behavior                                                                                            |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| Property summary card       | Buyer           | Published-only summary; dossier and save/compare actions.                                                    |
| Property dossier            | Buyer           | Organizes facts, variants, areas, dimensions, catalog data, media, possession, and RERA facts without price. |
| Comparison / decision brief | Buyer           | Consistent labels and explicit missing-data states.                                                          |
| Guided intake               | Buyer           | Collects priorities, desired BHK, city, stated budget range without representing it as price.                |
| Dossier unlock gate         | Buyer           | Phone-OTP gate that preserves context and clearly describes action.                                          |
| Verified badge              | Buyer/Admin     | Soft Gold only when a concrete verified/trust condition is met.                                              |
| Evidence viewer             | Admin           | Extracted value plus source page/snippet and review state.                                                   |
| Reconciliation row          | Admin           | Field, value, confidence, evidence, and confirm/edit/reject actions.                                         |
| Submission queue            | Admin/Developer | Developer view is limited to owned items and contains no approval controls.                                  |

## Layout and responsive behavior

- Follow the 8px rhythm, 12-column desktop grid, 24px desktop gutters/48px margins, and 16px mobile margins in the token spec.
- Use tabular numerals for areas, dates, and counts.
- Preserve comparison readability on mobile through a focused consideration-set/stepwise view; do not compress data into unreadable narrow columns.
- Use tonal layers and dividers before shadows. Buttons are rectangular; pills are limited to secondary chips/tags.

## Visual source material

Reviewed Stitch screens in `_stitch_export/stitch_propcompare_residence_concierge/` are reference material for composition. They do not define production content, routes, roles, or data model. Placeholder noise is documented in [design-tokens.md](design-tokens.md).

## Implementation handoff

Before implementing a screen, create/update a tasklist linking the screen to its user flow, API contract, data state, responsive criteria, and evidence/permission constraints. Do not treat a Stitch HTML export as production code.
