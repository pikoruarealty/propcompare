import { describe, expect, it, vi } from "vitest";
import type { Storage } from "@google-cloud/storage";
import { StorageAdapterError } from "./adapter";
import { createGcsStorageAdapter } from "./gcs-adapter";

/**
 * No real GCS connection: a stub `Storage`-shaped client is injected the
 * same way `src/lib/ocr/source-loader.ts`'s design allowed (`options.storage`),
 * so path resolution and error mapping are provable without credentials.
 */

interface StubFile {
  save: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const createStubStorage = (): {
  storage: Storage;
  file: StubFile;
  fileSpy: ReturnType<typeof vi.fn>;
  bucketSpy: ReturnType<typeof vi.fn>;
} => {
  const file: StubFile = {
    save: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue([new Uint8Array([1, 2, 3])]),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const fileSpy = vi.fn().mockReturnValue(file);
  const bucketSpy = vi.fn().mockReturnValue({ file: fileSpy });
  const storage = { bucket: bucketSpy } as unknown as Storage;
  return { storage, file, fileSpy, bucketSpy };
};

describe("createGcsStorageAdapter — path resolution", () => {
  it("resolves a gs:// path into bucket and object name", async () => {
    const { storage, fileSpy, bucketSpy } = createStubStorage();
    const adapter = createGcsStorageAdapter({ storage });

    await adapter.download("gs://my-bucket/some/object.pdf");

    expect(bucketSpy).toHaveBeenCalledWith("my-bucket");
    expect(fileSpy).toHaveBeenCalledWith("some/object.pdf");
  });

  it("resolves a bare path against the configured default bucket", async () => {
    const { storage, fileSpy, bucketSpy } = createStubStorage();
    const adapter = createGcsStorageAdapter({
      storage,
      bucket: "default-bucket",
    });

    await adapter.download("some/object.pdf");

    expect(bucketSpy).toHaveBeenCalledWith("default-bucket");
    expect(fileSpy).toHaveBeenCalledWith("some/object.pdf");
  });

  it("rejects a bare path with no configured default bucket", async () => {
    const { storage } = createStubStorage();
    const adapter = createGcsStorageAdapter({ storage });

    await expect(adapter.download("some/object.pdf")).rejects.toBeInstanceOf(
      StorageAdapterError,
    );
  });

  it("rejects a malformed gs:// path", async () => {
    const { storage } = createStubStorage();
    const adapter = createGcsStorageAdapter({ storage });

    await expect(adapter.download("gs://no-object-name")).rejects.toMatchObject(
      { code: "invalid_path" },
    );
  });
});

describe("createGcsStorageAdapter — operations", () => {
  it("upload calls file.save with the body and content type", async () => {
    const { storage, file } = createStubStorage();
    const adapter = createGcsStorageAdapter({ storage });
    const body = new Uint8Array([9, 9, 9]);

    const result = await adapter.upload({
      path: "gs://my-bucket/brochures/a.pdf",
      body,
      contentType: "application/pdf",
    });

    expect(file.save).toHaveBeenCalledWith(body, {
      contentType: "application/pdf",
      resumable: false,
    });
    expect(result).toEqual({ path: "gs://my-bucket/brochures/a.pdf" });
  });

  it("download returns the file's bytes", async () => {
    const { storage } = createStubStorage();
    const adapter = createGcsStorageAdapter({ storage });

    const bytes = await adapter.download("gs://my-bucket/brochures/a.pdf");

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("delete calls file.delete", async () => {
    const { storage, file } = createStubStorage();
    const adapter = createGcsStorageAdapter({ storage });

    await adapter.delete("gs://my-bucket/brochures/a.pdf");

    expect(file.delete).toHaveBeenCalled();
  });
});

describe("createGcsStorageAdapter — error mapping", () => {
  it("maps a 404 download failure to object_not_found", async () => {
    const { storage, file } = createStubStorage();
    file.download.mockRejectedValue({ code: 404, message: "Not Found" });
    const adapter = createGcsStorageAdapter({ storage });

    await expect(
      adapter.download("gs://my-bucket/missing.pdf"),
    ).rejects.toMatchObject({ code: "object_not_found" });
  });

  it("maps a 404 delete failure to object_not_found", async () => {
    const { storage, file } = createStubStorage();
    file.delete.mockRejectedValue({ code: 404, message: "Not Found" });
    const adapter = createGcsStorageAdapter({ storage });

    await expect(
      adapter.delete("gs://my-bucket/missing.pdf"),
    ).rejects.toMatchObject({ code: "object_not_found" });
  });

  it("maps a non-404 provider failure to provider_error", async () => {
    const { storage, file } = createStubStorage();
    file.save.mockRejectedValue({ code: 403, message: "Forbidden" });
    const adapter = createGcsStorageAdapter({ storage });

    await expect(
      adapter.upload({ path: "gs://my-bucket/a.pdf", body: new Uint8Array() }),
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("never leaks a raw provider error, only StorageAdapterError", async () => {
    const { storage, file } = createStubStorage();
    file.download.mockRejectedValue(new Error("ECONNRESET"));
    const adapter = createGcsStorageAdapter({ storage });

    await expect(
      adapter.download("gs://my-bucket/a.pdf"),
    ).rejects.toBeInstanceOf(StorageAdapterError);
  });
});

describe("createGcsStorageAdapter — configuration", () => {
  it("throws configuration_error when only one of client email / private key is set", () => {
    const originalEmail = process.env.GCS_CLIENT_EMAIL;
    const originalKey = process.env.GCS_PRIVATE_KEY;
    process.env.GCS_CLIENT_EMAIL = "svc@example.iam.gserviceaccount.com";
    delete process.env.GCS_PRIVATE_KEY;

    try {
      expect(() => createGcsStorageAdapter()).toThrow(StorageAdapterError);
    } finally {
      if (originalEmail === undefined) delete process.env.GCS_CLIENT_EMAIL;
      else process.env.GCS_CLIENT_EMAIL = originalEmail;
      if (originalKey === undefined) delete process.env.GCS_PRIVATE_KEY;
      else process.env.GCS_PRIVATE_KEY = originalKey;
    }
  });
});
