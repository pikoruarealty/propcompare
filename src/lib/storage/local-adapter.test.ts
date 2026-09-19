import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageAdapterError } from "./adapter";
import {
  createLocalStorageAdapter,
  resolveLocalKey,
  verifyLocalReadSignature,
} from "./local-adapter";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "propcompare-storage-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const adapter = () =>
  createLocalStorageAdapter({ rootDir: dir, secret: "test-secret" });

describe("resolveLocalKey", () => {
  it("accepts a scheme or a bare key", () => {
    expect(resolveLocalKey("local://brochures/a.pdf")).toBe("brochures/a.pdf");
    expect(resolveLocalKey("brochures/a.pdf")).toBe("brochures/a.pdf");
  });

  it.each([
    "",
    "local://",
    "../etc/passwd",
    "a/../b",
    "/abs/path",
    "a//b",
    "a/./b",
    "a\\b",
  ])("rejects %j", (input) => {
    expect(() => resolveLocalKey(input)).toThrow(StorageAdapterError);
  });
});

describe("local storage adapter", () => {
  it("uploads, downloads and deletes an object", async () => {
    const storage = adapter();
    await storage.upload({
      path: "local://brochures/x/one.pdf",
      body: Buffer.from("hello"),
    });
    expect(
      Buffer.from(
        await storage.download("local://brochures/x/one.pdf"),
      ).toString(),
    ).toBe("hello");

    await storage.delete("local://brochures/x/one.pdf");
    await expect(
      storage.download("local://brochures/x/one.pdf"),
    ).rejects.toMatchObject({ code: "object_not_found" });
  });

  it("reports a missing object on download and delete", async () => {
    await expect(adapter().download("local://nope.pdf")).rejects.toMatchObject({
      code: "object_not_found",
    });
    await expect(adapter().delete("local://nope.pdf")).rejects.toMatchObject({
      code: "object_not_found",
    });
  });

  it("refuses to write outside its root", async () => {
    await expect(
      adapter().upload({
        path: "local://../escape.txt",
        body: Buffer.from("x"),
      }),
    ).rejects.toMatchObject({ code: "invalid_path" });
  });

  it("issues a signed URL that verifies, and stops verifying when tampered with or expired", async () => {
    const url = await adapter().getSignedReadUrl("local://brochures/a b.pdf", {
      expiresInSeconds: 60,
    });
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/api/v1/local-files/brochures/a%20b.pdf");

    const params = {
      key: "brochures/a b.pdf",
      expires: Number(parsed.searchParams.get("e")),
      signature: parsed.searchParams.get("s")!,
      secret: "test-secret",
    };
    expect(verifyLocalReadSignature(params)).toBe(true);
    expect(
      verifyLocalReadSignature({ ...params, key: "brochures/other.pdf" }),
    ).toBe(false);
    expect(verifyLocalReadSignature({ ...params, secret: "wrong" })).toBe(
      false,
    );
    expect(verifyLocalReadSignature({ ...params, signature: "abc" })).toBe(
      false,
    );
    expect(
      verifyLocalReadSignature({ ...params, now: (params.expires + 1) * 1000 }),
    ).toBe(false);
  });

  it("will not sign without a secret", async () => {
    const previous = process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_SECRET;
    try {
      await expect(
        createLocalStorageAdapter({ rootDir: dir }).getSignedReadUrl(
          "local://a.pdf",
        ),
      ).rejects.toMatchObject({ code: "configuration_error" });
    } finally {
      if (previous !== undefined) process.env.BETTER_AUTH_SECRET = previous;
    }
  });
});
