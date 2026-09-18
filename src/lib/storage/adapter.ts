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
 * Deliberately does not resolve a buyer-facing URL. `download` returns
 * bytes; whether a buyer's browser ever gets a public bucket URL, a signed
 * URL, or bytes proxied through a route is a separate, still-open decision
 * (2026-09-07 `DECISIONS.md` dossier-media-gate entry). A
 * `getSignedReadUrl`-style method belongs on this interface once that's
 * decided, not guessed at here.
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

export interface StorageAdapter {
  upload(input: StorageUploadInput): Promise<{ path: string }>;
  download(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
}
