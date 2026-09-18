# Tasklist — storage adapter layer (GCS-backed)

**Status:** done — implemented and verified 2026-09-18
**Owner:** Bhavarth
**Branch:** task/phase-3-budget-range-matching
**Depends on:** nothing (infrastructure layer, no UI depends on it yet)
**References:** `docs/tasklists/2026-09-18-phase-2a-completion.md` ("Storage abstraction and provider" open decision, which this resolves the abstraction half of), `src/lib/ocr/source-loader.ts` (the one existing, uninterfaced, unused GCS call this replaces), `src/lib/ocr/adapter.ts` (the OCR-provider adapter pattern this mirrors)

## Scope

A `StorageAdapter` interface (`upload`/`download`/`delete`) with one implementation today, `createGcsStorageAdapter`, backed by `@google-cloud/storage`. The goal, per the user's direction: every part of the application that needs to read or write a file talks to this interface, never the GCS SDK directly, so switching provider later (the user is evaluating a move off GCP to a Hostinger VPS) means writing one new adapter, not hunting down every call site.

## Non-goals

- **Not deciding the buyer-facing URL-resolution strategy** (public bucket vs. signed URL vs. proxy route) — that's a separate, still-open product/architecture decision (2026-09-07 `DECISIONS.md` dossier-media-gate entry, restated in the Phase 2A completion tasklist). This adapter's `download` returns bytes, not a browsable URL; nothing here commits to how a buyer's browser ever gets a photo. A `getSignedReadUrl`-style method can be added to the interface when that's decided.
- **Not building any upload UI or route.** Nothing calls `upload()` yet — the Phase 2A completion tasklist's developer-portal step is what will.
- **Not renaming the `gcs_path` database columns** (`source_documents.gcs_path`, `property_media.gcs_path`). Provider-neutral naming would be a real schema change; out of scope here. The adapter accepts and returns the same path strings those columns already store (`gs://bucket/object`, or a bare object name resolved against a configured default bucket) — nothing about existing data changes.
- **Not migrating OCR provider selection.** `src/lib/ocr/adapter.ts`'s `loadSourcePdf` option is unchanged in shape (`(path: string) => Promise<Uint8Array>`); it just gets satisfied by this adapter's `download` instead of the retired `source-loader.ts`.

## Implementation checklist

- [x] `src/lib/storage/adapter.ts`: the `StorageAdapter` interface (`upload`, `download`, `delete`) and `StorageAdapterError` (typed failure codes), matching the `OcrAdapterError` convention in `src/lib/ocr/adapter.ts`.
- [x] `src/lib/storage/gcs-adapter.ts`: `createGcsStorageAdapter(options)` implementing the interface against `@google-cloud/storage`, reusing `source-loader.ts`'s existing path convention (`gs://bucket/object`, or a bare path against a configured default bucket) and env vars (`GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`, `GCS_BUCKET`) unchanged.
- [x] Retired `src/lib/ocr/source-loader.ts` — confirmed zero callers and zero test coverage before deleting (`grep` across `src/`), so this was a straight replacement, not a parallel path left standing.

## Tests

- [x] Path parsing/validation (`gs://` form, bare-path-plus-default-bucket form, missing-bucket error, malformed `gs://` error) without a real GCS connection, injecting a stub `Storage`-shaped client (`src/lib/storage/gcs-adapter.test.ts`).
- [x] `upload`/`download`/`delete` each call the expected GCS SDK methods with the resolved bucket/object name, verified against the injected stub.
- [x] Provider error surfaces as `StorageAdapterError` with a stable code (`object_not_found` for a 404, `provider_error` otherwise), not a raw GCS SDK error leaking through the interface.
- [x] Configuration validation: mismatched `GCS_CLIENT_EMAIL`/`GCS_PRIVATE_KEY` throws `configuration_error`.

## Documentation

- [x] Updated `docs/tasklists/2026-09-18-phase-2a-completion.md`'s "Storage abstraction and provider" entry: the abstraction now exists; what remains open is only the buyer-facing URL-resolution strategy, and the provider itself if/when the Hostinger move happens.
- [x] Updated `PROGRESS.md`.

## Completion record

**2026-09-18 — Done.** `src/lib/storage/adapter.ts` and `gcs-adapter.ts` implement the interface; `src/lib/ocr/source-loader.ts` retired. 12 new tests; full suite 576/576 passing; format, lint, typecheck all clean. Nothing calls `upload()` in real code yet — that's the Phase 2A completion tasklist's developer-portal step, which now has an interface to build against instead of a second direct SDK call.
