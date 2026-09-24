# Tasklist: dossier sign-in gate, animated placeholder, readable lists, and the owner's small UI fixes

**Status:** done, verified 2026-09-24 (not looked at in a browser)
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `AGENTS.md` ("Comparison depth is gated behind sign-in"), `DECISIONS.md` 2026-09-22 (the gate), 2026-09-24 (server gate on `/compare`) and 2026-09-24 (later, this work), `docs/design/comparison.v1.md`, `docs/design/no-vibecoded-tells.v1.md`, `docs/api/api-spec.v1.md`. No schema change; no change to the publish transaction.

This tasklist was written after the code, not before it: the work arrived as a run of owner messages in one session. That is the departure from `AGENTS.md`; the checklist below is what was built and checked.

## Scope

- [x] **Dossier gate.** A signed-out visitor is not sent the unit-type measurements, amenity answers, floor plans, documents, or any photograph beyond the first three. `src/lib/properties/lock.ts` (`lockDossier`, `PREVIEW_PHOTO_COUNT`), a `lock` field on `PropertyDossier`, applied in `src/app/properties/[slug]/page.tsx` (now `force-dynamic`) and in `GET /api/v1/properties/{slug}` (now `private, no-store`).
- [x] **Locked placeholder.** `.lock-bar` in `globals.css`; `LockedBar`, `LockedTile` (`locked-skeleton.tsx`); `UnlockPrompt`, `LockedConfigurations`, `LockedAmenities`, `LockedMedia` (`locked-sections.tsx`); the comparison's locked rows use the same bars. Honours `prefers-reduced-motion`.
- [x] **Readable lists.** `splitListValue` in `dossier.ts`; the dossier draws items one to a line (`ItemList`), long values full width; the amenities full list and the comparison's specification cells follow.
- [x] **Verified mark.** `VerifiedBadge` says "RERA Verified" only; the number stays in the tooltip and the RERA section.
- [x] **Report a problem.** Popup with `reports@propcompare.example` (one constant, `src/lib/buyer/report-contact.ts`), a prefilled `mailto:`, no network call.
- [x] **Claim this listing** removed from the roadmap, buyer-flows, report-a-problem, admin-portal, first-property-live and production-readiness lists.
- [x] **Comparison.** The name row sticks below the site header; each plate is a carousel (one picture, arrows, count, an offset stack behind it) for a signed-in visitor.
- [x] **Overflow.** Review-panel text wraps (`Currently published` values, evidence, notes) and free-text inputs are growing textareas; dossier fact values wrap.

## Tests

- [x] `lock.test.ts` (what is withheld, ids absent from the payload, leak guard), `dossier-screen-locked.test.tsx` (placeholders, no false "Not stated", preview and counts, list drawing), `splitListValue`, a comparison specification list, plate carousel and locked-bar tests, the badge tests, the report dialog tests, and the properties route integration test (locked with no session, full with one, `private, no-store`).

## Documentation

- [x] `DECISIONS.md` 2026-09-24 (later), `AGENTS.md`, `docs/api/api-spec.v1.md`, `docs/design/comparison.v1.md`, `docs/design/no-vibecoded-tells.v1.md`, `PROGRESS.md`.

## Open, needs the owner

- The photo preview count (3 is my default) and whether specifications should lock too.
- A look in a real browser: the locked dossier, the shimmer, the list layout, the comparison's sticky names and plate carousel, the report popup.

## Verification

`bun run typecheck`, `bun run lint`, `bunx vitest run` (143 files, 1689 tests). `format:check` still flags only `docs/schema/schema.v12.md` and `docs/tasklists/2026-09-23-comparison-derived-metrics.md`, neither touched.
