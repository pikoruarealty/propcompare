import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  StorageAdapterError,
  type GetSignedReadUrlOptions,
  type StorageAdapter,
  type StorageUploadInput,
} from "./adapter";

/**
 * A `StorageAdapter` that keeps objects on local disk. Two uses: development
 * without a cloud bucket (`STORAGE_DRIVER=local`), and the starting point for a
 * VPS deployment, where "storage" is a mounted volume. The rest of the app
 * cannot tell the difference, which is the point of the interface.
 *
 * Paths are `local://<key>`. A key is validated segment by segment — no `..`,
 * no absolute path, no empty or dot segments — so nothing can resolve outside
 * the root directory.
 *
 * `getSignedReadUrl` returns a URL to `/api/v1/local-files/<key>` carrying an
 * expiry and an HMAC of `key + expiry`, checked by that route with
 * `verifyLocalReadSignature`. It is the local counterpart of a cloud signed
 * URL: short-lived and unforgeable without the server secret.
 */

const SCHEME = "local://";
const DEFAULT_TTL_SECONDS = 300;

export const resolveLocalKey = (input: string): string => {
  const trimmed = input.trim();
  const key = trimmed.startsWith(SCHEME)
    ? trimmed.slice(SCHEME.length)
    : trimmed;
  const segments = key.split("/");
  if (
    !key ||
    key.includes("\\") ||
    key.includes("\0") ||
    segments.some((s) => s === "" || s === "." || s === "..")
  ) {
    throw new StorageAdapterError(
      "invalid_path",
      `Invalid local storage path: ${input}`,
    );
  }
  return key;
};

const sign = (key: string, expires: number, secret: string): string =>
  createHmac("sha256", secret).update(`${key}\n${expires}`).digest("hex");

export const verifyLocalReadSignature = (params: {
  key: string;
  expires: number;
  signature: string;
  secret: string;
  now?: number;
}): boolean => {
  if (!Number.isFinite(params.expires)) return false;
  if ((params.now ?? Date.now()) / 1000 > params.expires) return false;
  const expected = Buffer.from(sign(params.key, params.expires, params.secret));
  const given = Buffer.from(params.signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
};

export interface LocalStorageAdapterOptions {
  rootDir?: string;
  /** Secret for signed read URLs; defaults to `BETTER_AUTH_SECRET`. */
  secret?: string;
}

export const createLocalStorageAdapter = (
  options: LocalStorageAdapterOptions = {},
): StorageAdapter => {
  const rootDir = path.resolve(
    options.rootDir ?? process.env.LOCAL_STORAGE_DIR ?? ".local/storage",
  );
  const secret = () => {
    const value = options.secret ?? process.env.BETTER_AUTH_SECRET;
    if (!value) {
      throw new StorageAdapterError(
        "configuration_error",
        "BETTER_AUTH_SECRET is required to sign local storage URLs",
      );
    }
    return value;
  };
  const fileFor = (input: string) => path.join(rootDir, resolveLocalKey(input));

  return {
    async upload({ path: target, body }: StorageUploadInput) {
      const file = fileFor(target);
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, body);
      } catch (cause) {
        throw new StorageAdapterError(
          "provider_error",
          `Failed to write ${target}: ${(cause as Error).message}`,
        );
      }
      return { path: target };
    },

    async download(target: string) {
      try {
        return new Uint8Array(await readFile(fileFor(target)));
      } catch (cause) {
        if (cause instanceof StorageAdapterError) throw cause;
        if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
          throw new StorageAdapterError(
            "object_not_found",
            `No object at ${target}`,
          );
        }
        throw new StorageAdapterError(
          "provider_error",
          `Failed to read ${target}: ${(cause as Error).message}`,
        );
      }
    },

    async delete(target: string) {
      const file = fileFor(target);
      try {
        await readFile(file);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
          throw new StorageAdapterError(
            "object_not_found",
            `No object at ${target}`,
          );
        }
        throw new StorageAdapterError(
          "provider_error",
          `Failed to delete ${target}: ${(cause as Error).message}`,
        );
      }
      await rm(file, { force: true });
    },

    async getSignedReadUrl(
      target: string,
      { expiresInSeconds = DEFAULT_TTL_SECONDS }: GetSignedReadUrlOptions = {},
    ) {
      const key = resolveLocalKey(target);
      const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const signature = sign(key, expires, secret());
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      return `/api/v1/local-files/${encodedKey}?e=${expires}&s=${signature}`;
    },
  };
};
