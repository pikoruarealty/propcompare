# Visual direction — why our UI reads as a document, and how it becomes a website

**Status:** active, with details superseded by [no-vibecoded-tells.v1.md](no-vibecoded-tells.v1.md) (no shadows, no decorative icons, no feature-card rows, provisional tagline "Choose the right home, side by side."). Written 2026-09-20 at the owner's direction, after comparing the running site with the Stitch export (`_stitch_export/stitch_propcompare_residence_concierge/`). This is about **look and feel only**: composition, imagery, typography, depth and iconography. Content and data types are ours, not Stitch's (no price, no score; see "What replaces what" below).

## What we did wrong (measured against the Stitch screens)

1. **Not image-led.** Every Stitch screen leads with a large photograph: the dossier opens on a full-width hero with the title, verified badge and primary action laid over the picture; cards carry a tall photo with a badge on it ("RERA VERIFIED"); the landing and intake use a big picture beside the headline. Ours starts with a plain text title on a blank page, and the pictures sit near the bottom inside a collapsed "Photos and plans" box. A property with nine pictures shows one thumbnail by default.
2. **Typography is timid.** Stitch sets big, tight serif headlines (56 to 72 px), puts key words in the accent colour and bold inside a sentence ("I am looking for a **3 BHK Apartment** in **Bengaluru**"), uses small letter-spaced caps for labels, and lets one line of copy dominate a screen. Ours is a 40 px heading, mid-grey body copy at one weight, and no emphasis anywhere, so nothing draws the eye.
3. **One narrow column of stacked sections.** Stitch uses asymmetric compositions: text left and a large image right, the dossier's main column beside a right-hand stack of cards (Project overview, Verified identity, Curated amenities), a three-up grid of choice cards. Ours is a single column of headings and label/value rows, which is what a document is.
4. **Data shown as text and rows, not as objects.** Stitch turns facts into things: key-intelligence tiles (label, value, small chip), icon chips (open space, parking), an icon grid for amenities, one styled table (configurations) with the recommended row tinted, a callout box for the reason a property was picked, a score dial. Ours prints "Not stated" and label/value pairs, shows amenities as a sentence ("26 not recorded"), and has no icon anywhere.
5. **Flat.** Stitch layers tone: chalk page, white cards with a soft shadow and 12 px radius, sage-tinted active states and callouts, filled terracotta primary buttons, outlined secondary ones, pill chips. Ours is chalk with hairline borders and small buttons, with little difference between a card and the page.
6. **The landing page is all explanation.** No picture, no featured property row worth the name, a paragraph of "how this catalog works" and "why there are no prices". Stitch's landing and guided start put a headline, one sentence, two big buttons and a large image of a real residence with a caption over it.
7. **Admin is a form, not a desk.** The Stitch editorial desk shows one card per field with the value in an input, a filled **Confirm** and an outlined **Edit** side by side, the confidence note, and the source page beside it. Ours hides every input behind an Edit button, stacks the "Edited" tag with the button, and puts the version history before the work.

## What replaces what (we have no price and no score)

| Stitch shows                    | We show, from data we hold                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Price on the hero and the cards | Possession (status and date), carpet area range, configurations, locality                                     |
| Price per sq ft                 | Carpet area of the chosen unit type; units in the project                                                     |
| Score dial ("PropScore 92")     | A **facts completeness** ring: how much of the record is stated, and how much the regulator's record confirms |
| "Match 94%" badge               | "Matches your brief: 3 BHK, Ambli, ready by 2027" built from the buyer's own intake                           |
| Yield, market context tables    | Nothing invented: amenities, specifications, developer, RERA facts                                            |
| Commute logic callout           | Locality and pincode, until we hold real location data                                                        |

## The pass, in order

1. **Foundations:** a stronger type scale (display sizes, accent words), elevated cards, tonal layers, chips, an icon set (lucide, already in), a hero image treatment (gradient scrim, overlaid title and actions), consistent buttons (large filled primary, outlined secondary).
2. **Landing:** a split hero: expressive tagline, one sentence, two big buttons, and a large photograph of a real published property with its name over it; a row of featured properties as image cards; "how it works" as three icon cards; a comparison teaser; the no-price explanation shrunk to one confident band.
3. **Browse cards:** taller image, RERA badge on the image, key facts as chips, the Compare button on the image corner, a visible hover.
4. **Dossier:** full-width hero with the title and actions over the primary picture and a gallery mosaic beside or under it; key intelligence tiles; a right-hand sticky stack (Project overview, Verified identity, Curated amenities with icons); configurations as the styled table; the completeness ring; pictures always visible, not collapsed.
5. **Comparison:** the same treatment (hero image per column, tinted rows, callout for the summary), still price-free.
6. **Intake and shortlist:** icon and image choice cards; the "your brief so far" sentence with highlighted values.
7. **Admin (separate, because the owner asked for it):** always-editable fields with the status tag on the right; a guided path with a primary "Next" and a secondary "Save draft"; admin-uploaded images approved without a dead end; one Publish for an owner; version history last.

## Tagline for the hero

Expressive, short, and about the product's reason to exist (comparison). Proposed: **"Compare homes, not brochures."** Alternatives: "Every home, side by side. Nothing hidden." and "Choose with the facts in front of you." Set very large, with the key word in the accent colour.

## Rules kept

- No exact price, price per sq ft, budget bucket, score or ranking on any buyer surface (`AGENTS.md`).
- `--color-verified-gold` only on verified/trust badges, never decoration.
- Pictures are served through the media route with their credit; a property with no picture keeps a neutral frame and says nothing.
- Phones get a designed layout, not a squeezed one.
