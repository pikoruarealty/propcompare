import { createGcsStorageAdapter } from "./gcs-adapter";
import { createLocalStorageAdapter } from "./local-adapter";
import type { StorageAdapter } from "./adapter";

/**
 * The single configured `StorageAdapter` instance the rest of the
 * application imports — never `gcs-adapter.ts`, `local-adapter.ts` (or any
 * future provider adapter) directly. Swapping provider later means changing
 * this one selection.
 *
 * `STORAGE_DRIVER` picks the provider: `gcs` (the default) or `local` (files on
 * disk under `LOCAL_STORAGE_DIR`, for development and as the basis of a VPS
 * move). It is chosen explicitly rather than guessed from which credentials
 * happen to be present, so a production deploy with a missing bucket fails
 * loudly instead of quietly writing to disk.
 */
const createConfiguredAdapter = (): StorageAdapter => {
  switch (process.env.STORAGE_DRIVER ?? "gcs") {
    case "local":
      return createLocalStorageAdapter();
    case "gcs":
      return createGcsStorageAdapter();
    default:
      throw new Error(
        `Unknown STORAGE_DRIVER "${process.env.STORAGE_DRIVER}" (expected "gcs" or "local")`,
      );
  }
};

export const storageAdapter: StorageAdapter = createConfiguredAdapter();
