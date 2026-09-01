# Agent & contributor conventions

This file is the shared contract for everyone writing code in this repo — the human maintainer, Claude Code, and Codex. Read this before writing code, not after. Its purpose is to prevent the exact failure that ended the prior attempt at this product: a second contributor's work silently diverging into a second version of the same entity/schema. See [DECISIONS.md](DECISIONS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning behind these rules.

## The one rule that overrides everything else

**There is exactly one live representation of each entity.** Before adding a table, column, or parallel data path, check `docs/schema/schema.v1.md` (or its latest version) for whether it already exists in a different shape. If a change to the canonical schema is genuinely needed, it's a new dated entry in `DECISIONS.md` plus an update to the schema doc (bump to `schema.v2.md` if the change is structural — never silently edit `schema.v1.md`'s content after it's been implemented against) — not a second table, not a "temporary" bridge, not a mirror.

**No code path other than the `property_submissions` publish transaction writes to live catalog tables** (`properties`, `unit_variants`, `unit_areas`, `property_amenities`, `property_specifications`, `property_media`). This includes migrations, seed scripts, and one-off admin fixes. If you find yourself writing a script that needs to change live property data, it must construct a `property_submissions` row and go through approval — or the task needs to be redefined.

## Before starting work

1. Read `PROGRESS.md` for current state and `DECISIONS.md` for anything that might affect your task.
2. If your task touches the schema, check `docs/schema/schema.v1.md` first — don't invent a parallel structure for something that already has a home.
3. If a requirement is ambiguous, stop and surface the ambiguity rather than guessing — this is a standing rule for this project, not just a suggestion (see the "no assumptions" working agreement).

## While working

- Before implementation begins, create a separate scoped tasklist in `docs/tasklists/` and link it to relevant PRD, API specification, app-flow, design, and schema references. Mark verification and documentation work complete there before handoff; keep completed tasklists as history.
- Update `PROGRESS.md` as part of finishing a task, not as an afterthought.
- Any decision that would be expensive to silently reverse (infra, schema shape, a scope cut) gets a dated entry in `DECISIONS.md` when made — not reconstructed later from memory or git log.
- Money is always `numeric`, never `float`. Exact prices never leave the `private` schema or the single service-role matching path that reads it (see `ARCHITECTURE.md`).
- Controlled vocabularies (amenities, specifications) go through their catalog + synonym tables — no free-text amenity/spec fields.
- Missing data is `not_stated` or `explicitly_not_offered`, never fabricated or left ambiguously blank.
- `--color-verified-gold` (Soft Gold) is reserved strictly for Verified/trust badges — never used decoratively. See `docs/design/design-tokens.md`.

## Commits & branches

- Create a short-lived `task/<short-scope>` branch for each task. Merge completed task branches into `main` at the agreed phase boundary; push the resulting phase baseline to `origin/main` only after its tasklists and verification are complete.
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
