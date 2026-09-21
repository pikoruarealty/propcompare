# Comparison — design and UX specification v1

**Status:** active. Written 2026-09-20 at the owner's direction. **Comparison is the product's reason to exist** (see `AGENTS.md`, "The product is comparison"). Every other buyer surface — browse, dossier, intake, saves — exists to get a buyer to a good comparison and out of it with a decision.

## Why this is the product

Property portals list. PropCompare compares. The whole data model (one live representation of each entity, controlled vocabularies, exact units, explicit "not stated", RERA cross-checks, reviewed publishing) exists so that two properties can be laid next to each other and every row means the same thing on both sides. If the comparison is not clearly better than what a buyer gets from Housing.com, 99acres or MagicBricks, PropCompare is just another listing site.

Those portals compare listings: a static grid of price, area and possession, price-first, with gaps left blank and no way to tell a missing fact from a "no". We have no price to lead with, so we must win on being **comparable, honest and decisive**.

## What the research says (and what we do beyond it)

- **Baymard** ([4 ways to optimize the comparison feature for scanning](https://baymard.com/blog/user-friendly-comparison-tools)): hiding attributes that are the same is more effective than highlighting differences; group attributes by category; keep column headings sticky; use row styling to guide the eye across columns.
- **Nielsen Norman Group** ([3 rules for better comparison tables](https://www.nngroup.com/videos/ux-rules-comparison-tables/)): simplicity, consistency, scannability. Also their guidance on big tables on small screens: lock headers and let the user choose a subset.
- **Our design guide** (`design.v1.md`): decision over data; consistent labels and explicit missing-data states; on mobile a focused consideration set, never narrow squeezed columns.

Everything below applies those, then goes further where our data lets us.

## Principles

1. **Like for like.** A property has many unit types; comparing a project's whole range to another's is meaningless. The unit of comparison is **a unit type of a property**, matched by BHK by default (a 3 BHK against a 3 BHK), changeable per column. Areas are only ever compared on the same basis (carpet with carpet); a basis is never derived from another.
2. **Differences stand out, nothing is hidden.** Every stated row is shown; rows that differ are shaded and rows stated for some and not others are marked, and the summary above the table leads with what changes. (A "show only differences" switch was built and removed at the owner's direction: with real properties nearly every row differs, so it hid nothing worth hiding.)
3. **Say what changes.** Above the table, a short plain-language block, "If you choose A over B", built by rule from the verified facts (never generated text, never a score): each line names the difference and both values ("A has 8% more carpet area: 3,978 vs 3,684 sq ft"). At most five lines, ordered by what the buyer said matters. It never claims anything from a missing fact.
4. **Honest gaps.** "Not stated" and "not offered" are different facts and look different. A fact missing on one side is shown as missing, never counted as a difference of value, and never used in the summary.
5. **Trust is visible where the fact is.** RERA status is a header row. A value the regulator's record confirms carries the quiet "Source: GujRERA, checked on …" line (`DECISIONS.md` 2026-09-20); a brochure-sourced value does not pretend to.
6. **Numbers you can scan.** Areas and counts get a small relative bar and the largest is marked, so the size difference is felt before it is read. Units are consistent (sq ft, ft), tabular numerals.
7. **Trade-offs, not verdicts.** No score, no rank, no "winner", no "recommended". We show what each choice gives and gives up (the design guide's "what changes if you choose A over B?"). No price, price per sq ft or budget bucket, ever.
8. **Room by room** (slice 2). Because we hold room dimensions, rooms are compared by kind: bedrooms sorted by size, living, kitchen, foyer. No portal can do this because none holds consistent dimensions.
9. **Floor plans side by side** (slice 2). Each column's floor plan for the chosen unit type, openable in the zoomable viewer.
10. **Focus lens** (slice 3). Chips (Space, Timeline, Amenities, Build, Trust) reorder groups and the summary; preselected from the buyer's intake priorities when they have them.
11. **No sign-in to compare.** Selection lives in the browser and in a shareable address; only saving a comparison needs an account (the existing `POST /api/v1/comparisons`). Sharing a link is a feature: buyers compare with a partner and with family.
12. **Small sets.** Up to three properties (owner decision, 2026-09-20; two visible at a time on a phone with a picker for which two). More than three is a list, not a comparison.

## Interaction

- **Adding.** A "Compare" toggle on every property card and on the dossier. A small tray docks at the bottom of the page: the chosen properties (name, a thumbnail), remove buttons, and "Compare (n)" once there are two. It survives navigation and reloads.
- **The page.** `/compare?p=slug-a,slug-b[,…]` with an optional per-property unit type (`&v=slug~unitTypeId`). A sticky header row with each property's picture, name, locality, developer and RERA status. Below it: the summary block, the controls (a collapse-all control; unit type pickers per column), then grouped sections.
- **Switching unit types in the table.** Each column header carries its own unit type control (chips for up to three types, a menu for more) and the table redraws at once, without a reload, with the address updated so the link still reproduces it. Changing the first property's type re-matches the others to the same configuration.
- **Groups** (in this order; each collapsible, with a count of how many rows differ; on a phone the long lists, amenities and specifications, start closed, and there is an expand and collapse all control): Possession and timeline · Unit type (configuration, areas by basis) · Amenities · Specifications · RERA and developer.
- **Amenities** are compared as a matrix over the union of what either offers, only rows that differ by default.
- **Removing** a property keeps the rest; the address updates.
- **Phone.** Two properties visible at once (a picker chooses which two when three are compared), each row's label above its two values, no sideways table. Swiping between pairs is a later refinement.
- **Empty and small states.** One property: "Add another to compare". Zero: a short explanation and a link to browse.

## Data rules (consistency is the point)

- Rows come from one fixed, ordered definition, so the same fact is in the same place for every comparison.
- A row is shown only when at least one side has a value (or the row is a header row).
- "Differs" is decided on normalised values (numbers within a small tolerance, dates as dates, sets as sets), never on display strings.
- The summary is derived only from rows where every side has a stated value.

## Slices

1. **Core** (this slice): selection tray, `/compare`, like-for-like unit type matching, grouped rows, summary block, size bars, provenance, sticky header, phone two-up.
2. **Depth:** room-by-room comparison, floor plans side by side. **Built 2026-09-21.** Rooms are read as a kind from their published names (bedroom, living, kitchen, foyer, balcony, toilet), shown as stated and largest first, with no area computed from the sides; a room whose name does not clearly say what it is is left out, never guessed.
3. **Personal:** focus chips from intake priorities, saved comparisons and the shortlist page (uses the existing routes, needs sign-in), shareable and printable brief. **Built 2026-09-21 except the printable brief.** The chips only reorder groups and the summary; they are in the address (`f=`) and start from the priorities guided intake leaves in the tab (never the stated range). Saving the same comparison twice returns the one saved. The shortlist is `/saved`.
4. **Insight:** comparison behaviour as a developer-analytics signal, aggregated and price-free (see the developer analytics decision, 2026-09-19).
