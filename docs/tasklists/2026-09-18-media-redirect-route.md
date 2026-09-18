# Tasklist — `GET /api/v1/media/{id}` signed-URL redirect route

**Status:** done — implemented and verified 2026-09-18
**Owner:** Bhavarth
**Branch:** task/phase-3-budget-range-matching
**Depends on:** `src/lib/storage/adapter.ts`/`gcs-adapter.ts` (done, `docs/tasklists/2026-09-18-storage-adapter.md`)
**References:** `docs/api/api-spec.v1.md` (new route section), `DECISIONS.md` 2026-09-18 (why a redirect route rather than a URL baked into ISR-cached HTML; supersedes the 2026-09-07 dossier-media-gate entry's signed-URL rejection)

## Scope

Resolves the buyer-facing media URL strategy left open by the storage adapter work: `GET /api/v1/media/{id}` looks up one `property_media` row's `gcs_path`, asks the storage adapter for a freshly-generated signed read URL, and redirects (`302`) to it. Adds `getSignedReadUrl` to `StorageAdapter`.

## Non-goals

- Not wiring `PropertyCard`/the dossier's media rendering to actually emit `<img src="/api/v1/media/{id}">` — those components deliberately render a placeholder today (2026-09-07 `DECISIONS.md` entry), with tests asserting that on purpose, and there is no real `property_media` data to render against yet (the OCR/submission field contract has no media field — see below). Left as a follow-up once the developer-upload flow (Phase 2A completion tasklist) can actually create media rows.
- Not adding a way to create `property_media` rows. That's the same gap the Phase 2A completion tasklist's developer-upload step exists to close.

## Implementation checklist

- [x] `StorageAdapter.getSignedReadUrl(path, { expiresInSeconds? })` added to the interface (`src/lib/storage/adapter.ts`) and implemented in `gcs-adapter.ts` via GCS V4 read-signing, default TTL 5 minutes.
- [x] `src/lib/storage/index.ts`: the one configured `storageAdapter` singleton the rest of the app imports.
- [x] `src/lib/properties/queries.ts`: `getPublishedMediaObjectPath(db, id)` — returns the raw `gcs_path`, or `null`.
- [x] `src/app/api/v1/media/[id]/route.ts`: `404` `media_not_found` when no row matches or the storage adapter reports the object gone; otherwise `302` to the signed URL, always `Cache-Control: no-store`.

## Tests

- [x] `gcs-adapter.test.ts`: `getSignedReadUrl` requests a v4 read signature with the correct default/explicit TTL, returns the SDK's URL, and maps 404/other failures to `StorageAdapterError`.
- [x] `queries.integration.test.ts`: `getPublishedMediaObjectPath` returns `null` for a nonexistent id against a real database. The "found" path isn't provable against real data yet — no sanctioned write path can create a `property_media` row until developer upload lands (recorded, not worked around, matching how the OCR pipeline's own 2026-09-07 entry handled the same kind of contract gap).
- [x] `route.test.ts`: the route's redirect/error-mapping logic with mocked `getPublishedMediaObjectPath`/`storageAdapter` — 404 on no match, 302 with `Location`/`no-store` on success, 404 when the adapter reports the object gone, 500 on an unexpected failure.

## Documentation

- [x] `docs/api/api-spec.v1.md`: new route section, summary table row, error code (`media_not_found`), caching table row.
- [x] `DECISIONS.md`, `PROGRESS.md`, and `docs/tasklists/2026-09-18-phase-2a-completion.md`'s open-decisions section updated.

## Completion record

**2026-09-18 — Done.** Full suite 586/586 passing (21 new tests across three files); format, lint, typecheck all clean.
