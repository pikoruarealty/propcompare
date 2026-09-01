# Design System — "Soft Daylight" (v2, canonical)

Status: confirmed 2026-08-31. Source: Stitch export `guided_residence_concierge_2/DESIGN.md`, cross-checked against the actual reviewed screens (gold-toned "RERA Verified" badges matched this spec, not the v1 alternative). v1 (EB Garamond, sage-only, no gold accent) was rejected — do not resurrect it without an explicit new decision.

Brand philosophy: **"Editorial Minimalism"** / "Senior Advisor" positioning. Principles: _Progressive Disclosure_, _Evidence-Led Trust_, _Decision, not Data_.

## Color

| Token         | Value                      | Use                                                                  |
| ------------- | -------------------------- | -------------------------------------------------------------------- |
| Primary       | Muted Terracotta `#8d4934` | primary actions, brand accents                                       |
| Secondary     | Sage / Deep Moss `#56624b` | secondary UI, supporting accents                                     |
| Tertiary      | Pale Sky `#CBD5E0`         | borders, subtle dividers                                             |
| Background    | Chalk `#F9F8F6`            | page background                                                      |
| Ink           | `#1A1A1A`                  | body text                                                            |
| Verified Gold | Soft Gold `#D4AF37`        | **reserved strictly** for "Verified"/trust badges — never decorative |

## Typography

- Display/headlines/property names: **Cormorant Garamond** (classical/editorial serif)
- Body, UI chrome, data labels: **Plus Jakarta Sans**
- Numeric/tabular data (areas, dates, counts): `data-tabular` numeric style variant of Plus Jakarta Sans

## Layout

- 8px spacing rhythm throughout
- 12-column grid, desktop: 24px gutters / 48px margins
- Mobile: 16px margins
- 8px standard border radius
- Buttons: rectangular (pills reserved for secondary chips/tags only)
- Elevation: tonal-layer shading, not heavy drop shadows

## Notable components (from the export, to design against)

- **PropScoreDial** — a dial/gauge component, likely surfacing a composite property or match score.
- **Evidence Viewer** — a side-sheet/lightbox pairing a source-PDF page view with the extracted field and its citation ("BROCHURE P.12").
- **Data Reconciliation row** — field label + extracted value + OCR confidence + Confirm/Edit actions, used in the admin verification workspace.

## Known placeholder noise (ignore, not scope signals)

The Stitch-generated mocks contain inconsistent placeholder content that doesn't reflect real scope:

- "AED," "Omniyat," "Dubai Land Department" in the Data Reconciliation mock — Stitch invented generic real-estate content; we are Ahmedabad/Gujarat/GujRERA only.
- "Bengaluru" in the guided-intake mock — same reason; scope is confirmed Ahmedabad/Gujarat only.

## Screen → role mapping (confirmed 2026-08-31)

Three distinct, separately-permissioned surfaces (not one shell gated by role — see [DECISIONS.md](../../DECISIONS.md)):

1. **Buyer app** — landing/guided-start, life-intake questionnaire, "your property brief" persona-priority intake, property dossier (detail page), comparison/decision-brief, dossier-unlock phone-OTP gate, shortlist, mobile consideration set.
2. **Developer portal** — own-portfolio analytics ("Developer Intelligence": Buyer Interest Score, Portfolio Data Completeness, engagement charts, Top Performers), submit/edit listing updates.
3. **Admin/verification portal** — submission queue (reviewing developer submissions), Data Reconciliation (OCR field-by-field verification against brochure, confidence scores), fact-check queue.

The Stitch export's "Editorial Desk" sidebar shell was reused across both (2) and (3) by the generator — that conflation was noise, not an intentional merged design; they are being built as separate interfaces. An "Admin Console" shell wrapped around buyer-facing shortlist content in the export is also generation noise, to be ignored entirely.
