# Tasklist — the comparison experience (the product's core)

**Status:** slice 1 built and verified 2026-09-20 (owner's decisions after seeing it: at most three properties; switch a property's unit type inside the table; sections collapsible); slices 2 to 4 not started
**Owner:** Bhavarth (Deep is not developing; this was Deep's Phase 3 item and never had a screen)
**Branch:** `task/phase-2a-completion` (buyer UI; to be merged with the phase)
**References:** `docs/design/comparison.v1.md` (the specification), `docs/design/design.v1.md`, `docs/app-flows/buyer.md` (steps 5 and 6), `docs/product/prd.v1.md`, `docs/api/api-spec.v1.md` (`GET, POST /api/v1/comparisons`), the Stitch screens `comparison_the_decision_brief`, `comparison_story_high_fidelity_trade_offs`, `mobile_consideration_set_high_fidelity`, `DECISIONS.md` 2026-09-20 (comparison is the product)

## Where things stood

The comparison API (`src/lib/buyer/comparisons.ts`) stores a signed-in buyer's comparison as a list of properties and unit types. **There was no screen at all:** no "Compare" button, no tray, no comparison page. The property card even says compare "lives on the dossier and the saved and compare pages"; neither exists. The API also requires sign-in and can only create a whole comparison at once, which does not fit comparing as you browse.

## Non-goals (slice 1)

- No price, price per sq ft, budget bucket, score, rank or "winner", ever.
- Room-by-room and floor plans (slice 2); focus chips, saved comparisons and the shortlist page (slice 3); analytics events (slice 4).
- No schema change and no new write path: selection is in the browser and in the address. Saving reuses the existing route later.

## Checklist

### Slice 1 — core

- [x] `src/lib/compare/`: the comparison model (pure): like-for-like unit type choice, ordered row definitions, normalised difference detection, differences-only, size bars, the rule-built "If you choose A over B" summary, honest missing states. Unit-tested on Kimana-shaped data and edge cases.
- [x] Read path (the existing dossier read per slug, unlisted and unknown left out): several published dossiers by slug in one call (unlisted, deleted and unknown slugs are simply absent).
- [x] `/compare?p=…&v=…` page: sticky header, summary block, controls, collapsible grouped sections, empty and one-property states, phone two-up, unit type switching in the table, at most three properties.
- [x] "Compare" toggle on property cards and the dossier; the bottom tray; selection kept in the browser and reflected in the address.
- [x] Tests: model, page, toggle and tray components, no price anywhere (the existing leak guard on the compared data), a real-database check of the read path.
- [x] Real-browser check on Kimana plus throwaway published properties (deleted afterwards), desktop and phone width, three at a time.

### Documentation

- [ ] `AGENTS.md`, `docs/product/prd.v1.md`, `docs/roadmap.md`, `DECISIONS.md`, `PROGRESS.md`, this tasklist; `docs/app-flows/buyer.md` and the api-spec note that comparing needs no sign-in.

### Later slices

See `docs/design/comparison.v1.md` (slices 2 to 4).

## Acceptance

A buyer with no account picks two or more properties from the browse page or a dossier, opens the comparison, sees at once what differs (and what does not, on request), reads a short honest summary of what each choice gives and gives up, and can send the link to someone else. Nothing is compared across different area bases, no price appears, and every missing fact says so.

## Completion record

_(fill in at completion)_
