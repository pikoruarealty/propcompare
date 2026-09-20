import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { StorageAdapterError } from "@/lib/storage/adapter";
import {
  ensureThumbnail,
  makeThumbnail,
  THUMBNAIL_WIDTH,
  thumbnailPathFor,
  ThumbnailError,
} from "./thumbnails";

const picture = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .png()
    .toBuffer();

/** A stand-in store that remembers what was uploaded. */
const fakeStorage = (files: Record<string, Uint8Array>) => {
  const download = vi.fn(async (path: string) => {
    const file = files[path];
    if (!file) throw new StorageAdapterError("object_not_found", path);
    return file;
  });
  const upload = vi.fn(async (input: { path: string; body: Uint8Array }) => {
    files[input.path] = input.body;
    return { path: input.path };
  });
  return { download, upload, files };
};

describe("makeThumbnail", () => {
  it("shrinks a large picture to a small WebP that keeps its proportions", async () => {
    const thumbnail = await makeThumbnail(await picture(1600, 1200));
    const info = await sharp(thumbnail).metadata();

    expect(info.format).toBe("webp");
    expect(info.width).toBe(THUMBNAIL_WIDTH);
    expect(info.height).toBe(360);
    expect(thumbnail.length).toBeLessThan(20_000);
  });

  it("does not crop a tall floor plan: it fits inside the box", async () => {
    const info = await sharp(
      await makeThumbnail(await picture(1000, 1600)),
    ).metadata();

    expect(info.height).toBe(360);
    expect(info.width).toBe(225);
  });

  it("never enlarges a picture that is already small", async () => {
    const info = await sharp(
      await makeThumbnail(await picture(200, 100)),
    ).metadata();

    expect(info.width).toBe(200);
    expect(info.height).toBe(100);
  });

  it("refuses a file that is not a picture", async () => {
    await expect(
      makeThumbnail(new TextEncoder().encode("not an image")),
    ).rejects.toBeInstanceOf(ThumbnailError);
  });
});

describe("thumbnailPathFor", () => {
  it("sits beside the original and never replaces it", () => {
    expect(thumbnailPathFor("gs://bucket/a/b.webp")).toBe(
      "gs://bucket/a/b.webp.thumb-480.webp",
    );
    expect(thumbnailPathFor("x")).not.toBe("x");
  });
});

describe("ensureThumbnail", () => {
  it("makes the thumbnail once, stores it beside the original, and reuses it", async () => {
    const original = await picture(1600, 1200);
    const storage = fakeStorage({ "gs://b/p.webp": original });

    const first = await ensureThumbnail(storage, "gs://b/p.webp");
    const second = await ensureThumbnail(storage, "gs://b/p.webp");

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload).toHaveBeenCalledWith({
      path: "gs://b/p.webp.thumb-480.webp",
      body: expect.any(Buffer),
      contentType: "image/webp",
    });
    expect([...second]).toEqual([...first]);
    // The original is untouched.
    expect(storage.files["gs://b/p.webp"]).toBe(original);
  });

  it("does not hide a storage failure as 'no thumbnail yet'", async () => {
    const storage = {
      download: vi.fn(async () => {
        throw new StorageAdapterError("provider_error", "boom");
      }),
      upload: vi.fn(),
    };

    await expect(
      ensureThumbnail(storage, "gs://b/p.webp"),
    ).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("stores nothing when the original is missing or not a picture", async () => {
    const missing = fakeStorage({});
    await expect(
      ensureThumbnail(missing, "gs://b/none.webp"),
    ).rejects.toMatchObject({
      code: "object_not_found",
    });

    const bad = fakeStorage({
      "gs://b/x.webp": new TextEncoder().encode("nope"),
    });
    await expect(ensureThumbnail(bad, "gs://b/x.webp")).rejects.toBeInstanceOf(
      ThumbnailError,
    );
    expect(bad.upload).not.toHaveBeenCalled();
  });
});
