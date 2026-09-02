# API specification — v1

**Status:** design-time contract. No product endpoint below is implemented yet, except the Better Auth catch-all route. This file documents planned work, not an existing API.

## Contract rules

- Routes use `/api/v1`; JSON uses camelCase.
- Buyer reads expose published public-catalog data only.
- Exact price, `private` data, source-document secrets, and unreviewed submissions never appear in a buyer response.
- Mutations validate the authenticated role and return no more data than the caller may read.
- The submission publisher is an internal service operation, not a browser-callable direct-write endpoint.
- Errors use `{ "error": { "code": "...", "message": "..." } }`; expected codes include `400`, `401`, `403`, `404`, `409`, and `422`.

## Authentication

| Route                | Status                                    | Purpose                                                                                                                                |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/[...all]` | Plumbing implemented; database unverified | Better Auth handler for buyer phone OTP and staff email/password. SMS is development-only console output until a provider is selected. |

Authentication/session details are owned by Better Auth; product routes use its current session rather than duplicate a user/account model.

## Buyer API

| Method and route                             | Status             | Access                 | Contract                                                                                             |
| -------------------------------------------- | ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/v1/properties`                     | Planned (Phase 2B) | Public                 | Paginated published-property summaries and supported filters; never exact prices.                    |
| `GET /api/v1/properties/{slug}`              | Planned (Phase 2B) | Public                 | Published dossier with units, areas, catalog amenities/specifications, media, and public RERA facts. |
| `POST /api/v1/intake-sessions`               | Planned (Phase 3)  | Anonymous or buyer     | Stores priorities, desired BHK, stated budget range, and city.                                       |
| `POST /api/v1/discovery/matches`             | Planned (Phase 3)  | Buyer/anonymous intake | Returns property and unit-variant IDs matched by bucket; never price or bucket boundaries.           |
| `GET, POST, DELETE /api/v1/saved-properties` | Planned (Phase 3)  | Buyer                  | Lists, saves, or removes the buyer's saved properties.                                               |
| `GET, POST /api/v1/comparisons`              | Planned (Phase 3)  | Buyer                  | Creates/reads comparisons and ordered property/unit items.                                           |
| `POST /api/v1/enquiries`                     | Planned (Phase 3)  | Buyer                  | Creates an enquiry for a property and optional unit variant.                                         |
| `POST /api/v1/dossier-unlocks`               | Planned (Phase 3)  | Buyer                  | Records a phone-OTP-verified dossier unlock.                                                         |

Property details may expose identifiers, property/developer facts, location, RERA fields, unit variants, per-basis areas, dimensions, controlled amenity/specification states, and media. They must not expose `unit_price_history`, price values, price-per-square-foot values, or unreviewed submission/provenance data.

## Admin API

| Method and route                                        | Status             | Access               | Contract                                                                                             |
| ------------------------------------------------------- | ------------------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/submissions`                         | Planned (Phase 2A) | Admin                | Review queue filtered by submission status.                                                          |
| `GET /api/v1/admin/submissions/{id}`                    | Planned (Phase 2A) | Admin                | Submission payload plus field-level evidence/review state.                                           |
| `PATCH /api/v1/admin/submissions/{id}/fields/{fieldId}` | Planned (Phase 2A) | Admin                | Confirm, edit, or reject a proposed field with field-contract validation.                            |
| `POST /api/v1/admin/submissions/{id}/review`            | Planned (Phase 2A) | Admin                | Request changes, reject, or approve; no direct catalog mutation.                                     |
| `POST /api/v1/admin/submissions/{id}/publish`           | Planned (Phase 2A) | Authorized publisher | Executes the transactional live-catalog publish and revision snapshot.                               |
| `POST /api/v1/admin/source-documents`                   | Planned (Phase 2A) | Admin                | Creates an immutable ingestion document and draft OCR submission; it does not start paid extraction. |
| `POST /api/v1/admin/source-documents/{id}/ocr-jobs`     | Planned (Phase 2A) | Admin                | Creates or updates a draft, versioned page-routing manifest for one OCR attempt.                     |
| `POST /api/v1/admin/ocr-jobs/{id}/queue`                | Planned (Phase 2A) | Admin                | Validates complete human-confirmed routing, freezes the manifest, and queues extraction.             |
| `GET /api/v1/admin/ocr-jobs/{id}`                       | Planned (Phase 2A) | Admin                | Returns attempt status, routing, and safe error metadata; provider secrets remain server-only.       |

## Developer API

| Method and route                           | Status            | Access                 | Contract                                                    |
| ------------------------------------------ | ----------------- | ---------------------- | ----------------------------------------------------------- |
| `GET /api/v1/developer/portfolio`          | Planned (Phase 4) | Developer staff        | Returns only linked developer portfolio/analytics.          |
| `POST /api/v1/developer/submissions`       | Planned (Phase 4) | Developer staff        | Creates a draft/submission; it cannot publish.              |
| `PATCH /api/v1/developer/submissions/{id}` | Planned (Phase 4) | Owning developer staff | Updates an eligible draft or responds to requested changes. |

## Contract-change process

Before a consumer starts work against a route, define its request, response, access rules, pagination/filter semantics, and errors here. A breaking change requires a new versioned API-spec file and updates to affected app flows, tasklists, and implementation. Schema changes also follow `AGENTS.md`'s stricter versioning rules.
