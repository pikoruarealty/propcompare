# Tasklist — analytics event taxonomy and capture design (paper only)

**Status:** decided and built 2026-09-25: the owner answered questions 1 to 4 and the event list was checked against the real routes; see `docs/tasklists/2026-09-25-comparison-analytics-slice-4.md`, `docs/schema/schema.v20.md` and `DECISIONS.md` 2026-09-25.
**Owner:** Bhavarth
**Branch:** none yet — this is a design tasklist; no code branch until the design below is signed off
**Depends on:** nothing structurally, but should not start implementation ahead of comparison slice 4 needing it
**References:** `DECISIONS.md` 2026-09-19 ("Developer analytics is the intended revenue product... event capture is designed as its own tasklist and decision... the beta start date, not the paid launch, is the deadline for capture to exist"), `DECISIONS.md` 2026-09-23 (this tasklist's trigger — the reviewed investor-metrics chat, and the `activated user`/`completed comparison` definitions it adopts), `docs/design/comparison.v1.md` slice 4 ("Insight: comparison behaviour as a developer-analytics signal, aggregated and price-free"), `docs/roadmap.md` Phase 4 future-scope note, `docs/production-readiness.md` ("Analytics event capture (beta deadline)")

## Why this exists

Comparison slice 4 and the Phase 4 developer-analytics platform are both blocked on an event taxonomy that has never been designed — only promised. The 2026-09-19 decision explicitly declined to build a minimal event log ahead of this design (called it premature), but also fixed a hard constraint: raw first-party event history cannot be reconstructed after the fact, so capture must exist by the start of beta, not by paid launch. Phase 3 is nearly closed, which is the signal that beta is the next real milestone — so the design this tasklist produces is now due, even though the capture code it describes is not built here.

## Scope

Produce a written design — event taxonomy, identity model, retention/consent position, and the metric definitions needed to compute a north-star number — that a later implementation tasklist can build against without re-litigating these questions. No capture code, no schema migration, no new table in this tasklist.

## Non-goals

- No event capture code, no `events`/`analytics_*` table, no migration. This is the decision, not the build.
- No developer-facing dashboard or the paid analytics product itself (Phase 4 future scope, 2026-09-19) — this tasklist only ensures the data those will need exists once beta starts.
- No buyer-facing surface of any of this data (no "most compared," no match score) — `DECISIONS.md` 2026-09-23 already rules that out for comparison specifically; this tasklist does not reopen it.
- No comparison preference/"win-rate" index computation yet — that needs the taxonomy below to exist first, and is its own later tasklist.

## Decisions/ambiguities that block work (resolve before or during this tasklist, not guessed)

1. **Identity model for anonymous vs signed-in buyers.** The site already has two identity fragments that don't cleanly merge today: the client-side compare tray (unauthenticated, browser-only) and `buyer_intake_sessions` (written only at login, per-login not per-search, `docs/tasklists/2026-09-18-pre-login-intake-cookie.md`). Decide whether a stable anonymous ID is introduced (and if so, its lifetime and whether/how it's linked to a `userId` at sign-in) or whether anonymous activity is simply not attributable to a person until sign-in. This decision shapes every funnel step before the comparison sign-in gate.
2. **Retention window** for raw event rows, separate from any aggregate computed from them. Needs an explicit answer, not a default.
3. **Consent and declared trackers.** `docs/production-readiness.md` already flags a privacy policy that must describe what is actually collected; this taxonomy is exactly what that policy will need to name. Decide whether first-party event capture needs its own consent surface distinct from the eventual cookie/privacy notice, given it is first-party product telemetry rather than third-party tracking.
4. **Where "chose" comes from.** A comparison preference index (deferred per `DECISIONS.md` 2026-09-23, but designed against so it isn't precluded) needs a proxy for "buyer picked A over B" — the candidates are enquiry-after-comparison and dossier-unlock-after-comparison, both weaker than an explicit choice. Record which proxy the taxonomy captures attribution for, or record that none is captured yet and the index stays uncomputable until a later decision adds one.
5. **The exact event list and its properties.** Draft below is a starting point from the reviewed chat's funnel (§65), not a final answer — it needs to be checked against what the codebase can actually emit today (which routes/components see which transitions) before being treated as fixed.

## Draft funnel (starting point, to be verified against the real routes before it is treated as final)

`visitor → property viewed → second property viewed → comparison started (added to tray) → compare page opened → comparison sign-in gate reached → comparison unlocked (signed in) → shortlist/saved → comparison shared → enquiry submitted → dossier unlocked`

Each event carries: timestamp, the anonymous/session identity (per decision 1 above), source/campaign if present, device class, property id(s) and developer id(s) involved, and — once decision 1 is made — the buyer segment intake already captures (priorities, stated range, city).

## Metric definitions to lock in this tasklist (carried from `DECISIONS.md` 2026-09-23)

- **Activated user:** a buyer who has viewed at least two properties and started a comparison.
- **Completed comparison:** a comparison that reaches sign-in — i.e., the buyer has cleared the 2026-09-22 comparison sign-in gate for that comparison, not merely opened `/compare` and seen the open identity/summary block.
- Confirm both definitions are actually computable from the draft funnel above; adjust the funnel if not, rather than adjusting the definitions to fit a smaller funnel.

## Implementation checklist (design phase — no code)

- [ ] Resolve blocking decisions 1–4 above (owner sign-off where the choice affects privacy posture or what's collected).
- [ ] Finalize the event list and per-event properties against the real component/route boundaries (`src/components/buyer/`, `src/app/api/v1/`), not just the draft funnel.
- [ ] Confirm the activated-user and completed-comparison definitions compute cleanly from the finalized event list.
- [ ] Write the consent/privacy position that the eventual privacy policy (`docs/production-readiness.md`) will need to reference.
- [ ] Record the schema shape as a proposal (like `docs/data/v1-property-schema-fields.proposal.2026-09-01.md`'s pattern) — not applied as a migration in this tasklist.
- [ ] Update `docs/design/comparison.v1.md` slice 4 and `docs/roadmap.md` Phase 4 to point at the finished design instead of "deferred, needs a schema change and a privacy position."
- [ ] Dated `DECISIONS.md` entry recording the finalized taxonomy, identity model, retention window, and consent position once resolved.

## Acceptance

A follow-up implementation tasklist can build event capture, comparison slice 4, and the first slice of the Phase 4 developer-analytics platform directly against this design, with no open question about what to capture, how anonymous buyers are identified, how long data is kept, or what counts as an activated user or a completed comparison.

## Completion record

_(fill in at completion)_
