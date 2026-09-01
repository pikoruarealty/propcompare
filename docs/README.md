# Documentation map

This directory holds the collaborative product and implementation reference for PropCompare. Root-level `AGENTS.md`, `ARCHITECTURE.md`, `DECISIONS.md`, and `PROGRESS.md` remain at the repository root because they are the project-wide governance, decision log, and running journal.

## Product and experience

- [Product requirements](product/prd.v1.md) — v1 problem, users, scope, requirements, and success criteria.
- [App flows](app-flows/) — journeys and permissions for buyer, developer, and admin roles.
- [Design guide](design/design.v1.md) — design-system application, surfaces, components, and screen guidance.
- [Design tokens](design/design-tokens.md) — canonical visual tokens.

## Technical delivery

- [API specification](api/api-spec.v1.md) — versioned client/server contract; each endpoint has an explicit implementation status.
- [Schema](schema/schema.v1.md) — canonical data model.
- [Roadmap](roadmap.md) — phase-level delivery plan and ownership.
- [Tasklists](tasklists/) — a separate tasklist is required for every implementation plan.
- [Data audits](data/) — versioned, review-only analysis of approved external source shapes; raw source data stays outside the repository.

## Document status

Documents labelled `v1` are living planning documents until their corresponding feature is implemented. A completed implementation must update its tasklist and `PROGRESS.md`; an expensive-to-reverse decision must also be recorded in `DECISIONS.md`.
