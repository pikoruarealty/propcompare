# Tasklist — a developer sees their forwarded enquiries

**Status:** done (2026-09-26). Not looked at in a browser.
**Owner:** Bhavarth
**References:** `DECISIONS.md` 2026-09-25 ("Enquiry flow", the item this resolves) and 2026-09-26 ("A forwarded enquiry is visible to its developer"), `docs/schema/schema.v19.md` (enquiry forwarding), `src/lib/buyer/enquiry-inbox.ts` (the admin's equivalent query and its buyer-contact join), `src/lib/accounts/roles.ts` (`developerId` on a resolved developer session), `AGENTS.md` (no assumptions; controlled surfaces).

The owner's answer, in chat 2026-09-26: once forwarded, a developer sees the buyer's name, message and phone number, alongside the property, unit type and when it was forwarded. Not forwarded, or the admin's own triage status, stays invisible to a developer, unchanged.

This is separate from and does not touch Deep's Phase 4 analytics tasklist (`docs/tasklists/2026-09-25-phase-4-developer-analytics.md`), which explicitly excludes it.

## Steps

1. [x] `src/lib/developers/enquiry-inbox.ts` (or similar): a query scoped to one `developerId` (from `requirePortalRole("developer", …).role.developerId`, never request input), returning only `status = 'forwarded'` rows for that developer's properties — name, phone, email, message, property, unit type, `forwardedAt`. Mirrors `listEnquiryInbox`'s shape and join, narrowed by developer and status.
2. [x] A page under `src/app/developers/(portal)/enquiries/`, replacing nothing else in the holding shell. Empty state for no forwarded enquiries yet.
3. [x] Update the stale comment in `src/lib/buyer/enquiry-inbox.ts` ("the buyer's number... never reaches a buyer or developer surface") — it now does, deliberately, once forwarded.
4. [x] `docs/product/privacy-policy-inputs.md`: record that a forwarded enquiry's buyer contact (name, phone, message) is shown to that property's developer, and that this is the first developer-facing use of the phone number.
5. [x] Tests (the wrong-role and revoked-session refusal is `requirePortalRole`'s, tested with the portal auth, not repeated here): two developers cannot see each other's enquiries or properties; an unforwarded or closed enquiry is absent; the query never returns another developer's row even by a guessed id.
6. [x] `docs/app-flows/developer.md` and `PROGRESS.md` (no API route was added, so the API spec is unchanged).

## Not doing

- Any change to the admin inbox, the forward/close action, or the enquiry statuses.
- A reveal-on-request step, or routing contact through the admin — decided against (`DECISIONS.md` 2026-09-26).
- Anything in Deep's Phase 4 scope (analytics, completeness, benchmarks).
