# Buyer app flow

**Status:** planned buyer experience. Primary delivery: Phases 2B and 3.

## Purpose

Help a buyer make a confident property decision using published, comparable facts without revealing exact prices.

## Primary journey

```text
Landing / browse
  -> Guided intake (optional)
  -> Property brief and matches
  -> Browse or open a property dossier
  -> Save / add property or unit variant to comparison
  -> Decision brief / comparison
  -> Phone OTP dossier unlock where required
  -> Enquiry
```

1. A visitor lands on the decision-first buyer app and may browse published properties immediately.
2. The visitor may begin guided intake, choose persona priorities, desired BHK, city, and a stated budget range.
3. Matching returns suitable property/unit-variant choices using budget buckets. It returns no price.
4. The buyer opens a dossier and reviews only published facts: configuration, areas, dimensions, amenities, specifications, media, possession timing, and available RERA facts.
5. The buyer saves properties and/or adds a property or specific unit variant to a comparison.
6. The comparison presents decision-relevant trade-offs side by side. It communicates missing facts explicitly rather than filling gaps.
7. When a protected dossier action requires identity, the buyer completes phone OTP. This creates a verified unlock tied to the buyer and property.
8. The buyer submits an enquiry for a property and optionally a particular unit variant.

## Permissions and boundaries

- Unauthenticated visitors can browse only public published data and start intake.
- Authenticated buyers can own intake sessions, saves, comparisons, dossier unlocks, reviews, and enquiries.
- Buyers never see exact prices, private price buckets, internal OCR confidence, unpublished submissions, or admin review notes.
- A RERA Verified indicator denotes the specific verified fact/status supported by the catalog; it is not a general-quality guarantee.

## Exception paths

- No matching inventory: retain intake and show browse/refine controls rather than fabricate a match.
- Missing fact: render `not_stated` or `explicitly_not_offered` where applicable.
- OTP failure/expiry: preserve return destination and allow retry without recording an unlock.
- Enquiry failure: preserve typed message until retry; do not silently duplicate enquiries.

## Source screens

The Stitch export is a visual reference, not a behavioral specification: landing/guided start, life intake, property brief, property dossier, comparison decision brief, shortlist, mobile consideration set, and dossier unlock gate. See [design guide](../design/design.v1.md).
