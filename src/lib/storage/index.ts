import { createGcsStorageAdapter } from "./gcs-adapter";
import type { StorageAdapter } from "./adapter";

/**
 * The single configured `StorageAdapter` instance the rest of the
 * application imports — never `gcs-adapter.ts` (or any future provider
 * adapter) directly. Swapping provider later means changing this one line.
 */
export const storageAdapter: StorageAdapter = createGcsStorageAdapter();
