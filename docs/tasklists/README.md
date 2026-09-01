# Implementation tasklists

Every implementation plan must have a separate tasklist in this directory before implementation begins. The roadmap is phase-level planning; a tasklist is the executable, reviewable checklist for one bounded piece of work.

## Naming

Use `YYYY-MM-DD-<short-kebab-case-scope>.md`, for example `2026-09-01-phase-1-data-layer.md`. One tasklist may cover a tightly coupled implementation plan; split independent work into separate tasklists.

## Required contents

1. Scope, owner, status, and links to relevant PRD, API, app-flow, design, and schema references.
2. Explicit non-goals and decisions/ambiguities that block work.
3. Ordered checklist: discovery, implementation, tests, documentation, and handoff.
4. Acceptance criteria and exact verification commands/results.
5. Completion record with date, outcome, and follow-up links.

## Lifecycle

- Create the tasklist before code changes.
- Keep it current as tasks complete.
- Update it alongside `PROGRESS.md` at completion.
- If scope, architecture, schema, auth, private-data access, or publishing behavior changes, stop and record/escalate it under the repository rules before continuing.

Retain completed tasklists as project history. Reuse the Phase 1 structure for future work rather than overwriting it.
