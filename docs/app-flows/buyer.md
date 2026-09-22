# Buyer app flow

**Status:** planned buyer experience. Primary delivery: Phases 2B and 3.

## Purpose

Help a buyer make a confident property decision using published, comparable facts without revealing exact prices.

## Primary journey

```text
Landing (guided intake is the front door)
  -> Property brief and matches
  -> Open a property dossier, or add directly to a comparison
  -> Comparison: identity and summary open to everyone, detail rows locked
  -> Phone OTP sign-in unlocks comparison detail (and dossier actions where required)
  -> Save / enquiry
```

1. A visitor lands on the decision-first buyer app. Guided intake is the primary path the landing page leads with (owner direction, `DECISIONS.md` 2026-09-22) — it is not a nav item — though a visitor who wants the whole catalog directly can still reach it (the landing page's secondary call to action, and `Browse properties` in the nav).
2. The visitor works through guided intake: persona priorities, desired BHK, city, and a stated budget range.
3. Matching returns suitable property/unit-variant choices using budget buckets, rendered inline on the intake screen. It returns no price.
4. From a matched result, the buyer opens a dossier and reviews only published facts (configuration, areas, dimensions, amenities, specifications, media, possession timing, available RERA facts), or adds the property directly to a comparison from the result card.
5. The buyer saves properties and/or adds a property or specific unit variant to a comparison.
6. The comparison presents decision-relevant trade-offs side by side: like for like (unit type against unit type), differences first, an honest summary of what changes between the choices, and missing facts said plainly. **Reaching `/compare` and seeing the column identity and the differences-first summary needs no sign-in and is a shareable address; the detailed row groups beneath them are locked until the buyer signs in with their phone number** (owner direction, `DECISIONS.md` 2026-09-22 — supersedes the earlier "no sign-in at all" statement). Saving a comparison still needs an account regardless. See [the comparison specification](../design/comparison.v1.md).
7. When a protected dossier action requires identity, the buyer completes phone OTP. This creates a verified unlock tied to the buyer and property. The same phone-OTP flow is what unlocks comparison detail; a session is all comparison's gate checks for, not a per-property unlock record.
8. The buyer submits an enquiry for a property and optionally a particular unit variant.

## Permissions and boundaries

- Unauthenticated visitors can browse published data, run intake, add properties to a comparison, and see a comparison's identity block and summary.
- Signing in (phone OTP) unlocks a comparison's detailed row groups, in addition to what it already unlocked: owning intake sessions, saves, comparisons, dossier unlocks, reviews, and enquiries.
- Buyers never see exact prices, private price buckets, internal OCR confidence, unpublished submissions, or admin review notes.
- A RERA Verified indicator denotes the specific verified fact/status supported by the catalog; it is not a general-quality guarantee.

## Exception paths

- No matching inventory: retain intake and show browse/refine controls rather than fabricate a match.
- Missing fact: render `not_stated` or `explicitly_not_offered` where applicable.
- OTP failure/expiry: preserve return destination and allow retry without recording an unlock.
- Enquiry failure: preserve typed message until retry; do not silently duplicate enquiries.

## Source screens

The Stitch export is a visual reference, not a behavioral specification: landing/guided start, life intake, property brief, property dossier, comparison decision brief, shortlist, mobile consideration set, and dossier unlock gate. See [design guide](../design/design.v1.md).
