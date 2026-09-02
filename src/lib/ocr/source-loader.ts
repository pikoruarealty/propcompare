import { Storage } from "@google-cloud/storage";
import { OcrAdapterError } from "./adapter";

export interface GcsSourcePdfLoaderOptions {
  bucket?: string;
  storage?: Storage;
}

const createStorageClient = (): Storage => {
  const projectId = process.env.GCS_PROJECT_ID || undefined;
  const clientEmail = process.env.GCS_CLIENT_EMAIL || undefined;
  const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if ((clientEmail && !privateKey) || (!clientEmail && privateKey)) {
    throw new OcrAdapterError(
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
  gcsPath: string,
  defaultBucket?: string,
): { bucket: string; objectName: string } => {
  const trimmed = gcsPath.trim();
  if (trimmed.startsWith("gs://")) {
    const withoutScheme = trimmed.slice("gs://".length);
    const separator = withoutScheme.indexOf("/");
    if (separator <= 0 || separator === withoutScheme.length - 1) {
      throw new OcrAdapterError(
        "source_load_failed",
        `Invalid GCS object path: ${gcsPath}`,
      );
    }
    return {
      bucket: withoutScheme.slice(0, separator),
      objectName: withoutScheme.slice(separator + 1),
    };
  }
  const objectName = trimmed.replace(/^\/+/, "");
  if (!defaultBucket || !objectName) {
    throw new OcrAdapterError(
      "configuration_error",
      "GCS_BUCKET is required when source_documents.gcs_path is not a gs:// URI",
    );
  }
  return { bucket: defaultBucket, objectName };
};

export const createGcsSourcePdfLoader = (
  options: GcsSourcePdfLoaderOptions = {},
): ((gcsPath: string) => Promise<Uint8Array>) => {
  const storage = options.storage ?? createStorageClient();
  const defaultBucket = options.bucket ?? process.env.GCS_BUCKET;

  return async (gcsPath: string): Promise<Uint8Array> => {
    const { bucket, objectName } = resolveGcsObject(gcsPath, defaultBucket);
    const [contents] = await storage.bucket(bucket).file(objectName).download();
    return contents;
  };
};
