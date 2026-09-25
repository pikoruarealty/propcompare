# API specification — v1

**Status:** mostly implemented. The two buyer read routes (`GET /api/v1/properties` and `GET /api/v1/properties/{slug}`) are implemented as of Phase 2B step 3 (2026-09-02). `POST /api/v1/discovery/matches`, `GET/POST/DELETE /api/v1/saved-properties`, `GET/POST /api/v1/comparisons`, `POST /api/v1/enquiries`, and `POST /api/v1/dossier-unlocks` are implemented as of Phase 3 (2026-09-18), alongside the Better Auth catch-all route. Only `POST /api/v1/intake-sessions` remains unbuilt this phase; its own row explains why.

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

| Method and route                                                   | Status                                                                  | Access                        | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/properties`                                           | Implemented (Phase 2B step 3)                                           | Public                        | Paginated published-property summaries and supported filters; never exact prices. Full contract below.                                                                                                                                                                                                                                                                                                                                                                                            |
| `GET /api/v1/properties/{slug}`                                    | Implemented (Phase 2B step 3; locked for signed-out callers 2026-09-24) | Public, full detail signed in | Published dossier with units, areas, catalog amenities/specifications, media, and public RERA facts; a caller with no session receives the locked dossier (see below). Full contract below.                                                                                                                                                                                                                                                                                                       |
| `GET /api/v1/media/{id}`                                           | Implemented (2026-09-18)                                                | Public                        | Redirects to a freshly-generated signed read URL for a `property_media` object. Full contract below.                                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /api/v1/intake-sessions`                                     | Planned                                                                 | Anonymous or buyer            | Not built by Phase 3. Pre-login intake capture instead goes through a short-lived cookie, claimed into `buyer_intake_sessions` at login; see `DECISIONS.md` (2026-09-18) and `docs/tasklists/2026-09-18-pre-login-intake-cookie.md`.                                                                                                                                                                                                                                                              |
| `POST /api/v1/discovery/matches`                                   | Implemented (Phase 3, 2026-09-18)                                       | Buyer/anonymous intake        | Stateless: the buyer's stated budget range travels in the request body only, nothing is persisted. Returns published property summaries whose current price falls in the inclusive ±20% range; never price, bounds, or bucket values. Full contract below.                                                                                                                                                                                                                                        |
| `GET, POST, DELETE /api/v1/saved-properties`                       | Implemented (Phase 3, 2026-09-18)                                       | Buyer                         | Lists, saves, or removes the buyer's saved properties. Full contract below.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `GET, POST /api/v1/comparisons`, `DELETE /api/v1/comparisons/{id}` | Implemented (Phase 3, 2026-09-18; `DELETE` 2026-09-24)                  | Buyer                         | Creates/reads/removes comparisons and ordered property/unit items. Full contract below.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /api/v1/enquiries`                                           | Implemented (Phase 3, 2026-09-18)                                       | Buyer                         | Creates an enquiry for a property and optional unit variant. Full contract below.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `POST /api/v1/events`                                              | Implemented (2026-09-25, schema v20)                                    | Anyone                        | First-party analytics. Body `{ event, slug?, slugs?, engagedMs?, detail?, band?, utm?, referrer? }`, checked per event by `readEventInput` (`src/lib/analytics/events.ts`); anything that does not fit is dropped. Always `204`, never an error. Sets `pc_vid` (random visitor id, 395 days) and `pc_sid` (visit, 30 minutes rolling), both `HttpOnly`, `SameSite=Lax`. Records nothing for a crawler or a browser sending `Sec-GPC: 1` or `DNT: 1`. No user id, IP or personal detail is stored. |
| `POST /api/v1/dossier-unlocks`                                     | Implemented (Phase 3, 2026-09-18)                                       | Buyer, phone-verified         | Records a phone-OTP-verified dossier unlock. Full contract below.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

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

Published dossier for one property, resolved by `properties.slug`.

**Who gets what (2026-09-24, `DECISIONS.md`).** A caller with a session receives the full dossier. A caller with none receives the locked dossier (`lockDossier`): identity, possession, RERA, specifications, location and developer as usual; each unit variant with its `variantName` and `bhkType` only (`areas` and `amenities` empty; `layoutType`, `totalUnitsOfVariant`, `unitsPerFloor` and `dimensions` null); `amenities` empty; `media` reduced to at most three photographs (the primary first) with no floor plan, video or brochure; and a `lock` object `{ hiddenPhotos, hiddenFloorPlans, amenityCatalog: [{ label, category }] }` saying what was withheld. `lock` is absent from the full dossier. The response is `Cache-Control: private, no-store` either way, because the body depends on the caller.

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
    "constructionProgressPercent": "string" | null,
    "lastCheckedAt": "ISO-8601" | null,
    "sourcedFacts": ["registration_number" | "construction_progress" | "possession_date" | "total_units"]
  },
  "totalTowers": 0 | null,
  "totalFloors": 0 | null,
  "totalUnits": 0 | null,
  "unitVariants": [
    {
      "id": "uuid",
      "variantName": "string",
      "bhkType": { "key": "2bhk", "label": "2 BHK" } | null,
      "layoutType": { "key": "string", "label": "string" } | null,
      "totalUnitsOfVariant": 0 | null,
      "dimensions": { /* opaque jsonb, room-name -> dimension facts */ } | null,
      "areas": [{ "basis": "carpet" | "super_built_up" | "built_up", "areaSqft": "string" }],
      "amenities": [{ "key": "string", "label": "string", "category": "string", "status": "available" | "explicitly_not_offered" }]
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

A unit variant's `amenities` are its own, apart from the project's `amenities` below (2026-09-25, `DECISIONS.md`): only stated rows are returned (`available` or `explicitly_not_offered`); an amenity with no entry is not stated.

Ordering: `unitVariants` and `media` are returned ordered by their existing `display_order`/creation order in the schema (`property_media.displayOrder`; `unit_variants` by `createdAt`). `amenities` and `specifications` include every catalog row associated with the property regardless of `status` — the honest-incompleteness states (`not_stated`, `explicitly_not_offered`) are data for the client to render explicitly, never filtered out.

`rera.lastCheckedAt` is when the regulator's record was last read successfully (null if never), and `rera.sourcedFacts` lists which published facts that record stated exactly as published; only those may be credited to the regulator ("Source: GujRERA, checked on …"). A value from a brochure, or one that differs from RERA's, or a derived one such as possession status, is never listed. A property with no media, no RERA registration, or unit variants missing one or more area bases returns those as empty arrays / `null` fields — never a fabricated value and never an omitted key.

The slug route takes no query parameters; any it receives are ignored rather than rejected. The `422` contract belongs to the listing route alone.

### `GET /api/v1/media/{id}`

Redirects (`302`) to a freshly-generated signed read URL for one `property_media` row's stored object. `404` with `media_not_found` when no row matches the id, or when the storage adapter reports the underlying object no longer exists. Never cached (`Cache-Control: no-store`) — a fresh signed URL is generated on every request rather than reused, which costs no extra network round trip (signing is computed locally from the service account key). See the 2026-09-18 `DECISIONS.md` entry for why this exists as a redirect route rather than a URL baked into the dossier page's ISR-cached HTML: a signed URL expires, and that page does not re-render on every request.

**`?size=thumb`** answers `200` with the picture's thumbnail instead of a redirect: a 480 px WebP of a photo or floor plan (proportions kept, never cropped or enlarged), made on first request and stored beside the original, served with `Cache-Control: public, max-age=31536000, immutable`. If a thumbnail cannot be made it falls back to the `302` for the full picture; a video or PDF is always the `302`. Any other `size` value is `422 invalid_query_parameter`. Only pictures of **listed** properties, and not of removed unit types, are served; anything else is `404 media_not_found`.

### `POST /api/v1/discovery/matches`

Published property summaries whose current unit price falls in the buyer's inclusive `[minInr × 0.80, upperBound]` range — the ±20% expansion decided 2026-09-01 — optionally narrowed by `city` and `bhk`, the two filters guided intake collects today. Stateless: nothing about the request is persisted anywhere (2026-09-18 `DECISIONS.md` entry). See `docs/tasklists/2026-09-18-discovery-matches-endpoint.md` and `docs/tasklists/2026-09-01-phase-3-budget-range-matching.md`.

A property with no admin-entered price on any of its unit types falls back to the price range its regulator states for the project (schema v16): all its unit types match when that range overlaps the band; a property with any admin price is matched on unit prices only (`DECISIONS.md` 2026-09-24, "price data").

`upperBound` is `maxInr × 1.20` for a stated max, or, when the buyer has no upper limit, the catalog's current maximum current price — resolved entirely inside Postgres and never returned, logged, or otherwise exposed (2026-09-18 `DECISIONS.md` entry). This is a derived commercial value like any bound or bucket, so `matchPropertiesByBudgetRange` never holds it as a JavaScript value that could leak; the SQL `WHERE` clause resolves and consumes it in one query.

**Request body:**

```jsonc
{
  "minInr": 3000000, // required, finite positive number
  "maxInr": 4000000, // required unless maxUnbounded is true; finite positive number, >= minInr
  "maxUnbounded": true, // optional, default false; mutually exclusive with maxInr
  "city": "string", // optional, non-empty
  "bhk": "2bhk", // optional, non-empty, a bhk_types.key
  "page": 1, // optional, default 1
  "pageSize": 20, // optional, default 20, max 50
}
```

`maxInr` and `maxUnbounded: true` are mutually exclusive, and exactly one is required — giving both, or omitting `maxInr` without `maxUnbounded: true`, is rejected rather than silently treated as unbounded, so a caller who simply forgot the field gets a clear error instead of an unintentionally wide search. An unknown body field, a non-numeric `minInr`/`maxInr`, a non-positive or non-finite value, a non-boolean `maxUnbounded`, `minInr > maxInr`, an empty `city`/`bhk`, or an out-of-range `page`/`pageSize` all return `422` with `invalid_request_body` and a message naming the offending field. Malformed JSON also returns `422` with the same code.

**Response `200`:** the same `{ "data": [...], "pagination": {...} }` shape as `GET /api/v1/properties` (see above) — a `PropertySummary` array. No price, bound, or bucket value appears at any nesting level. When no published unit falls in range, `data` is an honest empty array with `total: 0` rather than a fabricated result (`docs/app-flows/buyer.md`'s "No matching inventory" exception path).

This route is never cached (`Cache-Control: no-store`) — the buyer's stated range is per-request input, not a cacheable resource.

### Buyer-account routes: session and caching

The four routes below (`saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks`) all require a session — `401` with `unauthenticated` when absent. The session is read with `auth.api.getSession({ headers, query: { disableCookieCache: true } })` (`src/lib/buyer/session.ts`), bypassing Better Auth's cookie-cache optimization so a revoked session cannot still authorize a write. Every query is scoped by the session's own `userId`, never a caller-supplied one — there is no way for one buyer to read or act on another's saved properties, comparisons, or enquiries. None of the four is ever cached (`Cache-Control: no-store`), since every response is scoped to the caller's identity. See `docs/tasklists/2026-09-18-buyer-account-routes.md`.

### `GET, POST, DELETE /api/v1/saved-properties`

A buyer's saved properties.

**`GET`** — paginated, newest-saved first. Query parameters: `page` (default `1`) and `pageSize` (default `20`, max `50`), validated the same way as the listing route's own (`422` `invalid_query_parameter`/`unknown_query_parameter` on a bad or unrecognized one). Response `200`:

```jsonc
{
  "data": [
    {
      "savedAt": "ISO-8601",
      "property": {/* PropertySummary, see GET /api/v1/properties */},
    },
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 },
}
```

**`POST`** — body `{ "propertyId": "uuid" }`. `404` `property_not_found` if the id doesn't resolve to a published property. Idempotent: saving an already-saved property returns the existing row's `savedAt` rather than refreshing it or erroring. Response `200`: one entry in the same shape as a `GET` row.

**`DELETE`** — body `{ "propertyId": "uuid" }`. `404` `saved_property_not_found` if that property isn't currently saved by the caller — never a silent no-op, and never `403`, which would confirm whether some other buyer has it saved. Response `204`, no body.

### `GET, POST /api/v1/comparisons`, `DELETE /api/v1/comparisons/{id}`

A buyer's comparisons and their ordered property/unit items. Saving the same comparison again (the same properties and unit types, in any order) returns the one already saved rather than a duplicate (2026-09-21). Created once with its full item list and removed whole — no `PATCH`/item-mutation route.

**`POST`** — body:

```jsonc
{ "items": [{ "propertyId": "uuid", "unitVariantId": "uuid" /* optional */ }, ...] }
```

`items` must be a non-empty array of at most 10 entries. `displayOrder` is assigned from array position. `404` `property_not_found` if any `propertyId` isn't published; `404` `unit_variant_not_found` if a given `unitVariantId` doesn't exist or doesn't belong to that entry's `propertyId`. Response `200`:

```jsonc
{
  "id": "uuid",
  "createdAt": "ISO-8601",
  "items": [
    {
      "propertyId": "uuid",
      "unitVariantId": "uuid" | null,
      "displayOrder": 0,
      "property": { /* PropertySummary */ }
    }
  ]
}
```

**`GET`** — every comparison the caller owns, oldest first, each in the same shape as `POST`'s response. Response `200`: `{ "data": [...] }`. Not paginated — the api-spec deliberately keeps this unbounded rather than inventing a page size nothing has asked for; revisit if a buyer's comparison count ever makes that wrong.

**`DELETE /api/v1/comparisons/{id}`** (2026-09-24) — unsaves one of the caller's comparisons; its items go with it. `404` `comparison_not_found` if the id is unknown, malformed, or belongs to another buyer — never `403`, which would confirm it exists. Response `204`, no body. `/compare` uses `GET` to recognise an already-saved comparison and this route to unsave it.

### `POST /api/v1/enquiries`

Creates an enquiry for a property and an optional unit variant. Body:

```jsonc
{ "propertyId": "uuid", "unitVariantId": "uuid", "message": "string" } // unitVariantId and message optional
```

`404` `property_not_found` / `unit_variant_not_found` on the same terms as `comparisons`. Always created with `status: "new"` — the body cannot set status; only admin/developer review transitions it later, outside this route. Response `200`:

```jsonc
{
  "id": "uuid",
  "propertyId": "uuid",
  "unitVariantId": "uuid" | null,
  "status": "new" | "contacted" | "closed",
  "message": "string" | null,
  "createdAt": "ISO-8601"
}
```

### `POST /api/v1/dossier-unlocks`

Records a phone-OTP-verified dossier unlock. Does not itself perform OTP verification — Better Auth's `phoneNumber` plugin (`/api/auth/[...all]`) owns sending/verifying the code and setting the session's `phoneNumberVerified`; the client verifies via that flow first, then calls this route. Body:

```jsonc
{ "propertyId": "uuid" }
```

`403` `phone_not_verified` if the session's phone is not verified. `404` `property_not_found` if the id doesn't resolve to a published property. Idempotent on the existing `(user_id, property_id)` pairing: a repeat unlock call returns the original `otpVerifiedAt` rather than erroring or refreshing it. Response `200`:

```jsonc
{ "propertyId": "uuid", "otpVerifiedAt": "ISO-8601" }
```

### Error codes

All implemented buyer routes return the standard envelope, `{ "error": { "code": "...", "message": "..." } }`.

| Status | `code`                                                     | Condition                                                                                                                                      |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `401`  | `unauthenticated`                                          | The buyer-account routes (`saved-properties`, `comparisons`, `enquiries`, `dossier-unlocks`) with no valid session.                            |
| `403`  | `phone_not_verified`                                       | `POST /api/v1/dossier-unlocks` when the session's phone is not verified.                                                                       |
| `404`  | `property_not_found`                                       | No `properties` row matches the given slug or id.                                                                                              |
| `404`  | `unit_variant_not_found`                                   | A given `unitVariantId` doesn't exist, or doesn't belong to the given property (`comparisons`, `enquiries`).                                   |
| `404`  | `saved_property_not_found`                                 | `DELETE /api/v1/saved-properties` when the property isn't currently saved by the caller.                                                       |
| `404`  | `enquiry_not_found`                                        | `PATCH /api/v1/admin/enquiries/{id}`: no enquiry with that id (a malformed id is treated the same).                                            |
| `404`  | `comparison_not_found`                                     | `DELETE /api/v1/comparisons/{id}` on an id the caller does not own (or that does not exist).                                                   |
| `404`  | `media_not_found`                                          | `GET /api/v1/media/{id}`: no `property_media` row matches the id, or its stored object no longer exists.                                       |
| `422`  | `unknown_query_parameter`                                  | A query parameter the route does not define. `message` names it.                                                                               |
| `422`  | `invalid_query_parameter`                                  | A defined parameter whose value fails validation, or a non-repeatable parameter given twice. `message` names it.                               |
| `422`  | `invalid_request_body`                                     | Malformed JSON, an unknown body field, or a field that fails validation, on any route taking a JSON body. `message` names the offending field. |
| `409`  | `edit_already_open`                                        | `POST …/properties/{id}/edits`: the property already has an edit in progress; the body also carries its `submissionId`.                        |
| `409`  | `duplicate_number`                                         | `…/rera/fetch`: another published property already holds that RERA number.                                                                     |
| `409`  | `nothing_to_apply`                                         | `…/rera/apply`: the submission already matches RERA.                                                                                           |
| `404`  | `job_not_found`                                            | `…/rera/apply`: no successful fetch with that id for this submission or its property.                                                          |
| `422`  | `no_regulator`, `invalid_number`, `not_found`, `ambiguous` | `…/rera/fetch`: the number is not one we can check, is malformed, matches no registered project, or matches several.                           |
| `502`  | `unavailable`, `unexpected_response`                       | `…/rera/fetch`: the regulator's site did not answer, or answered with something unreadable. Not the caller's fault.                            |
| `500`  | `internal_error`                                           | An unexpected server failure. `message` is deliberately generic; detail is logged server-side, never returned.                                 |

### Caching

All implemented routes are request-time handlers; none exports a Next.js route segment config, and none is prerendered. Cache policy is expressed as HTTP `Cache-Control` for a shared cache (CDN or reverse proxy) to honour on the two public catalog routes — the directives are shared-cache only, with no browser `max-age`, so a buyer changing a filter is never served a response their own browser is holding. Every other route carries per-request or per-identity input, so none of them is ever cached at all, not even briefly.

| Response                                        | `Cache-Control`                                     |
| ----------------------------------------------- | --------------------------------------------------- |
| `200` from the listing route                    | `public, s-maxage=60, stale-while-revalidate=300`   |
| `200` from the dossier route                    | `public, s-maxage=300, stale-while-revalidate=3600` |
| `200` from `POST /api/v1/discovery/matches`     | `no-store`                                          |
| Any response from the four buyer-account routes | `no-store`                                          |
| `302` from `GET /api/v1/media/{id}`             | `no-store`                                          |
| Any error response                              | `no-store`                                          |

Errors are never cached so that a `404` cannot outlive the publish that resolves it. Page-level ISR for the buyer-facing property page is a separate decision, taken with that page rather than with this API. See the 2026-09-02 entry in `DECISIONS.md`.

**Exclusion list (normative, applies to both routes):** no response body, at any nesting level, may contain `unit_price_history` data, a price, a price-per-square-foot value, a private budget bucket, submission/review status, provenance or evidence records, or OCR confidence. These live exclusively in the `private` schema and the submission-review tables, which the buyer read layer does not query.

This is enforced in running code, not by convention: every successful buyer response is scanned by `src/lib/properties/no-price.ts` immediately before serialisation, and a body carrying an excluded key fails the request with `500` rather than being served with the key stripped. A leak is a defect to fix at its source, and silently filtering it would hide the defect while the next response reintroduced it.

## Admin API

| Method and route                                               | Status                                      | Access     | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/admin/submissions`, `GET …/{id}`                  | Not needed (server-rendered)                | Admin      | The queue and submission screens read `src/lib/submissions/queue.ts` on the server; a JSON list/detail route is added only if another client needs one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `POST /api/v1/admin/submissions`                               | Implemented                                 | Admin      | Creates a blank manual-form draft for a developer (`{ developerId }`). Fields start not stated; nothing is invented.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `PATCH /api/v1/admin/submissions/{id}/fields/{fieldKey}`       | Implemented                                 | Admin      | Sets or replaces one field with a contract-validated value (`{ value }`); marks it edited and drops stale OCR evidence. Only while draft or changes-requested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `POST /api/v1/admin/submissions/{id}/fields/{fieldKey}/review` | Implemented                                 | Admin      | Confirms or rejects a candidate (`{ reviewStatus }`). Only while in review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST /api/v1/admin/submissions/{id}/media`                    | Implemented (multipart)                     | Admin      | Adds an admin-supplied JPEG/PNG/WebP (`file`, `mediaType`, `sourceKind` = `own`/`developer_supplied`, `attribution`, optional `caption`, `unitVariantName`). Always private and unreviewed; a brochure-derived source kind cannot be claimed by upload.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `POST /api/v1/admin/submissions/{id}/media/from-page`          | Implemented                                 | Admin      | Uses one whole page of the submission's own brochure as an image (`{ pageNumber, mediaType, unitVariantName?, caption? }`). Rendered server-side; a private, unreviewed candidate credited to the developer. The same page twice is `409 already_added`.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST /api/v1/admin/submissions/{id}/media/{mediaId}/review`   | Implemented                                 | Admin      | Confirms (optionally as public) or rejects an image (`{ reviewStatus, isPublic }`); a rejected image is never public. Only while in review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET, PUT, DELETE /api/v1/admin/submissions/{id}/prices`       | Implemented (2026-09-24)                    | Owner      | The review panel's Prices tab. `GET`: the submission's unit types with the price typed (`staged`), the live price (`current`) and RERA's stated range, plus what is unpriced. `PUT { unitVariantName, priceInr }`: types one unit type's price in whole rupees (digits, commas allowed; `422` otherwise or for a name the submission does not list). `DELETE { unitVariantName }`: removes a typed price. Only while the submission is still being worked on (`409` after). Held in the `private` schema and applied to the live unit type when the submission is published; never shown to a buyer. Always `no-store`; `503` when the private connection is not configured. |
| `POST /api/v1/admin/submissions/{id}/prices/apply`             | Implemented (2026-09-24)                    | Owner      | Retries applying the staged prices of a **published** submission; answers `{ applied, unchanged, unknown }`. `409` if the submission is not published.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `POST /api/v1/admin/submissions/{id}/review`                   | Implemented                                 | Admin      | `{ action }`: submit, start_review, request_changes, reject, approve — through the state machine under a row lock, with the caller's own permission level. Publish is not available here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `DELETE /api/v1/admin/submissions/{id}`                        | Implemented (2026-09-24)                    | Owner only | Clears a submission out of the queue. Never published: deleted for good, with its fields, images, extraction attempts and the files only it used. Published: archived instead (`archived_at`, schema v13), never deleted. `200 { outcome: "deleted"                                                                                                                                                                                                                                                                                                                                                                                                                          | "archived" }`; `409 invalid_state` while a brochure read is queued or running.                                                                                                |
| `POST /api/v1/admin/submissions/{id}/restore`                  | Implemented (2026-09-24)                    | Owner only | Puts an archived submission back in the queue. `204`; `409 invalid_state` if it is not archived.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /api/v1/admin/submissions/{id}/publish`                  | Implemented                                 | Owner only | Runs `publishSubmission`: one transaction writes the live catalog, confirmed public media and the revision snapshot. A verifier gets `403 owner_required`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /api/v1/admin/source-documents`                          | Implemented (multipart: developerId + file) | Admin      | Creates an immutable ingestion document and draft OCR submission; it does not start paid extraction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `POST /api/v1/admin/source-documents/{id}/ocr-jobs`            | Superseded by upload + job routes below     | Admin      | Upload already creates the draft OCR attempt; no second draft-creation route exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `PUT /api/v1/admin/ocr-jobs/{id}/routing-manifest`             | Implemented                                 | Admin      | Builds and saves a complete v2 manifest from human page choices while the attempt is a draft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `POST /api/v1/admin/ocr-jobs/{id}/queue`                       | Implemented                                 | Admin      | Revalidates and freezes the human-confirmed manifest, then changes the draft attempt to `queued`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /api/v1/admin/ocr-jobs/{id}/retry`                       | Implemented                                 | Admin      | Body `{ mode: "requeue"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | "edit_pages" }`. Moves a **failed** attempt back to `queued`(the worker runs it again) or to`draft` (page choices editable). 409 for any other state. Never calls a provider. |
| `POST /api/v1/admin/submissions/{id}/fields/confirm-pending`   | Implemented                                 | Admin      | Confirms every value still `needs_review` on a submission in review; responds `{ confirmed: n }`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `POST /api/v1/admin/properties/{id}/edits`                     | Implemented                                 | Admin      | Starts a correction to a published property: an empty draft submission bound to it (`201 { submissionId }`). Fields left out keep their published values. One open edit per property: a second attempt answers `409 edit_already_open` with `{ submissionId }` of the open one. Changes nothing live.                                                                                                                                                                                                                                                                                                                                                                        |
| `POST /api/v1/admin/properties/{id}/listing`                   | Implemented                                 | Owner only | Body `{ status }`, one of `listed`, `unlisted`, `deleted` (soft). An ordinary edit taken through submit, review, approve and publish, so it is recorded as a version of the property; nothing is erased. Responds `{ propertyId, status }`; `409 no_change` when it already has that status; `409 edit_already_open` (with `submissionId`) when an edit is in progress; refreshes the cached buyer pages.                                                                                                                                                                                                                                                                    |
| `POST /api/v1/admin/submissions/{id}/rera/fetch`               | Implemented                                 | Admin      | Body `{ registrationNumber }`. Looks the number up at its regulator (GujRERA for `PR/GJ/…`) and responds `{ jobId, record, comparison }`, the record beside what the submission holds. Writes nothing to the submission; records the fetch on `rera_fetch_jobs`. Draft or changes-requested submissions only. Never cached.                                                                                                                                                                                                                                                                                                                                                  |
| `POST /api/v1/admin/submissions/{id}/rera/apply`               | Implemented                                 | Admin      | Body `{ jobId }`. Writes RERA's values from that fetch into the submission's fields, validated like a hand entry and saved as confirmed. Responds `{ applied: [fieldKey…] }`. The submission stays a draft.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `PATCH /api/v1/admin/enquiries/{id}`                           | Implemented (2026-09-21)                    | Admin      | Body `{ status }`, one of `new`, `contacted`, `forwarded`, `closed` (2026-09-25: an enquiry reaches the admin first; the admin forwards it to the property's developer, or closes it themselves; `forwarded` stamps `forwarded_at`). Moves a buyer's enquiry through the admin inbox at `/admin/enquiries` (server-rendered, so there is no list route). Any admin; it publishes nothing. `404` `enquiry_not_found` for an unknown or malformed id, `422` for a bad status.                                                                                                                                                                                                  |
| `POST /api/v1/admin/developers/{id}/legal-entities`            | Implemented                                 | Admin      | Records a legal promoter entity `{ legalName, entityType, reraPromoterRegistrationNumber? }`. 409 for a duplicate name or promoter number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PATCH /api/v1/admin/legal-entities/{id}`                      | Implemented                                 | Admin      | Corrects a recorded legal entity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `GET /api/v1/admin/ocr-jobs/{id}`                              | Implemented (2026-09-21, status only)       | Admin      | Returns `{ id, status }` and nothing else, uncached; the page-review screen polls it and refreshes only when the status changes. `404` `ocr_job_not_found` for an unknown or malformed id. Richer metadata (routing, safe error text) stays Planned; provider secrets remain server-only.                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /api/v1/admin/developers/{id}/invites`                   | Implemented                                 | Owner only | Invites an email to an existing developer profile (`{ email, title? }`). Returns the one-time link (`inviteUrl`, `expiresAt`); it is never stored in readable form and cannot be retrieved again. An existing account is refused with `409 account_exists`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST /api/v1/admin/developer-users/{id}/reissue`              | Implemented                                 | Owner only | New one-time link for a pending invitation; the previous link stops working.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DELETE /api/v1/admin/developer-users/{id}`                    | Implemented                                 | Owner only | Withdraws an invitation or removes an active member's access and open sessions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Developer API

| Method and route                           | Status            | Access                 | Contract                                                    |
| ------------------------------------------ | ----------------- | ---------------------- | ----------------------------------------------------------- |
| `GET /api/v1/developer/portfolio`          | Planned (Phase 4) | Developer staff        | Returns only linked developer portfolio/analytics.          |
| `POST /api/v1/developer/submissions`       | Planned (Phase 4) | Developer staff        | Creates a draft/submission; it cannot publish.              |
| `PATCH /api/v1/developer/submissions/{id}` | Planned (Phase 4) | Owning developer staff | Updates an eligible draft or responds to requested changes. |

## Contract-change process

Before a consumer starts work against a route, define its request, response, access rules, pagination/filter semantics, and errors here. A breaking change requires a new versioned API-spec file and updates to affected app flows, tasklists, and implementation. Schema changes also follow `AGENTS.md`'s stricter versioning rules.
