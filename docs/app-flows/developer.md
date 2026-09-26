# Developer portal flow

**Status:** the submission-creating half of this flow (staff sign-in, portfolio link, brochure upload, page routing, OCR-draft review, submit/track) is pulled forward into finishing Phase 2A as of 2026-09-18 — see that dated `DECISIONS.md` entry and `docs/tasklists/2026-09-18-phase-2a-completion.md`. It still depends on the admin review/publish boundary this file's own permissions section describes, which is being built in the same push. The portfolio/analytics dashboard (step 4's "review portfolio completeness/interest analytics") remains Phase 4 — see `docs/roadmap.md`.

**2026-09-25 — Deep:** step 4 is now planned as a developer-facing, aggregates-only view over the schema v20 analytics (`docs/tasklists/2026-09-25-phase-4-developer-analytics.md`). The developer is resolved from `requirePortalRole("developer", …)`, never from request input. Only the linked developer's own properties appear, every buyer-behaviour figure is withheld below a privacy threshold (shown as "not enough data", never zero), and no visitor/session id, price, private bucket or buyer detail is shown. The threshold, competitor-pairing visibility, the enquiry count's definition and property eligibility are open choices in that tasklist. The developer's view of a forwarded enquiry (schema v19) is not part of it: it is built separately at `/developers/enquiries` (`DECISIONS.md` 2026-09-26), showing the buyer's name, message and phone once the admin forwards it.

**2026-09-26 — Deep (Part 4):** the queries and API behind step 4 are built (`GET /api/v1/developer/portfolio`, `/properties/{id}` and `/export`; `src/lib/developers/analytics/`). What a developer can see: their own listed properties' released figures for one of five fixed windows, each with when it was made and how far tracking reaches; the properties buyers most often compare theirs with, **named**, each with only how many people did (owner decision, `DECISIONS.md` 2026-09-26); their figure against the median of other developers' properties nearby, only when enough exist; and how much of the property's record is stated. The portal screens are Part 5. Open choices 4, 8 and 9 in the tasklist are resolved (`DECISIONS.md` 2026-09-26, "Part 4 built").

**2026-09-26 — Part 5:** `/developers` shows portfolio figures, listed properties and the five fixed report windows; `/developers/properties/{id}` shows released engagement and funnel counts, budget/device and intake BHK/city demand, named rival pairings, peer medians and facts stated. An intake choice counts only when the same identified visitor later views or compares the property. Every split is gated at five distinct identified visitors and an under-gate cell says "Not enough data", never zero. The report explains partial tracking and stale runs and links to the same scoped CSV. The forwarded enquiries page shares the developer shell but remains separately guarded; its buyer contact detail is not part of analytics. The app host jobs remain unscheduled until hosting, by owner direction.

## Purpose

Let authorized developer staff maintain a portfolio through accountable submissions without gaining editorial or publishing authority.

## Primary journey

```text
Staff sign-in
  -> Portfolio dashboard
  -> Choose property or new-property proposal
  -> Create/edit draft
  -> Submit for review
  -> Track outcome
  -> Respond to changes requested
```

1. Staff sign in with a developer-staff account.
2. The invitation already links the account through `developer_users` to an
   administrator-created canonical `developers` profile; it does not create a
   second builder record.
3. The portal resolves that link and shows only the builder's portfolio.
4. Staff review portfolio completeness/interest analytics and select an existing property or new-property proposal.
5. Staff upload a brochure, map its pages to project/amenity/specification scopes and multi-page unit-variant groups, then review the OCR draft.
6. Staff create or edit a `property_submissions` draft, providing evidence/documents where required.
7. Staff submit it for admin review and track draft, submitted, in review, changes requested, approved, rejected, or published status.
8. If changes are requested, they revise and resubmit. Publication is visible as an outcome, never as an action they can invoke.

## Permissions and boundaries

- Developer staff access only the linked developer entity and owned submissions.
- They create drafts, submit, and respond to feedback.
- They cannot set an admin review result, verify their own claims, edit a live catalog record directly, or call the publisher.
- A new-property proposal remains a submission until an authorized admin approves and publishes it.

## Exception paths

- Revoked/inactive invitation: end session and deny portal access.
- Concurrent review-state change: show current status and require a new revision when edits are no longer permitted.
- Invalid/missing controlled-vocabulary value: block submission with a field-level error; do not create free-text amenity/specification records.
