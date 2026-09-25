# Tasklist — comparison analytics (slice 4): first-party event capture

**Status:** done (2026-09-25). Scope widened the same day by the owner (below).
**Owner:** Bhavarth
**Branch:** `task/phase-3-completion`
**References:** `docs/tasklists/2026-09-23-analytics-event-taxonomy.md` (the design and its five open questions), `DECISIONS.md` 2026-09-19 (developer analytics is the revenue product; event capture must exist by beta), 2026-09-23 (a preference index is developer-facing only, never a buyer score; paid presence never affects ordering or comparison content), `docs/production-readiness.md` (the privacy policy must name what is collected), `AGENTS.md` (no price on a buyer surface; schema changes surfaced).

## The owner's answers (2026-09-25, in chat)

1. **Identity:** a random per-browser ID, kept across sign-in. Events record whether the visitor was signed in and never who. The events table holds no user id, no name, phone, email or IP, and no join to a person exists anywhere ("linked at sign-in" is the same ID continuing across the gate, so the funnel is unbroken; it is not a link to an account).
2. **Retention:** raw rows 13 months, then only counts remain (per month, event and property: events and distinct visitors).
3. **Consent:** the privacy notice only, no consent prompt, because events carry no user identifiers. A visitor's Global Privacy Control or Do Not Track signal is honoured (nothing is recorded). Revisit if a third-party tracker is ever added.
4. **Choice signal:** an enquiry after comparing. The enquiry event carries the properties that were being compared.

## Scope widened by the owner (2026-09-25, in chat)

"Always see which properties get mostly compared against, how much a user compares (timing or count), stronger than Google site analytics, kept updated in the admin panel." Answers: engaged time per page, visibility-aware; record sections opened, unit-type switches, focus chips and properties removed from a comparison; the budget band of the stated ceiling, admin-only; UTM tags plus the referring domain. Added: `comparison_removed`, `compare_group_opened`, `compare_unit_switched`, `compare_focus_set`, `intake_completed`, `page_engaged`, and the admin Analytics screen (`/admin/analytics`, live, refreshed every minute).

## Events (verified against the real routes and components)

| Event                | Emitted from                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `property_viewed`    | the dossier page                                                                          |
| `comparison_started` | a property added to the comparison tray (with the set it now belongs to)                  |
| `compare_opened`     | the compare page (`signed_in` false is the gate reached, true is the comparison unlocked) |
| `comparison_shared`  | "Copy link" on the compare page                                                           |
| `property_saved`     | Save on the dossier                                                                       |
| `comparison_saved`   | "Save this comparison"                                                                    |
| `dossier_unlocked`   | the enquiry form's unlock step                                                            |
| `enquiry_submitted`  | the enquiry form, after the enquiry is created (with the properties being compared)       |

"Visitor" and "second property viewed" are worked out from `property_viewed` per ID. No price, stated budget range or search text is ever recorded.

## Steps

1. [x] Schema v20 (migration `0024`): `analytics_events` (append-only for the app role except the retention delete) and `analytics_event_monthly`.
2. [x] Pure helpers: event names, the body check, device class, bot and privacy-signal checks, the source label, the cookie.
3. [x] `POST /api/v1/events`: sets or reads the ID cookie, resolves slugs to listed properties, ignores rather than errors on anything not recordable.
4. [x] Client: `trackEvent` (beacon), a mount tracker, and the eight emit points.
5. [x] Retention: roll up then delete raw rows older than 13 months (`bun run analytics:purge`).
6. [x] Tests (helpers, the route against the database, retention, the emit points), docs (`DECISIONS.md`, `PROGRESS.md`, `docs/schema/schema.v20.md`, `docs/api/api-spec.v1.md`, `docs/production-readiness.md`), verification.

## Not doing

- Any buyer-facing use of this data, and the preference or "win-rate" index (deferred, developer-facing only).
- The developer-facing analytics (Phase 4). The admin screen is the only reader.
- Rate limiting beyond a small body cap: a caller can add noise to the counts, which is a known limit of unauthenticated first-party telemetry.
