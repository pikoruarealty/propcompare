import sharp from "sharp";
import {
  StorageAdapterError,
  type StorageAdapter,
} from "@/lib/storage/adapter";

/**
 * Small versions of published pictures, for cards. The gallery and the browse card
 * were loading the full 1600 px picture for a card a few hundred pixels wide.
 *
 * A thumbnail is a derived file, stored beside its original
 * (`<original path>.thumb-480.webp`) and made the first time it is asked for, so
 * no picture needs a backfill and nothing is added to the database: the original
 * row stays the only record. It is an image of the same picture, never a new one,
 * and the full picture is untouched.
 */
export const THUMBNAIL_WIDTH = 480;

export const thumbnailPathFor = (originalPath: string): string =>
  `${originalPath}.thumb-${THUMBNAIL_WIDTH}.webp`;

export class ThumbnailError extends Error {}

/** Resizes to fit inside the thumbnail box, keeping the picture whole (a floor
 * plan must not be cropped), honouring the camera's rotation. */
export const makeThumbnail = async (original: Uint8Array): Promise<Buffer> => {
  try {
    return await sharp(original)
      .rotate()
      .resize({
        width: THUMBNAIL_WIDTH,
        height: Math.round((THUMBNAIL_WIDTH * 3) / 4),
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toBuffer();
  } catch {
    throw new ThumbnailError("The file is not a picture that can be resized.");
  }
};

/**
 * The thumbnail bytes for an original, made and stored on first use. Two requests
 * arriving together may both make it; the result is identical, so the second
 * write is harmless.
 */
export const ensureThumbnail = async (
  storage: Pick<StorageAdapter, "download" | "upload">,
  originalPath: string,
): Promise<Uint8Array> => {
  const thumbnailPath = thumbnailPathFor(originalPath);
  try {
    return await storage.download(thumbnailPath);
  } catch (cause) {
    if (
      !(cause instanceof StorageAdapterError) ||
      cause.code !== "object_not_found"
    ) {
      throw cause;
    }
  }
  const thumbnail = await makeThumbnail(await storage.download(originalPath));
  await storage.upload({
    path: thumbnailPath,
    body: thumbnail,
    contentType: "image/webp",
  });
  return thumbnail;
};
