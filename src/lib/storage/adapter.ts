/**
 * The one interface every part of this application talks to for reading or
 * writing a file — brochures (`source_documents.gcs_path`), buyer media
 * (`property_media.gcs_path`), anything else that ever needs object storage.
 * Nothing outside `src/lib/storage/` may import a provider SDK directly
 * (`docs/tasklists/2026-09-18-storage-adapter.md`).
 *
 * Mirrors the `OcrAdapterError`/provider-adapter convention already
 * established in `src/lib/ocr/adapter.ts`: a typed error class, a factory
 * function per provider, and callers depending only on this interface so
 * switching provider — the user is evaluating a move off GCP to a Hostinger
 * VPS — means writing one new adapter, not auditing every call site.
 *
 * Buyer-facing media is served through `GET /api/v1/media/{id}`
 * (`src/app/api/v1/media/[id]/route.ts`), which resolves a fresh
 * `getSignedReadUrl` per request and redirects to it — never baked into the
 * dossier page's ISR-cached HTML, since a signed URL expires and that page
 * does not re-render every request (2026-09-18 `DECISIONS.md` entry,
 * superseding the signed-URL rejection in the 2026-09-07 dossier-media-gate
 * entry).
 */

export type StorageAdapterFailureCode =
  | "configuration_error"
  | "invalid_path"
  | "object_not_found"
  | "provider_error";

export class StorageAdapterError extends Error {
  constructor(
    public readonly code: StorageAdapterFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageAdapterError";
  }
}

export interface StorageUploadInput {
  /** Provider-specific object path, e.g. `gs://bucket/object` for GCS. */
  path: string;
  body: Uint8Array | Buffer;
  contentType?: string;
}

export interface GetSignedReadUrlOptions {
  /** How long the URL stays valid. Default is short (minutes): it only
   * needs to outlive the moment between issuing a redirect and the browser
   * following it, since it is generated live at request time. */
  expiresInSeconds?: number;
}

export interface StorageAdapter {
  upload(input: StorageUploadInput): Promise<{ path: string }>;
  download(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
  getSignedReadUrl(
    path: string,
    options?: GetSignedReadUrlOptions,
  ): Promise<string>;
}
