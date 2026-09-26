# Schema v19 — enquiry forwarding

**Date:** 2026-09-25. **Migration:** `0023_enquiry_forwarding`. **Owner direction:** in chat, 2026-09-25 (`DECISIONS.md` the same date).

An enquiry reaches the admin first. The admin then sends it to the property's developer or closes it themselves. Two additions, nothing removed, nothing rewritten.

## `enquiries`

| Change                                   | Notes                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enquiry_status` gains `forwarded`       | The statuses are now `new`, `contacted`, `forwarded`, `closed`. `contacted` stays: an admin can reach the buyer before deciding. A Postgres enum value cannot be removed, so nothing was renamed; the two existing `contacted` rows and the `closed` one are as they were. |
| `forwarded_at` (`timestamptz`, nullable) | Set when an admin forwards an enquiry; left as the record of the last forwarding when it moves on (closed, or taken back). Null for an enquiry that was never forwarded.                                                                                                   |

Only an admin sets either (`PATCH /api/v1/admin/enquiries/{id}`); a buyer's enquiry is always created `new`.

## Not in this version

The developer's view of a forwarded enquiry. The developer portal is on hold (`docs/roadmap.md`, Phase 4), and what a developer may see of a buyer (their number in particular) is a privacy decision for the owner, so `forwarded` is only a status and a date for now.

**Update 2026-09-26:** the owner decided that a forwarded enquiry shows its developer the buyer's name, message and phone (`DECISIONS.md` 2026-09-26, `docs/tasklists/2026-09-26-developer-forwarded-enquiries.md`); it is built at `/developers/enquiries`. No schema change was needed.
