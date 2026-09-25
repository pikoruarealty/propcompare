# Tasklist — close Phase 3: the enquiry flow, units per floor for the whole floor, and the price categorization check

**Status:** done (2026-09-25).
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `docs/roadmap.md` (Phase 3 acceptance), `docs/tasklists/2026-09-21-phase-3-buyer-flows.md` (the enquiry form and admin inbox), `docs/tasklists/2026-09-01-private-budget-buckets.md`, `docs/tasklists/2026-09-24-private-prices.md`, `DECISIONS.md` 2026-09-24 "derived metrics" (units per floor), `AGENTS.md` (schema changes are surfaced first; prices never leave `private`).

Owner direction, in chat 2026-09-25: enquiries reach the admin first; the admin then sends one to the developer or closes it. Units per floor should be the whole floor's, not one unit type's. Make sure the price categorization works. Then finish Phase 3.

## Steps

1. [x] **Enquiry flow.** Statuses `new`, `contacted`, `forwarded`, `closed`. Schema v19: the `forwarded` enum value and `enquiries.forwarded_at`. The admin inbox names the developer, offers "Forward to {developer}" and "Close", and shows when it was forwarded. Buyers still receive only the status they are created with (`new`). What a developer then sees is Phase 4 (the developer portal is on hold) and is a privacy decision for the owner (the buyer's number).
2. [x] **Units per floor.** A project-level row, "Units per floor (calculated)": total units divided by towers and floors, stated as about, from the three stated inputs, not stated when any is missing. The existing per-unit-type row is relabelled so it cannot be read as the floor total.
3. [x] **Price categorization check.** Run the private matcher and bucket mapping against the live data and the tests; report what works and what it cannot do yet. No change unless something is wrong.
4. [x] **What is left of Phase 3** (roadmap, PROGRESS, tasklists): list it, do what is doable, and reconcile the roadmap's status.
5. [x] Tests, docs (`DECISIONS.md`, `PROGRESS.md`, `docs/schema/schema.v19.md`), verification.

## Not doing

- The developer's view of a forwarded enquiry (Phase 4, on hold).
- Any buyer-facing price. Nothing here reads a price into a buyer surface.
