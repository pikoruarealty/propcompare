import { Storage } from "@google-cloud/storage";
import {
  StorageAdapterError,
  type GetSignedReadUrlOptions,
  type StorageAdapter,
  type StorageUploadInput,
} from "./adapter";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * The GCS-backed `StorageAdapter` implementation — the only file in this
 * codebase allowed to import `@google-cloud/storage` directly
 * (`docs/tasklists/2026-09-18-storage-adapter.md`). Replaces
 * `src/lib/ocr/source-loader.ts`'s uninterfaced `createGcsSourcePdfLoader`,
 * which had zero callers and zero test coverage.
 *
 * Path convention unchanged from `source-loader.ts`, so existing
 * `gcs_path`-shaped values (`source_documents.gcs_path`,
 * `property_media.gcs_path`) resolve exactly as before: `gs://bucket/object`
 * is self-contained; a bare path resolves against `bucket`/`GCS_BUCKET`.
 */

export interface GcsStorageAdapterOptions {
  bucket?: string;
  storage?: Storage;
}

const createStorageClient = (): Storage => {
  const projectId = process.env.GCS_PROJECT_ID || undefined;
  const clientEmail = process.env.GCS_CLIENT_EMAIL || undefined;
  const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if ((clientEmail && !privateKey) || (!clientEmail && privateKey)) {
    throw new StorageAdapterError(
      "configuration_error",
      "GCS_CLIENT_EMAIL and GCS_PRIVATE_KEY must be configured together",
    );
  }
  return new Storage({
    projectId,
    ...(clientEmail && privateKey
      ? { credentials: { client_email: clientEmail, private_key: privateKey } }
      : {}),
  });
};

const resolveGcsObject = (
  path: string,
  defaultBucket?: string,
): { bucket: string; objectName: string } => {
  const trimmed = path.trim();
  if (trimmed.startsWith("gs://")) {
    const withoutScheme = trimmed.slice("gs://".length);
    const separator = withoutScheme.indexOf("/");
    if (separator <= 0 || separator === withoutScheme.length - 1) {
      throw new StorageAdapterError(
        "invalid_path",
        `Invalid GCS object path: ${path}`,
      );
    }
    return {
      bucket: withoutScheme.slice(0, separator),
      objectName: withoutScheme.slice(separator + 1),
    };
  }
  const objectName = trimmed.replace(/^\/+/, "");
  if (!defaultBucket || !objectName) {
    throw new StorageAdapterError(
      "configuration_error",
      "GCS_BUCKET is required when a path is not a gs:// URI",
    );
  }
  return { bucket: defaultBucket, objectName };
};

/** Narrows an unknown thrown value to the GCS client library's HTTP-style error shape. */
const isGcsApiError = (cause: unknown): cause is { code: number } =>
  typeof cause === "object" &&
  cause !== null &&
  typeof (cause as { code?: unknown }).code === "number";

export const createGcsStorageAdapter = (
  options: GcsStorageAdapterOptions = {},
): StorageAdapter => {
  const storage = options.storage ?? createStorageClient();
  const defaultBucket = options.bucket ?? process.env.GCS_BUCKET;

  return {
    async upload({
      path,
      body,
      contentType,
    }: StorageUploadInput): Promise<{ path: string }> {
      const { bucket, objectName } = resolveGcsObject(path, defaultBucket);
      try {
        await storage
          .bucket(bucket)
          .file(objectName)
          .save(body, { contentType, resumable: false });
      } catch (cause) {
        throw new StorageAdapterError(
          "provider_error",
          `Failed to upload to gs://${bucket}/${objectName}: ${(cause as Error).message}`,
        );
      }
      return { path };
    },

    async download(path: string): Promise<Uint8Array> {
      const { bucket, objectName } = resolveGcsObject(path, defaultBucket);
      try {
        const [contents] = await storage
          .bucket(bucket)
          .file(objectName)
          .download();
        return contents;
      } catch (cause) {
        if (isGcsApiError(cause) && cause.code === 404) {
          throw new StorageAdapterError(
            "object_not_found",
            `No object at gs://${bucket}/${objectName}`,
          );
        }
        throw new StorageAdapterError(
          "provider_error",
          `Failed to download gs://${bucket}/${objectName}: ${(cause as Error).message}`,
        );
      }
    },

    async delete(path: string): Promise<void> {
      const { bucket, objectName } = resolveGcsObject(path, defaultBucket);
      try {
        await storage.bucket(bucket).file(objectName).delete();
      } catch (cause) {
        if (isGcsApiError(cause) && cause.code === 404) {
          throw new StorageAdapterError(
            "object_not_found",
            `No object at gs://${bucket}/${objectName}`,
          );
        }
        throw new StorageAdapterError(
          "provider_error",
          `Failed to delete gs://${bucket}/${objectName}: ${(cause as Error).message}`,
        );
      }
    },

    async getSignedReadUrl(
      path: string,
      options: GetSignedReadUrlOptions = {},
    ): Promise<string> {
      const { bucket, objectName } = resolveGcsObject(path, defaultBucket);
      const ttlSeconds =
        options.expiresInSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
      try {
        const [url] = await storage
          .bucket(bucket)
          .file(objectName)
          .getSignedUrl({
            action: "read",
            version: "v4",
            expires: Date.now() + ttlSeconds * 1000,
          });
        return url;
      } catch (cause) {
        if (isGcsApiError(cause) && cause.code === 404) {
          throw new StorageAdapterError(
            "object_not_found",
            `No object at gs://${bucket}/${objectName}`,
          );
        }
        throw new StorageAdapterError(
          "provider_error",
          `Failed to sign a read URL for gs://${bucket}/${objectName}: ${(cause as Error).message}`,
        );
      }
    },
  };
};
