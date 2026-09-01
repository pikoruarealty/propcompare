# Architecture

High-level system shape. For _why_ each choice was made, see [DECISIONS.md](DECISIONS.md). For the exact schema, see [docs/schema/schema.v1.md](docs/schema/schema.v1.md). For visual language, see [docs/design/design-tokens.md](docs/design/design-tokens.md).

## Stack

- **Frontend:** Next.js (App Router), Tailwind, shadcn/Radix primitives styled to the "Soft Daylight" design system.
- **ORM / DB:** Drizzle ORM against self-hosted PostgreSQL (own VM/Docker — not a managed DB provider).
- **Auth:** Better Auth (phone-OTP for buyers, email/password or SSO for developer/admin staff — TBD at implementation time).
- **Media storage:** Google Cloud Storage (brochures, photos, floor plans).
- **OCR pipeline:** targets a predefined, versioned field schema (`property_schema_fields` table) — extracts only listed fields, discards the rest at ingestion time.

## Three surfaces, one database

```
┌─────────────────┐   ┌──────────────────────┐   ┌───────────────────────────┐
│   Buyer app      │   │  Developer portal     │   │  Admin/verification portal│
│  (public schema  │   │  (submit + view own   │   │  (review, approve, OCR    │
│   read-only view │   │   portfolio analytics)│   │   reconciliation, RERA    │
│   of published   │   │                       │   │   fact-check)             │
│   data only)     │   │                       │   │                           │
└────────┬─────────┘   └──────────┬────────────┘   └──────────────┬────────────┘
         │                        │                                │
         │                        ▼                                ▼
         │              ┌──────────────────────────────────────────────┐
         │              │  property_submissions (draft → submitted →   │
         │              │  in_review → approved → published)            │
         │              │  + property_submission_fields (provenance)    │
         │              └───────────────────┬────────────────────────────┘
         │                                  │ publish transaction
         │                                  │ (the ONLY write path)
         ▼                                  ▼
┌────────────────────────────────────────────────────────────┐
│  public schema — live catalog                               │
│  properties, unit_variants, unit_areas, property_amenities,  │
│  property_specifications, property_media, property_revisions │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  private schema — RLS on, zero policies, service-role only   │
│  unit_price_history, unit_current_bucket (view)               │
│  read only by: the discovery/comparison matching service      │
└────────────────────────────────────────────────────────────┘
```

## The trust boundary (non-negotiable)

Every write to the live catalog goes through exactly one path: a `property_submissions` row moves to `status = published`, and in the same transaction (a) the payload is applied to `properties`/`unit_variants`/etc., and (b) a `property_revisions` snapshot is written. This is true whether the submission originated from a developer form, an admin-run OCR job, or a RERA cross-check mismatch — all three produce a `property_submissions` row and go through the same approval gate.

**No other code path — no migration, no seed script, no admin "quick fix," no future contributor's shortcut — writes to the live catalog tables directly.** This is the schema-level fix for the exact failure that ended the prior attempt at this product: a backfill script called a "publish" function directly and bypassed review/approval entirely. See [DECISIONS.md](DECISIONS.md) and `AGENTS.md` for how this is enforced for human and AI contributors alike.

## Ingestion flow (brochure → live data)

1. A brochure PDF is uploaded → `source_documents` row (`ocr_status = pending`).
2. OCR pipeline extracts values for every active row in `property_schema_fields` only; everything else in the document is discarded, not stored.
3. Each extracted value becomes a `property_submission_fields` row: value, OCR confidence, source page, quoted snippet, tied to a new/existing `property_submissions` row.
4. Admin reviews in the Data Reconciliation UI (field, extracted value, confidence, source page side-by-side) — confirms or edits each field.
5. On admin approval, the submission publishes via the one write path above.
6. Independently, `rera_fetch_jobs` periodically cross-checks GujRERA against the published property; a mismatch produces a new `property_submissions` row (`source = rera_scrape`) — RERA never overwrites live data directly.

## Budget bucketing (never expose exact price)

`private.unit_price_history` holds exact prices with full history (source: developer submission, admin manual entry, or RERA extract), in the `private` schema — RLS enabled, zero policies, so only a service-role connection can read it at all. A derived view, `private.unit_current_bucket`, maps each unit variant to a `budget_buckets` row. The discovery/comparison matching service is the only code path with a service-role connection into `private`; it matches a buyer's stated budget range to bucket ± one adjacent bucket and returns property/unit-variant ids — never a price. The property detail page shows no price at all by default, until enquiry.

## Multi-agent development

This codebase is written by a human plus two AI coding agents (Claude Code, Codex) working in parallel. `AGENTS.md` is the shared contract both agents follow — schema changes, conventions, and the one-write-path rule are documented there so no agent silently diverges into a second version of any entity, which is exactly how the prior attempt's second contributor problem happened.
