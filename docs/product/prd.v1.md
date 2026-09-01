# Product requirements document — v1

**Status:** active product baseline. Last aligned: 2026-09-01.

## Product

PropCompare helps buyers in Ahmedabad and Gujarat make a property decision using structured, comparable, evidence-backed data rather than unverified marketing claims. It covers Apartment, Bungalow, and Plot properties across regular through ultra-luxury segments.

## Problem

Property information is inconsistent across brochures, developer material, and RERA records. Buyers cannot easily compare exact unit variants, usable area, dimensions, amenities, specifications, RERA facts, developer context, and possession timing. The platform must make that comparison useful without exposing exact commercial prices.

## Users

| User            | Need                                                                                 | Primary surface            |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| Buyer           | Discover, shortlist, compare, and enquire about suitable properties with confidence. | Buyer app                  |
| Developer staff | Submit and follow changes to their own portfolio.                                    | Developer portal (Phase 4) |
| Admin/verifier  | Convert brochures and RERA checks into reviewed, traceable catalog updates.          | Admin/verification portal  |

Developer and admin portals are separate products with separate permissions. A developer can never approve its own submission.

## v1 outcomes

1. Buyers browse published properties and compare selected unit variants side by side.
2. Buyers complete guided intake, state a budget range, receive relevant results, save properties, unlock a dossier by phone OTP, and send an enquiry.
3. Every published catalog fact is traceable to a reviewed submission and, when document-sourced, source evidence.
4. Admins ingest brochure OCR, review low-confidence or conflicting fields, and approve or reject submissions.
5. RERA is an independent cross-check. It may create a proposed change but never silently overwrites live catalog data.
6. Developer staff later submit portfolio updates through the same review and publishing boundary.

## Functional requirements

### Buyer app

- Show only published catalog data.
- Support structured browsing by Gujarat location, property type, configuration, possession information, amenities, and specifications as the read contract matures.
- Present dossiers with available facts, media, RERA status/facts, unit areas, and dimensions.
- Allow saves, comparisons, and enquiries after authentication where required.
- Capture buyer priorities and stated budget range in guided intake.
- Use matching to return suitable property/unit-variant identifiers by budget bucket. The UI must never receive or render exact unit prices.

### Admin ingestion and verification

- Accept a brochure/RERA source document and retain its provenance.
- Extract only active fields in the versioned `property_schema_fields` contract; discard all other OCR output.
- Let an admin confirm, edit, reject, request changes to, and approve a submission at field level.
- Publish only through the canonical submission transaction, producing a revision snapshot in the same transaction.

### Developer portal

- Authenticate developer staff as staff, not as admins.
- Limit portfolio access to the linked developer entity.
- Create drafts/submissions only; do not expose review, approval, or direct catalog-write controls.

## Guardrails

- v1 is Ahmedabad/Gujarat only; Stitch placeholder geographies are not scope.
- Exact price is `numeric` data held in RLS-protected `private`; it is not a buyer-facing feature.
- Missing amenity/specification facts use `not_stated` or `explicitly_not_offered`; they are never invented.
- Soft Gold is reserved only for actual verified/trust badges.
- Published data must be auditable through submission/revision/provenance records.

## Out of scope for v1

- Public exact-price display or price estimates.
- Developer self-approval.
- Blanket verification solely from RERA registration.
- OCR collection of arbitrary brochure fields outside the active contract.
- Geography outside Gujarat.

## Delivery sequence

The roadmap is authoritative: data layer first; admin ingestion and buyer UI then proceed in parallel; buyer integration follows; developer self-service follows; production hardening closes v1. See [roadmap](../roadmap.md).

## Open product decisions

- OCR provider selection before Phase 2A.
- User-facing definition/calculation of `PropScoreDial`, if it ships; it must not imply unsupported verification or a fabricated score.
- Admin MFA enforcement timing.
