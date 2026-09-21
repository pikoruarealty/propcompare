# Tasklist: comparison slices 2 and 3 and the Phase 3 buyer flows

**Status:** built and verified 2026-09-21 except the items under "Not built, and why". **Note on order:** written after the code, not before, which `AGENTS.md` asks the other way round.
**Owner:** Bhavarth
**References:** `AGENTS.md` (comparison is the product; no price, score or ranking on the buyer side; no sign-in to compare), `docs/design/comparison.v1.md` (items 8 to 10 and slices 2 to 4), `docs/design/no-vibecoded-tells.v1.md`, `docs/app-flows/buyer.md` (steps 5 to 8, exception paths), `docs/api/api-spec.v1.md` (buyer-account routes), `docs/product/prd.v1.md`, `docs/schema/schema.v1.md` (`saved_properties`, `comparisons`, `comparison_items`, `enquiries`, `dossier_unlocks`), `docs/tasklists/2026-09-20-comparison-experience.md`, `DECISIONS.md` 2026-09-21

## Non-goals

- No schema change. No price, score, rank or winner anywhere.
- Not the developer portal, and nothing developer-facing.
- Not the intake cookie, "report a problem" or "claim this listing", or comparison analytics: each needs a decision or a schema change (see below).

## Checklist

### Comparison slice 2 (depth)

- [x] Room by room: rooms read as a kind from their published names (bedroom, living, kitchen, foyer, balcony, toilet), sizes as stated, largest first, no area computed from sides, unclear names left out. Sizes shown to at most two decimals.
- [x] Floor plans side by side for each column's chosen unit type, opening in the zoomable viewer with the credit; "Not stated" when none.
- [x] Tests: `roomKind`, the room rows, the floor-plan row and its absence.

### Comparison slice 3 (personal)

- [x] Focus chips (Space, Timeline, Amenities, Build, Trust): reorder groups and the summary only; in the address (`f=`); preselected from the priorities guided intake leaves in the tab (priorities only, never the stated range).
- [x] Save this comparison (signed in) and a sign-in link (signed out); saving the same comparison again returns the one saved.
- [x] `/saved`: saved comparisons and saved properties; header link.

### Phase 3 buyer flows

- [x] Save on the dossier (sign-in link when signed out; toggles saved state; failure leaves the state and says so).
- [x] Enquiry form on the dossier: signed-in, phone-verified buyer (the sign-in is the OTP); records the dossier unlock, then the enquiry; keeps the message on failure.
- [x] Admin inbox `/admin/enquiries` and `PATCH /api/v1/admin/enquiries/{id}`: newest first, property, unit type, message, who to contact, status new / contacted / closed.
- [x] Sign-in with the dev OTP, save, enquiry and saved comparison driven in a real browser; the inbox showed the enquiry and its status changed.

### Documentation

- [x] `docs/api/api-spec.v1.md`, `docs/design/comparison.v1.md`, `docs/tasklists/2026-09-20-comparison-experience.md`, `docs/roadmap.md`, `DECISIONS.md`, `PROGRESS.md`.

## Not built, and why

- **Pre-login intake cookie.** Its tasklist says to ask before implementing: which sign-in route the claim hooks into, what happens to an unclaimed cookie, whether the buyer ever sees the row again. It also stores the stated budget range server-side, which reopens the price-leak decision of 2026-09-07 and interacts with the privacy policy that is not yet written. Needs the owner's answers.
- **Claim this listing / report a problem.** "Report" needs somewhere to store reports (a schema change, and `AGENTS.md` says to surface those), and "claim" belongs to the developer portal, which is on hold. Proposed: a `listing_reports` table (schema v10). "Last checked" already shows as the GujRERA source lines.
- **Comparison analytics (slice 4).** Needs an events table (schema change) and a privacy position on what a comparison records; deferred with the privacy policy.
- **Phone-gated content.** The unlock is recorded on enquiry, but no content is restricted behind it yet because the catalog holds nothing that needs restricting (no price, no documents). If restricted documents are added later, the gate already exists.

## Acceptance and verification

A buyer signs in with a mobile number, saves a property, saves a comparison, opens `/saved` and sees both, and sends an enquiry that an admin sees in the inbox and can mark. A visitor with no account can still compare, and the focus chips only reorder. Verified 2026-09-21: `bun run typecheck`, `bun run lint`, `bun run format:check`, `bunx vitest run` (see PROGRESS.md for counts), and a real-browser run of the flow above on Kimana and Amaris.

## Completion record

2026-09-21: built as above. Follow-ups: the three "not built" items (owner answers or a schema decision), a visual check of `/saved` with many items, and the UI and flow refinement round the owner plans after Phase 3.
