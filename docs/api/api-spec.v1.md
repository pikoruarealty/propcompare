# API specification — v1

**Status:** partly implemented. The two buyer read routes (`GET /api/v1/properties` and `GET /api/v1/properties/{slug}`) are implemented as of Phase 2B step 3 (2026-09-02), alongside the Better Auth catch-all route. Everything else below documents planned work, not an existing API; each route's own row states which it is.

## Contract rules

- Routes use `/api/v1`; JSON uses camelCase.
- Buyer reads expose published public-catalog data only.
- Exact price, `private` data, source-document secrets, and unreviewed submissions never appear in a buyer response.
- Mutations validate the authenticated role and return no more data than the caller may read.
- The submission publisher is an internal service operation, not a browser-callable direct-write endpoint.
- Errors use `{ "error": { "code": "...", "message": "..." } }`. `code` is a stable machine-readable slug naming the failure class — never the HTTP status restated — so a client can branch on the cause without parsing prose. `message` is developer-facing prose that names the offending parameter where one exists. Expected HTTP statuses include `400`, `401`, `403`, `404`, `409`, `422`, and `500`. See [Error codes](#error-codes).

## Authentication

| Route                | Status                                    | Purpose                                                                                                                                |
| -------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/[...all]` | Plumbing implemented; database unverified | Better Auth handler for buyer phone OTP and staff email/password. SMS is development-only console output until a provider is selected. |

Authentication/session details are owned by Better Auth; product routes use its current session rather than duplicate a user/account model.

## Buyer API

| Method and route                             | Status                        | Access                 | Contract                                                                                                                  |
| -------------------------------------------- | ----------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/properties`                     | Implemented (Phase 2B step 3) | Public                 | Paginated published-property summaries and supported filters; never exact prices. Full contract below.                    |
| `GET /api/v1/properties/{slug}`              | Implemented (Phase 2B step 3) | Public                 | Published dossier with units, areas, catalog amenities/specifications, media, and public RERA facts. Full contract below. |
| `POST /api/v1/intake-sessions`               | Planned (Phase 3)             | Anonymous or buyer     | Stores priorities, desired BHK, stated budget range, and city.                                                            |
| `POST /api/v1/discovery/matches`             | Planned (Phase 3)             | Buyer/anonymous intake | Returns property and unit-variant IDs matched by bucket; never price or bucket boundaries.                                |
| `GET, POST, DELETE /api/v1/saved-properties` | Planned (Phase 3)             | Buyer                  | Lists, saves, or removes the buyer's saved properties.                                                                    |
| `GET, POST /api/v1/comparisons`              | Planned (Phase 3)             | Buyer                  | Creates/reads comparisons and ordered property/unit items.                                                                |
| `POST /api/v1/enquiries`                     | Planned (Phase 3)             | Buyer                  | Creates an enquiry for a property and optional unit variant.                                                              |
| `POST /api/v1/dossier-unlocks`               | Planned (Phase 3)             | Buyer                  | Records a phone-OTP-verified dossier unlock.                                                                              |

Property details may expose identifiers, property/developer facts, location, RERA fields, unit variants, per-basis areas, dimensions, controlled amenity/specification states, and media. They must not expose `unit_price_history`, price values, price-per-square-foot values, or unreviewed submission/provenance data.

### `GET /api/v1/properties`

Paginated listing of published properties. A property is published by virtue of having a row in `properties` — there is no status column on the live catalog tables, so "published" requires no filter and this route never filters on one. `properties` rows only ever come to exist through the `property_submissions` publish transaction, so every row in the table is, by construction, published.

**Query parameters** (all optional):

| Parameter          | Type                            | Notes                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`             | integer, default `1`            | 1-indexed.                                                                                                                                                                                                                                      |
| `pageSize`         | integer, default `20`, max `50` | Values above 50 are rejected (`422`), not clamped.                                                                                                                                                                                              |
| `city`             | string                          | Exact match against `properties.city`.                                                                                                                                                                                                          |
| `locality`         | string                          | Exact match against `properties.locality`. May be combined with `city`.                                                                                                                                                                         |
| `propertyType`     | string                          | `property_types.key` (e.g. `apartment`). Unknown key returns an empty result set, not an error.                                                                                                                                                 |
| `bhk`              | string                          | `bhk_types.key` (e.g. `2bhk`). Matches a property with at least one `unit_variants` row of that BHK type.                                                                                                                                       |
| `possessionStatus` | string                          | One of the `possession_status` enum values: `under_construction`, `ready_to_move`, `nearing_possession`.                                                                                                                                        |
| `amenity`          | string, repeatable              | `amenity_catalog.key`, e.g. `?amenity=clubhouse&amenity=gym`. Repeating narrows (AND, not OR): a property must have every listed amenity recorded with `status = "available"`. `not_stated` and `explicitly_not_offered` amenities never match. |
| `sort`             | string, default `newest`        | One of `newest` (`properties.createdAt` descending) or `name` (`properties.name` ascending). No relevance/price sort exists in v1 — there is no price to sort by.                                                                               |

An unknown query parameter, or a value that fails validation (e.g. `possessionStatus=foo`, non-numeric `page`), returns `422` with the standard error envelope naming the offending parameter.

**Validation is strict; nothing is silently repaired.** The distinction the route turns on is between an unknown _lookup key_ and a malformed _value_: `propertyType=nonsense` is a valid query with no matches and returns an empty result set, while `possessionStatus=foo` is a broken request and returns `422`. Beyond that:

- Any parameter other than `amenity` given more than once (`?city=a&city=b`) is `422`. `amenity` is the only repeatable parameter; a repeated identical `amenity` collapses to one, since repeating it narrows nothing.
- An empty value (`?city=` or a bare `?city`) is `422`, not treated as absent — "every city" and "the empty-string city" are different requests and neither was intended.
- Integers are matched strictly: `1.5`, `1e2`, `+1`, and a leading space are all `422` rather than coerced.
- `pageSize` above the maximum is `422`, never clamped.

**Response `200`:**

```jsonc
{
  "data": [
    {
      "id": "uuid",
      "slug": "string",
      "name": "string",
      "propertyType": { "key": "apartment", "label": "Apartment" },
      "developer": { "id": "uuid", "name": "string" },
      "city": "string",
      "locality": "string",
      "possessionStatus": "under_construction" | "ready_to_move" | "nearing_possession" | null,
      "possessionDate": "YYYY-MM-DD" | null,
      "reraRegistered": true,
      "bhkTypes": [{ "key": "2bhk", "label": "2 BHK" }], // distinct BHK types across the property's unit variants
      "primaryMedia": { "gcsPath": "string", "mediaType": "photo" } | null
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 }
}
```

`primaryMedia` is the property's card image: the `property_media` row flagged `isPrimary`, falling back to the lowest `displayOrder` when none is flagged, and `null` when the property has no media at all. A property without media has no card image rather than a placeholder.

`bhkTypes` is the distinct set of BHK types across the property's unit variants, so a property with three 2 BHK variants lists `2bhk` once.

No summary object contains a price, price-per-square-foot, or bucket value, at any nesting level.

### `GET /api/v1/properties/{slug}`

Full published dossier for one property, resolved by `properties.slug`.

**Response `200`** — a `PropertyDossier`:

```jsonc
{
  "id": "uuid",
  "slug": "string",
  "name": "string",
  "description": "string" | null,
  "propertyType": { "key": "apartment", "label": "Apartment" },
  "developer": {
    "id": "uuid",
    "name": "string",
    "description": "string" | null,
    "logoGcsPath": "string" | null,
    "website": "string" | null
  },
  "location": {
    "city": "string",
    "locality": "string",
    "latitude": "string" | null,
    "longitude": "string" | null,
    "pincode": "string" | null
  },
  "possession": {
    "status": "under_construction" | "ready_to_move" | "nearing_possession" | null,
    "possessionDate": "YYYY-MM-DD" | null,
    "launchDate": "YYYY-MM-DD" | null
  },
  "rera": {
    "registered": true,
    "registrationNumber": "string" | null,
    "lastVerifiedAt": "ISO-8601" | null,
    "projectLandAreaSqft": "string" | null,
    "carpetAreaRangeMinSqft": "string" | null,
    "carpetAreaRangeMaxSqft": "string" | null,
    "constructionProgressPercent": "string" | null
  },
  "totalTowers": 0 | null,
  "totalUnits": 0 | null,
  "unitVariants": [
    {
      "id": "uuid",
      "variantName": "string",
      "bhkType": { "key": "2bhk", "label": "2 BHK" } | null,
      "layoutType": { "key": "string", "label": "string" } | null,
      "totalUnitsOfVariant": 0 | null,
      "dimensions": { /* opaque jsonb, room-name -> dimension facts */ } | null,
      "areas": [{ "basis": "carpet" | "super_built_up" | "built_up", "areaSqft": "string" }]
    }
  ],
  "amenities": [
    { "key": "string", "label": "string", "category": "string", "status": "available" | "not_stated" | "explicitly_not_offered" }
  ],
  "specifications": [
    { "key": "string", "label": "string", "category": "string", "valueText": "string" | null, "status": "available" | "not_stated" | "explicitly_not_offered" }
  ],
  "media": [
    { "id": "uuid", "mediaType": "photo" | "floor_plan" | "video" | "brochure_pdf", "gcsPath": "string", "caption": "string" | null, "unitVariantId": "uuid" | null, "isPrimary": true }
  ]
}
```

Ordering: `unitVariants` and `media` are returned ordered by their existing `display_order`/creation order in the schema (`property_media.displayOrder`; `unit_variants` by `createdAt`). `amenities` and `specifications` include every catalog row associated with the property regardless of `status` — the honest-incompleteness states (`not_stated`, `explicitly_not_offered`) are data for the client to render explicitly, never filtered out.

A property with no media, no RERA registration, or unit variants missing one or more area bases returns those as empty arrays / `null` fields — never a fabricated value and never an omitted key.

The slug route takes no query parameters; any it receives are ignored rather than rejected. The `422` contract belongs to the listing route alone.

### Error codes

Both buyer routes return the standard envelope, `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code`                    | Condition                                                                                                        |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `404`  | `property_not_found`      | No `properties` row matches the given slug.                                                                      |
| `422`  | `unknown_query_parameter` | A query parameter the route does not define. `message` names it.                                                 |
| `422`  | `invalid_query_parameter` | A defined parameter whose value fails validation, or a non-repeatable parameter given twice. `message` names it. |
| `500`  | `internal_error`          | An unexpected server failure. `message` is deliberately generic; detail is logged server-side, never returned.   |

### Caching

Both routes are request-time handlers; neither exports a Next.js route segment config, and neither is prerendered. Cache policy is expressed as HTTP `Cache-Control` for a shared cache (CDN or reverse proxy) to honour — the directives are shared-cache only, with no browser `max-age`, so a buyer changing a filter is never served a response their own browser is holding.

| Response                     | `Cache-Control`                                     |
| ---------------------------- | --------------------------------------------------- |
| `200` from the listing route | `public, s-maxage=60, stale-while-revalidate=300`   |
| `200` from the dossier route | `public, s-maxage=300, stale-while-revalidate=3600` |
| Any error response           | `no-store`                                          |

Errors are never cached so that a `404` cannot outlive the publish that resolves it. Page-level ISR for the buyer-facing property page is a separate decision, taken with that page rather than with this API. See the 2026-09-02 entry in `DECISIONS.md`.

**Exclusion list (normative, applies to both routes):** no response body, at any nesting level, may contain `unit_price_history` data, a price, a price-per-square-foot value, a private budget bucket, submission/review status, provenance or evidence records, or OCR confidence. These live exclusively in the `private` schema and the submission-review tables, which the buyer read layer does not query.

This is enforced in running code, not by convention: every successful buyer response is scanned by `src/lib/properties/no-price.ts` immediately before serialisation, and a body carrying an excluded key fails the request with `500` rather than being served with the key stripped. A leak is a defect to fix at its source, and silently filtering it would hide the defect while the next response reintroduced it.

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
