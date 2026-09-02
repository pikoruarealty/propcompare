# Developer portal flow

**Status:** planned for Phase 4. Do not implement this ahead of the admin review/publish boundary it depends on.

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
