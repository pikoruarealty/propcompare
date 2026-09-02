# PropCompare

A property comparison platform for Ahmedabad/Gujarat: buyers browse and compare specific unit variants (area, dimensions, amenities, specs, developer track record, RERA facts, possession timing) side by side, backed by developer-submitted and OCR-extracted brochure data that's reviewed and approved before it ever goes live.

This is a from-scratch rebuild — see [DECISIONS.md](DECISIONS.md) for why, and what's being carried forward vs. deliberately avoided from the prior attempt.

## Start here

- [ARCHITECTURE.md](ARCHITECTURE.md) — system shape, the three surfaces (buyer / developer / admin), the trust boundary, ingestion flow, budget bucketing.
- [DECISIONS.md](DECISIONS.md) — dated record of every decision worth not silently reversing.
- [PROGRESS.md](PROGRESS.md) — running log of what's done and what's next.
- [AGENTS.md](AGENTS.md) — conventions for anyone (human or AI) writing code here.
- [docs/schema/schema.v4.md](docs/schema/schema.v4.md) — the active database schema.
- [docs/design/design-tokens.md](docs/design/design-tokens.md) — the "Soft Daylight" design system.
- [docs/roadmap.md](docs/roadmap.md) — phase-by-phase build plan and ownership.

- [docs/README.md](docs/README.md) — product requirements, API contract, role-specific app flows, design guidance, and implementation tasklists.

## Stack

Next.js (App Router) · Drizzle ORM · self-hosted PostgreSQL · Better Auth · Google Cloud Storage

## Status

**Current (2026-09-01):** Phase 0 scaffolding is complete; Phase 1 data-layer implementation is next. See [PROGRESS.md](PROGRESS.md) for current state and [the Phase 1 tasklist](docs/tasklists/2026-09-01-phase-1-data-layer.md) for the executable plan.

### Earlier scaffold note

Pre-code — schema and design system finalized, project scaffolding not yet started. See [PROGRESS.md](PROGRESS.md) for the current state in detail.
