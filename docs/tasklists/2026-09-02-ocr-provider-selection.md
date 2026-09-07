# Tasklist — OCR provider & page-routing method selection

**Status:** in progress
**Owner:** Bhavarth
**Branch:** `task/ocr-provider-selection` (evaluation and documentation only;
no app code changed)
**Roadmap:** [Phase 2A](../roadmap.md#phase-2a--admin-ingestion--the-trust-boundary)

## Scope

Resolve the two open items the routing-foundation tasklist deliberately left
unanswered:

1. Which OCR/extraction provider(s) to call from the provider-neutral adapter
   (`src/lib/ocr/adapter.ts`), decided empirically against real brochures
   rather than from published pricing alone.
2. What actually produces the human-confirmed page-routing manifest
   (`docs/tasklists/2026-09-01-phase-2a-ocr-routing-foundation.md`'s "cheap
   text-layer inspection may suggest scopes but cannot create variant
   identity") — this task discovered that "cheap text-layer inspection" as
   originally imagined does not work at all for this data, and had to find
   a working replacement before the provider comparison could even run.

All evaluation runs use OpenRouter (one API key, many models) against 3 real
brochure PDFs supplied for this purpose.

## References

- [Phase 2A OCR routing foundation](2026-09-01-phase-2a-ocr-routing-foundation.md)
  — left this open explicitly: "OCR provider selection remains open and
  requires its own dated decision in the later provider-integration task."
- [Property schema fields contract](../data/v1-property-schema-fields.proposal.2026-09-01.md)
- [Schema v3](../schema/schema.v3.md)

## Non-goals

- Not implementing the adapter, the admin page-picker UI, or any live call
  path in the app — this is evaluation only, run from scripts outside the
  repo (see Methodology).
- Not writing the final provider-decision `DECISIONS.md` entry yet — the
  extraction-quality comparison must be rerun against corrected page routing
  first; numbers from the first pass (wrong pages) are cost/latency
  reference data only, not an extraction-quality verdict.
- Raw brochure PDFs and raw model output are NOT committed to this repo —
  they can contain real property identity/address/price data, which AGENTS.md
  and the legacy OCR audit already keep out of the git tree. Only
  methodology, aggregate findings, and cost figures are recorded here.

## Methodology

Two scratch scripts (outside the repo, scratchpad-only) drive this:

- **Page router** — classifies every page of a full, unrouted brochure into
  one of: cover, marketing_lifestyle, location_connectivity, amenities_list,
  unit_configuration_table, floor_plan, site_plan, specifications,
  rera_legal, other. Its only job is recall (which pages plausibly carry
  extraction-contract content); per-unit identity is deliberately not its
  job — see finding 3.
- **Extraction bake-off** — sends the router-confirmed, non-marketing pages
  of each brochure to a candidate extraction model and asks for the same
  structured JSON (property, unit_variants with areas, amenities,
  specifications, per-field page evidence including how a multi-page or
  multi-unit-per-page variant was identified), then compares validity,
  structure, and real per-request cost.

Both call OpenRouter with `plugins: [{ id: "file-parser", pdf: { engine:
"native" } }]` so each model reads the PDF with its own native document/vision
understanding, not OpenRouter's default Mistral-OCR preprocessing — otherwise
every model would just be reading one shared OCR transcript and the
comparison would be meaningless.

## Findings so far

1. **Text-layer keyword routing does not work for this data.** A pdfjs
   text-layer keyword scorer (looking for "bhk", "carpet area", "rera", etc.)
   was tried first, on the theory it was the "cheap text-layer inspection"
   the routing-foundation tasklist described. A direct check
   (`/\d{3,5}\s*(sq\.?\s?ft|sqm)\b/i` against every page's extracted text
   across all 3 brochures) found **zero** pages anywhere with area/sqft text
   in the text layer — floor plans and site plans in these brochures are
   pure raster images with no underlying text at all. No keyword list can
   route to a page that has no extractable text. This heuristic reliably
   picked marketing/lifestyle pages instead and missed every floor plan
   across all 3 brochures in the first (now-superseded) extraction run.
2. **A cheap vision-capable model can find these pages directly.** Replacing
   the keyword scorer with a model that actually looks at each page (tested:
   Gemini 2.5 Flash via OpenRouter, ~$0.007–0.016 per full brochure) located
   floor_plan and site_plan ranges that matched human-verified ground truth
   exactly on one brochure (site plan + floor plans at pages 19–29, confirmed
   correct) and closely on a second, larger one (69-page brochure; floor
   plans and specs correctly separated from ~14 pages of interleaved
   marketing/location/amenity pages in between).
   - Qwen 2.5-VL-72B was tried first as a lower-cost alternative and rejected
     for this step: it has no native PDF ingestion via OpenRouter's
     `file-parser` "native" engine and returns a hard 400 on every request
     ("Unsupported chat content part type: 'file'"). No cost was incurred —
     every call failed before any tokens were billed. Falling back to
     OpenRouter's OCR-conversion path for Qwen was considered but not used;
     Gemini 2.5 Flash has native PDF support at comparable cost with less
     complexity (no added OCR-conversion fee, same request shape as the
     extraction-side native-engine calls).
3. **Unit-variant grouping at routing time was the wrong design — fixed by
   moving it to extraction time instead.** First attempt had the router
   group floor_plan pages by unit under one label. This broke two ways:
   split-category attempt (`unit_floor_plan` vs. `building_floor_plan`) was
   based on a false assumption that a page with multiple units on it lacks
   usable per-unit data — disproven directly against a real page (Kimana
   Towers pg 8: two fully-dimensioned mirrored units, 301/302, on one
   drawing). And even within one category, a unit's two pages (e.g. a
   duplex's lower/upper floor) could land in two different byte-budgeted API
   calls, and each call — seeing only its own pages — produced two different
   labels for the same physical unit (confirmed twice on Amaris: pages 48/49
   and 60/61). A same-window reconciliation pass was built and worked, but
   was later removed as unnecessary complexity once the real fix landed: see
   the 2026-09-02 `DECISIONS.md` entry — per-unit segmentation now happens
   entirely at extraction time, against the model reading the full confirmed
   page range in one pass, not the router. Verified on 360: Claude Sonnet 5,
   given the corrected page-routed input, produced the exact 6 unit variants
   already confirmed by a human, with duplex/penthouse lower+upper pages
   merged correctly on its own (via its own `evidence.alt_page` citations),
   no router-side grouping needed at all. The router's category list is now
   just `floor_plan` (no unit split) plus the other content categories —
   its only job is page-level recall, not unit identity.
4. **Native-PDF prompt token cost differs a lot by provider**, independent of
   per-token pricing: for the same 15-page input, Claude's native PDF engine
   used roughly 24k–46k prompt tokens versus 68k–94k for the OpenAI models
   tested, on the same source pages. This carries through directly to
   per-request cost and is worth weighing alongside quality once the
   extraction-quality rerun happens.
5. **First extraction bake-off pass is cost/latency reference data only, not
   an accuracy verdict.** It ran before the routing failure above was
   understood, so it fed the models a keyword-routed 15-page selection that
   missed floor plans/specs on all 3 brochures — every model's
   `unit_variants[].areas` came back empty, which is a routing-input problem,
   not necessarily a model capability problem. Real per-request cost was
   still collected and is usable: totals across all 3 brochures were
   Sonnet $0.253, Opus $0.561, Sol $0.632, Terra $0.654 (Terra and Sol are
   within noise of each other). Terra was dropped from the candidate list on
   this basis; Sol's status is unresolved pending the corrected rerun.
6. **First corrected-routing extraction test (Sonnet, 360 brochure only,
   $0.0686) got unit-variant grouping exactly right, but returned empty
   `areas` for every variant — confirmed correct, not a miss.** Property
   fields (name, developer, city, locality, RERA number) and all 6 unit
   variants matched confirmed ground truth. A human check of the actual 360
   PDF (pg 20) confirmed these floor plans print room-by-room dimensions
   directly on the drawing (e.g. `M.BED-2 16'-4" x 13'-0"`, feet-inches
   notation) but never a total carpet/built-up sqft figure — true for
   "mostly any" of the 3 brochures. Amaris uses the same feet-inches
   notation; Kimana Towers uses decimal meters (`BED ROOM 4.36X7.00`). The
   original prompt only asked for a pre-computed total, which is why it
   found nothing — not a model capability gap. Fixed: `EXTRACTION_PROMPT` now
   asks for a `rooms` array per unit variant (room name + dimension exactly
   as printed + parsed length/width/unit), matching the canonical
   `unit_variants.dimensions` shape already in `docs/schema/schema.v1.md`
   (`{ rooms: [{name, length_ft, width_ft, area_sqft}], ... }` — this isn't a
   new field, the eval script just wasn't asking for it). Unit conversion and
   area computation (`length_ft`/`width_ft`/`area_sqft`, feet-inches and
   meters both normalized to feet, meters via ×10.7639 for area) now happens
   deterministically in `run-comparison.ts` after parsing, not trusted from
   model arithmetic — one consistent conversion path regardless of which
   notation a given brochure uses. Room _names_ are captured as printed and
   NOT normalized/merged (e.g. "LIVING/DINING" vs "FAMILY LIVING" stay
   distinct) — folding synonyms into one canonical room vocabulary is a
   controlled-vocabulary problem like `amenity_catalog`/`amenity_synonyms`,
   and there is no `room_catalog`/synonym table yet; that's a real follow-on
   schema decision, not something to improvise inside this prompt. Not yet
   run against the updated prompt — next step once confirmed.
7. **One brochure (Kimana Towers) has no single-unit floor-plan pages at
   all** — every floor-related page is a whole-floor plate (multiple units
   per drawing, per finding 3 above). This may be a real structural
   difference in what this brochure exposes per-unit vs. 360 and Amaris, not
   a routing miss; not yet independently confirmed.
8. **Room-dimension extraction works — verified against source, $0.3118,
   360 brochure only.** First attempt at `max_tokens: 12000` hit the cap
   exactly and OpenRouter returned `content: null` (no partial text to even
   inspect) — lost $0.1647 to a sizing mistake, not a model failure; fixed by
   raising to 32000 (actual usage: 26708 completion tokens) and by capturing
   the raw provider body on any null/unparseable response so a future
   miscalibration is diagnosable instead of a silent loss. Rerun succeeded:
   for the 4 BHK Typical variant, every room name and dimension checked
   against the actual pg 20 drawing matched (M.BED-2, LIVING/DINING, KITCHEN,
   VERANDAH, etc.), with one single-digit transcription slip (PERSONAL FOYER
   14'-8" read vs 14'-6" printed) — a real, trackable accuracy risk, not a
   structural miss. All 6 variants got a full `rooms` list and a
   deterministic `computed_total_sqft` (room-box sum, not a RERA carpet
   figure — no wall-thickness deduction): 3465-4804 sqft across the 6
   variants, all plausible for their BHK/duplex/penthouse tier. Confirms the
   finding-6 fix works on real data, not just in theory.

9. **Amaris corrected-routing run (Sonnet) is structurally successful;
   Kimana remains inconclusive.** Sonnet read Amaris' 36 routed pages and
   returned valid JSON at $0.367352 (57,561 prompt tokens; 25,223 completion
   tokens; $0.010204 per routed page). It identified six distinct variants:
   4BHK Types A/B/C and 5BHK Duplex Penthouse Types A/B/C, with the three
   duplex/penthouse variants spanning their paired lower/upper pages. It also
   extracted each brochure-declared carpet-area value and 21-31 labelled room
   dimensions per variant. This is a strong structural result, but the room
   transcriptions still require a human page-level spot check before being
   treated as an accuracy verdict. The 17-page Kimana request reached the
   script's 240-second timeout without an HTTP response or OpenRouter usage
   metadata. It therefore supplies neither a metre-notation quality verdict
   nor a known cost; do not count it as a zero-cost failure until account
   billing is checked.

10. **Kimana's successful HTTP response still failed the extraction contract
    because the completion budget was consumed before JSON was emitted.** A
    longer-window retry returned HTTP 200 with 57,775 prompt tokens, exactly
    32,000 completion tokens, $0.435550 cost, `finish_reason=length`, and
    `content=null`. The provider response shows that Sonnet spent the output
    allowance reasoning through the mixed parking and multi-unit floor-plan
    pages rather than producing the required JSON; waiting longer cannot fix
    that. A next attempt must reserve completion budget for the JSON by
    explicitly disabling reasoning or capping it to a small, documented token
    budget, then repeat the source-page accuracy check. The existing request
    does neither, so it is not yet a safe Kimana production candidate.
11. **The first guarded Kimana retry preserved a partial answer but proved
    that page filtering alone is not enough.** The evaluator sent the
    human-confirmed 11-page scope (parking-only pages removed), capped
    reasoning at 2,048 tokens, streamed the response, and recorded generation
    `gen-1788348379-bdCtESeDCA3xBfBwQom6`. It retained 8,544 visible characters
    of partial JSON rather than silently dropping them, but the model still
    ended with `finish_reason=length` at 32,000 completion tokens and a
    $0.399646 charge. The partial payload shows the remaining cause: asking
    one response to enumerate repeating Block A/B floor layouts creates too
    many room arrays. The next safe shape is separate, human-confirmed
    configuration-family scopes (typical layouts versus each penthouse
    lower/upper pair), with an instruction to emit one variant per distinct
    layout, not every repeated unit/floor number. Partial output remains
    diagnostic-only and is never eligible for submission publication.
12. **Root cause was the extraction prompt, not the batching/scoping —
    confirmed by a same-scope, prompt-only retry.** The 4-page
    `typical_layouts` scope (source pages 8-11: 3rd floor Block B/A, 4th-20th
    floor Block B/A) had already been split out via `KIMANA_BATCH_SCOPES`
    before finding 11 was written; that scoping was not the defect. The actual
    defect was that `EXTRACTION_PROMPT` had no explicit rule for recognizing
    mirrored units (301/302 on the same drawing) or repeated floor-range
    labels ("4th to 20th Floor") as _one_ mechanical layout, so the model
    transcribed each ~30-room list twice per page and burned its completion
    budget before finishing — the same failure mode finding 11 diagnosed, just
    now isolated to the prompt rather than the page scope. Fix: rewrote
    `EXTRACTION_PROMPT` with an explicit merge rule (rule 10) — mirrored pairs
    and repeated-floor-range plans collapse into one variant record each,
    named to cover every unit/floor it represents (e.g. "Block B - Units 301 &
    302 (3rd Floor)"), while layouts that differ in even one room (verified
    case: 3rd-floor units have `COVERED TERRACE`, 4th-20th-floor units have
    `BALCONY` instead, everything else matching) must stay separate variants.
    Re-ran the identical `typical_layouts` scope with no other change:
    `finish_reason=stop`, valid JSON, $0.173644 (roughly half the prior
    $0.35624 failed attempt, since no duplicate room lists were transcribed).
    Result: exactly 4 variants, one per source page (8, 9, 10, 11) — Block
    B/A x 3rd-floor and Block B/A x 4th-20th-floor — each with a
    non-duplicated room list, and the COVERED TERRACE/BALCONY distinction
    preserved correctly across the two floor tiers. `areas` came back empty
    for all four, consistent with finding 6 (these pages print no explicit
    total, only room dimensions) — correctly not fabricated. Human source-page
    spot-check of room accuracy against the actual PDF pages 8-11 is still
    outstanding (same caveat as findings 8-9 for 360/Amaris). Generation id:
    `gen-1788350264-V48Nj05MaVxuKGTJ3Ony`.

13. **Field-coverage audit against the approved contract found the eval
    prompt was under-asking, not that the schema was missing fields.**
    Cross-checked the user's requested field list against
    `docs/data/v1-property-schema-fields.proposal.2026-09-01.md` and
    `docs/data/v1-specification-catalog.2026-09-01.md`. Result: `total_towers`,
    `total_units`, `possession_date`, and
    `rera_construction_progress_percent` are approved fields that
    `EXTRACTION_PROMPT` simply never asked for; all 13 specification-catalog
    keys (`construction_quality`, `flooring`, `sanitary_fittings`,
    `window_glazing`, `ceiling_height`, `open_space`, `podium_structure`,
    `clubhouse_size`, `lifts_per_tower`, `parking_levels`,
    `density_units_per_acre`, `geyser_heat_pump`, `vrv_ac_provided`) are
    approved but the prompt's old `"specifications": { [key: string]: string
}` gave the model no key list to target. Separately, the Kimana
    `property` scope only ever sent routed pages mapping to source pages 1
    (cover) and 18 (rera_legal) - the specifications page (source 16) and
    location_connectivity (source 17) were never sent in any scope, so
    "specifications" was structurally guaranteed to come back empty
    regardless of prompt wording. Fixed both: `EXTRACTION_PROMPT` now asks
    explicitly for the 4 missing property fields and the 13 named
    specification keys (as nullable display-text values, not converted or
    normalized - preserves the "specification_text" contract from the catalog
    doc); the `property` scope's `routedPageNumbers`/`sourcePageNumbers` now
    include source pages 16 and 17. Total storeys/floors, units-per-floor,
    and plot/land size remain explicitly excluded from the schema
    (`v1-property-schema-fields.proposal.md`: "schema v1 has no canonical
    destination for them... must not be hidden in `dimensions` or a new
    free-text field") and rate-per-sqft/price remains excluded per the
    existing prompt rule 4 and AGENTS.md's private-schema money rule - none of
    these three, nor developer-profile narrative (experience/notable
    projects/background, which has no proposed field anywhere), were added to
    the approved JSON shape. Instead they are captured verbatim, unconverted,
    under a new `unmapped_raw_evidence` object with an explicit "no schema
    destination yet, not eligible for publication" instruction, so a future
    schema decision has real source text to work from instead of needing a
    brand-new extraction pass. Verified with `tsc --noEmit --skipLibCheck` and
    a `bun build` bundle check only (174 modules, clean) - not yet run against
    a real brochure with this expanded shape; that is the next paid step and
    needs its own confirm-before-paid-run check-in.

14. **Field-expanded `property` scope validated against the real Kimana
    brochure — the page-range fix demonstrably works, not just compiles.**
    Ran the finding-13 prompt/scope changes for the first time
    (`gen-1788351805-qDTRUvPPoTiYm7lJ3XJg`, $0.0442, `finish_reason=stop`,
    valid JSON). `specifications` — structurally guaranteed empty before this
    session because source pages 16/17 were never sent — now returns real,
    non-null values for `flooring`, `sanitary_fittings`, `window_glazing`,
    and `vrv_ac_provided`, each cited to source page 16 with 0.9 confidence.
    The remaining 9 specification keys, both possession fields, both
    project-total fields, `rera_construction_progress_percent`, and all 4
    `unmapped_raw_evidence` fields came back null — plausible rather than
    suspicious, since Kimana's specifications page may simply not print
    those particular concepts (a human spot-check against the actual PDF
    page 16 would confirm this, not yet done). `property.name`,
    `.developer`, `.city`, `.locality`, and `.rera_registration_number`
    ("Applied") all populated as before. No fabrication observed: nulls
    stayed null rather than being inferred.

## Cost ledger (real money spent, OpenRouter)

| Run                          | What                                                                                                                                                                                                                                                          | Cost                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2026-09-02                   | 4-model × 3-brochure extraction bake-off, keyword-routed pages (now known to be wrong pages)                                                                                                                                                                  | $2.0998                                                            |
| 2026-09-02                   | Qwen 2.5-VL page-router attempt (failed before billing)                                                                                                                                                                                                       | $0.0000                                                            |
| 2026-09-02                   | Gemini 2.5 Flash page router, 360 brochure only (validation run)                                                                                                                                                                                              | $0.0074                                                            |
| 2026-09-02                   | Gemini 2.5 Flash page router + unit-variant grouping (routing-side, since removed), 360 + Amaris brochures                                                                                                                                                    | $0.0240                                                            |
| 2026-09-02                   | Gemini 2.5 Flash page router with `unit_floor_plan`/`building_floor_plan` split + boundary reconciliation, Amaris + Kimana                                                                                                                                    | $0.0219                                                            |
| 2026-09-02                   | Gemini 2.5 Flash page router, simplified single `floor_plan` category, all 3 brochures (final router design)                                                                                                                                                  | $0.0254                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, corrected page routing, 360 brochure only                                                                                                                                                                                         | $0.0686                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, room-dimension prompt, 360 only, hit max_tokens cap and returned null content (lost run)                                                                                                                                          | $0.1647                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, room-dimension prompt, 360 only, max_tokens raised to 32000 (succeeded)                                                                                                                                                           | $0.3118                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, room-dimension prompt, Amaris (36 routed pages; succeeded)                                                                                                                                                                        | $0.3674                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, room-dimension prompt, Kimana initial attempt (17 routed pages; client timeout before response)                                                                                                                                   | unknown - no usage metadata                                        |
| 2026-09-02                   | Claude Sonnet 5 extraction, room-dimension prompt, Kimana retry (17 routed pages; HTTP 200 but output hit token cap)                                                                                                                                          | $0.4356                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, Kimana guarded retry (11 scoped pages; streamed partial JSON but output hit token cap)                                                                                                                                            | $0.3996                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, Kimana `typical_layouts` scope retry with dedup-fixed prompt (4 pages; succeeded, `finish_reason=stop`)                                                                                                                           | $0.1736                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, Kimana `penthouse_layouts` scope retry with dedup-fixed prompt (4 pages; succeeded, `finish_reason=stop`, correctly merged multi-page duplex + mirrored units into 2 variants)                                                    | $0.1871                                                            |
| 2026-09-02                   | Claude Sonnet 5 extraction, Kimana `property` scope retry with field-expanded prompt (4 pages, now including specifications + location_connectivity; succeeded, `finish_reason=stop`, real specification values returned for the first time — see finding 14) | $0.0442                                                            |
| **Documented running total** |                                                                                                                                                                                                                                                               | **$4.3997**                                                        |
| 2026-09-02                   | OpenRouter key total usage observed after the previous retry (pre-dates the $0.1736 run above)                                                                                                                                                                | $3.6565 (includes $0.0613 not attributable from available records) |

## Remaining work

- [x] Confirm with a human check of the actual 360 PDF whether the empty
      `unit_variants[].areas` from the corrected Sonnet run is a real miss or
      an accurate "not stated" — confirmed accurate; area must be computed
      from extracted room dimensions instead (see finding 6).
- [x] Rerun Sonnet on 360 with the updated `rooms`-capturing prompt and
      verify per-room dimensions and the computed total area against the
      actual PDF — done, $0.3118 (see finding 8). Room names/dimensions for
      the 4 BHK Typical variant matched pg 20 with one single-digit
      transcription slip (PERSONAL FOYER width read as 14'-8" vs printed
      14'-6") — real but non-disqualifying accuracy risk, needs tracking
      across a larger sample before trusting model transcription unverified.
- [x] Run Sonnet against the updated room-dimension prompt on Amaris (36
      routed pages) - valid JSON; six structurally plausible variants with
      declared carpet areas and 21-31 room dimensions each; $0.367352. Human
      source-page transcription verification remains outstanding.
- [x] Retry Kimana only after correcting the request configuration: cap or
      disable reasoning and reserve output tokens for JSON, then validate the
      page scope and metre conversion — reasoning cap/scoping were already
      correct going in; the real defect was the extraction prompt's missing
      dedup rule (see finding 12). `typical_layouts` scope (pages 8-11) now
      succeeds cleanly at $0.173644, `finish_reason=stop`. Metre-value
      accuracy against the source PDF is still an open item below.
- [x] Split Kimana into human-confirmed configuration-family scopes before
      the next paid attempt: typical layouts separately from each penthouse
      lower/upper pair — `KIMANA_BATCH_SCOPES` already did this
      (`property`/`typical_layouts`/`penthouse_layouts`); the extractor now
      also emits one variant per mechanically distinct layout instead of one
      per repeated unit/floor number (finding 12, rule 10). `typical_layouts`
      confirmed fixed; `penthouse_layouts` (pages 12-15) has not yet been
      retried with the fixed prompt — needs its own confirm-before-paid-run
      check-in, since a 2-page duplex (lower+upper) pair introduces a
      different merge case (combine across pages, not across mirrored units).
- [x] Retry the Kimana `penthouse_layouts` scope (source pages 12-15: 21st
      floor lower + 22nd floor upper, both blocks) with the same dedup-fixed
      prompt, and confirm the multi-page duplex-merge behavior (rule 9) still
      works correctly alongside the new dedup rule (rule 10) rather than
      conflicting with it — done, $0.1871, `finish_reason=stop`, exactly 2
      variants (Block A and Block B penthouse units), each correctly merging
      evidence across all 4 source pages (12,13,14,15): the lower/upper-level
      duplex-page merge (rule 9) and the mirrored-unit dedup (rule 10)
      composed without conflict (finding 12/13).
- [x] Retry the Kimana `property` scope with the field-expanded prompt
      (finding 13: property totals, `possession_date`,
      `rera_construction_progress_percent`, the 13 controlled `specifications`
      keys, and `unmapped_raw_evidence`) — also now covers the
      previously-missing specifications (source page 16) and
      location_connectivity (source page 17) pages, not just cover + rera_legal
      (see the `routedPageNumbers`/`sourcePageNumbers` fix in finding 13).
      Done, $0.0442, `finish_reason=stop`, valid JSON (see finding 14) — the
      page-range fix is confirmed structurally effective: `specifications`
      now returns 4 real populated values (`flooring`, `sanitary_fittings`,
      `window_glazing`, `vrv_ac_provided`, all cited to source page 16) where
      it was previously guaranteed empty regardless of prompt wording.
- [ ] Decide, with the user, whether to open a dated `DECISIONS.md` schema
      entry adding total storeys/floors, units-per-floor, plot/land size, and
      developer-profile narrative to the approved schema, or leave them
      permanently evaluation-only — these are currently captured only in
      `unmapped_raw_evidence` (finding 13), explicitly flagged there as "no
      schema destination yet," per the user's instruction to flag this for a
      later decision rather than silently treating it as settled.
      Rate-per-sqft/price stays excluded regardless of this decision — that
      exclusion is tied to AGENTS.md's private-schema money rule, not an open
      question.
- [ ] Human source-page spot-check of the `typical_layouts` room dimensions
      (pages 8-11) against the actual Kimana PDF, same practice as findings 8
      (360) and 9 (Amaris) — structural success confirmed, transcription
      accuracy not yet independently verified.
- [ ] Scope a `room_catalog`/synonym table (mirroring `amenity_catalog`) so
      room names extracted with different wording for the same logical room
      (e.g. "LIVING/DINING" vs "FAMILY LIVING") can be normalized for
      cross-property comparison — needed for the comparison feature, not
      solved by the extraction prompt itself.
- [ ] Design the review-gated room-normalization contract before implementation:
      preserve every brochure-labelled room and its source evidence as a
      distinct component; map only approved source labels through a controlled
      room vocabulary; and derive comparison-group **area totals** from those
      components. Never synthesize merged room dimensions (for example,
      `formal_living 10 × 12` plus `family_living 12 × 12` becomes a
      `living_spaces` total of 264 sqft, not an invented `22 × 24` room).
      Whether labels are true synonyms or distinct components of one comparison
      group must remain reviewable; it must not be inferred and published by
      the OCR model.
- [ ] Get human confirmation of final page ranges per brochure (per the
      routing-foundation decision: the model proposes, a human confirms).
- [ ] Rerun the extraction-quality bake-off against confirmed page-routed
      inputs on Amaris and Kimana, and against other candidate models, once
      the areas question above is settled — Terra already dropped, Sol's
      status still unresolved.
- [ ] Judge real field accuracy against known values on the corrected rerun
      (not just structural validity).
- [ ] Investigate Kimana's apparent lack of single-unit floor-plan pages
      (finding 7) — real brochure limitation or a routing miss.
- [ ] Write the actual provider-decision `DECISIONS.md` entry once accuracy
      data exists.
- [ ] Scope the follow-on provider-integration implementation tasklist.

## Completion record

Not complete. This file is being kept current as the investigation
continues; see git history for prior versions rather than a superseding
entry once it's done.
