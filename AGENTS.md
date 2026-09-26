# Agent & contributor conventions

This file is the shared contract for everyone writing code in this repo — the human maintainer, Claude Code, and Codex. Read this before writing code, not after. Its purpose is to prevent the exact failure that ended the prior attempt at this product: a second contributor's work silently diverging into a second version of the same entity/schema. See [DECISIONS.md](DECISIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning behind these rules.

## The product is comparison

**PropCompare is not a property listing site. Its reason to exist is helping a buyer compare properties, side by side, better than anything else available.** Every other buyer surface (browse, dossier, intake, saves) exists to get a buyer into a good comparison and out of it with a decision. The strict data rules below (one live representation of each entity, controlled vocabularies, exact units, explicit "not stated", RERA cross-checks, reviewed publishing) are there so that two properties can be compared row for row and every row means the same thing on both sides.

When choosing what to build next, comparison comes first. A change that makes data less consistent, or that adds a buyer feature while comparison is missing or weak, is the wrong trade. The comparison experience is specified in [docs/design/comparison.v1.md](docs/design/comparison.v1.md): like for like (unit type against unit type), differences first, an honest "what changes if you choose A over B", visible gaps and provenance, no price, no score or winner. Read it before touching the buyer surface.

**Comparison depth is gated behind sign-in (owner direction, 2026-09-22 — reverses the earlier "no sign-in to compare" rule; see `DECISIONS.md`).** A comparison's column identity (photo, name, locality, developer, the chosen unit type) is open to everyone; its differences-first summary and the detailed row groups render locked until the buyer signs in with their phone number (the summary was open until 2026-09-25). The property dossier follows the same rule (2026-09-24, narrowed 2026-09-25): only its top is open (name, type, developer's name, locality and city, description, possession, towers and units, the RERA registration badge, the unit types' names and BHK, and the first few photographs). Everything below the configurations (unit-type measurements, amenities, specifications, location detail, the RERA record, developer detail, floor plans and the other photographs) is withheld by the server from a signed-out visitor, on the page and in `GET /api/v1/properties/{slug}`, and drawn as an animated placeholder. Guided intake is the site's front door, not a nav item — it leads straight into matched properties a buyer can open or add to a comparison directly.

## The one rule that overrides everything else

**There is exactly one live representation of each entity.** Before adding a table, column, or parallel data path, check `docs/schema/schema.v1.md` (or its latest version) for whether it already exists in a different shape. If a change to the canonical schema is genuinely needed, it's a new dated entry in `DECISIONS.md` plus an update to the schema doc (bump to `schema.v2.md` if the change is structural — never silently edit `schema.v1.md`'s content after it's been implemented against) — not a second table, not a "temporary" bridge, not a mirror.

**No code path other than the `property_submissions` publish transaction writes to live catalog tables** (`properties`, `unit_variants`, `unit_areas`, `property_amenities`, `unit_variant_amenities`, `property_specifications`, `property_media`). This includes migrations, seed scripts, and one-off admin fixes. If you find yourself writing a script that needs to change live property data, it must construct a `property_submissions` row and go through approval — or the task needs to be redefined.

## Before starting work

1. Read `PROGRESS.md` for current state and `DECISIONS.md` for anything that might affect your task.
2. If your task touches the schema, check `docs/schema/schema.v1.md` first — don't invent a parallel structure for something that already has a home.
3. If a requirement is ambiguous, stop and surface the ambiguity rather than guessing — this is a standing rule for this project, not just a suggestion (see the "no assumptions" working agreement).

## While working

- Before implementation begins, create a separate scoped tasklist in `docs/tasklists/` and link it to relevant PRD, API specification, app-flow, design, and schema references. Mark verification and documentation work complete there before handoff; keep completed tasklists as history.
- Update `PROGRESS.md` as part of finishing a task, not as an afterthought.
- Any decision that would be expensive to silently reverse (infra, schema shape, a scope cut) gets a dated entry in `DECISIONS.md` when made — not reconstructed later from memory or git log.
- Money is always `numeric`, never `float`. Exact prices never leave the `private` schema. Exactly two code paths may use the service-role connection: the budget matcher (`src/lib/matching/`) and the pricing module (`src/lib/pricing/`), which stages an admin's typed unit-type prices, applies them after publish, and keeps RERA's project price range. Prices are never shown to a buyer; a buyer-facing price bracket would be a separate owner decision (see `ARCHITECTURE.md`, `DECISIONS.md` 2026-09-24 "price data").
- Analytics has two readers and they never meet. Raw events (`analytics_events` and the monthly tables) are read only by the admin console, the recorder and the two jobs (`analytics:purge`, `analytics:release`). A developer sees only the thresholded aggregates the release job writes to the `developer_analytics_*` tables (schema v21, v23, v24), through the read-only `propcompare_developer_reader` connection (`src/db/developer-reader.ts`), which only `src/lib/developers/analytics/`, `src/app/api/v1/developer/` and `src/app/developers/` may import. A developer's id comes from their session, never from a request. A new figure is a released metric with its gate (5 distinct identified visitors), not a new query on raw events. `src/lib/analytics/analytics-isolation.test.ts` enforces this; do not loosen it to make a change fit.
- Controlled vocabularies (amenities, specifications) go through their catalog + synonym tables — no free-text amenity/spec fields.
- Anything that changes what personal data is collected, stored, shown to a developer or set in a browser (a new cookie, a stored field, a third-party script, a new recipient, a retention rule) updates `docs/product/privacy-policy-inputs.md` in the same change. The privacy policy is drafted from that file, so a fact missing there is missing from the policy.
- Missing data is `not_stated` or `explicitly_not_offered`, never fabricated or left ambiguously blank.
- The buyer UI follows [docs/design/no-vibecoded-tells.v1.md](docs/design/no-vibecoded-tells.v1.md): the 30 generic-template tells to avoid, and the "printed dossier" language that replaces them (no shadows, decorative icons, feature-card rows, stripes, em dashes; 8px radius; type, photographs, rules and real data as the decoration). A test enforces the mechanical ones.
- `--color-verified-gold` (Soft Gold) is reserved strictly for Verified/trust badges — never used decoratively. See `docs/design/design-tokens.md`.

## Commits & branches

- Create one short-lived `task/<phase>` branch per agreed phase — not one per step within it — and commit each step to that branch as it completes. Merge the branch into `main` at the phase boundary; push the resulting phase baseline to `origin/main` only after its tasklists and verification are complete. (Phase 2B initially took a branch per step; they were collapsed into `task/phase-2b` on 2026-09-02. See `DECISIONS.md`.)
- Commit messages describe _why_, not just _what_ — the diff already shows what changed.
- Never add Claude Code (or any AI agent) as a co-author/trailer on commits.
- Don't amend or force-push shared history.
- If you (an AI agent) are uncertain whether a change is safe to make autonomously — schema changes, anything touching the `private` schema, anything that changes the publish-transaction logic — surface it for review rather than proceeding.

## Coordination between agents

Both Claude Code and Codex read this same file and the same `docs/` tree — there is no private, agent-specific context that the other can't see. If you make an architectural decision, write it down here or in `DECISIONS.md` so the other agent (or the human) doesn't redo or contradict it in a parallel session.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
