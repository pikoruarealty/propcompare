import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  propertySubmissionMedia,
  propertySubmissions,
} from "@/db/schema/catalog";
import { createLocalStorageAdapter } from "@/lib/storage/local-adapter";
import {
  addSubmissionImage,
  MAX_SUBMISSION_MEDIA_BYTES,
  reviewSubmissionMedia,
  SubmissionMediaError,
} from "./media";

const userId = `media-test-${randomUUID()}`;
let dir: string;
let developerId: string;
const submissionIds: string[] = [];

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

const storage = () => createLocalStorageAdapter({ rootDir: dir, secret: "s" });

const newSubmission = async (status: "draft" | "in_review" = "draft") => {
  const [row] = await db
    .insert(propertySubmissions)
    .values({ developerId, source: "manual_form", status, payload: {} })
    .returning({ id: propertySubmissions.id });
  submissionIds.push(row.id);
  return row.id;
};

const upload = (
  submissionId: string,
  overrides: Partial<Parameters<typeof addSubmissionImage>[1]> = {},
) =>
  addSubmissionImage(
    { database: db, storage: storage() },
    {
      submissionId,
      uploadedBy: userId,
      bytes: PNG,
      mediaType: "photo",
      sourceKind: "own",
      attribution: "Photo by PropCompare",
      ...overrides,
    },
  );

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "propcompare-media-"));
  await db.insert(users).values({
    id: userId,
    name: "Media Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Media Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  for (const id of submissionIds) {
    await db.delete(propertySubmissions).where(eq(propertySubmissions.id, id));
  }
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
  await rm(dir, { recursive: true, force: true });
});

describe("addSubmissionImage", () => {
  it("stores the image and creates a private, unreviewed candidate — never live media", async () => {
    const id = await newSubmission();
    const { id: mediaId } = await upload(id, {
      caption: " Lobby ",
      unitVariantName: "3 BHK - A",
      mediaType: "floor_plan",
    });
    const [row] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, mediaId));
    expect(row).toMatchObject({
      submissionId: id,
      mediaType: "floor_plan",
      sourceKind: "own",
      attribution: "Photo by PropCompare",
      caption: "Lobby",
      unitVariantName: "3 BHK - A",
      isPublic: false,
      reviewStatus: "needs_review",
      uploadedBy: userId,
      displayOrder: 0,
    });
    expect(row.gcsPath).toMatch(/^submission-media\/[0-9a-f-]{36}\.png$/);
    expect((await storage().download(row.gcsPath)).byteLength).toBeGreaterThan(
      0,
    );
  });

  it("numbers images in the order they were added and accepts JPEG and WebP", async () => {
    const id = await newSubmission();
    await upload(id, { bytes: JPEG });
    await upload(id, { bytes: WEBP });
    const rows = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.submissionId, id))
      .orderBy(propertySubmissionMedia.displayOrder);
    expect(rows.map((r) => r.displayOrder)).toEqual([0, 1]);
    expect(rows.map((r) => r.gcsPath.split(".").pop())).toEqual([
      "jpg",
      "webp",
    ]);
  });

  it("refuses anything that is not really an image, an empty or oversized file, and a missing attribution", async () => {
    const id = await newSubmission();
    await expect(
      upload(id, { bytes: new TextEncoder().encode("GIF89a not accepted") }),
    ).rejects.toMatchObject({ code: "invalid_media" });
    await expect(
      upload(id, { bytes: new Uint8Array(0) }),
    ).rejects.toMatchObject({
      code: "invalid_media",
    });
    await expect(
      upload(id, { bytes: new Uint8Array(MAX_SUBMISSION_MEDIA_BYTES + 1) }),
    ).rejects.toMatchObject({ code: "invalid_media" });
    await expect(upload(id, { attribution: "   " })).rejects.toMatchObject({
      code: "invalid_media",
    });
    expect(
      await db
        .select()
        .from(propertySubmissionMedia)
        .where(eq(propertySubmissionMedia.submissionId, id)),
    ).toEqual([]);
  });

  it("only accepts images while the draft is editable, and for a real submission", async () => {
    const inReview = await newSubmission("in_review");
    await expect(upload(inReview)).rejects.toMatchObject({
      code: "invalid_state",
    });
    await expect(upload(randomUUID())).rejects.toMatchObject({
      code: "submission_not_found",
    });
    await expect(upload("not-a-uuid")).rejects.toBeInstanceOf(
      SubmissionMediaError,
    );
  });
});

describe("reviewSubmissionMedia", () => {
  it("makes an image public only when it is confirmed as public, and only during review", async () => {
    const id = await newSubmission();
    const { id: mediaId } = await upload(id);

    await expect(
      reviewSubmissionMedia(db, {
        submissionId: id,
        mediaId,
        reviewedBy: userId,
        reviewStatus: "confirmed",
        isPublic: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });

    await db
      .update(propertySubmissions)
      .set({ status: "in_review" })
      .where(eq(propertySubmissions.id, id));
    await reviewSubmissionMedia(db, {
      submissionId: id,
      mediaId,
      reviewedBy: userId,
      reviewStatus: "confirmed",
      isPublic: true,
    });
    let [row] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, mediaId));
    expect(row).toMatchObject({
      reviewStatus: "confirmed",
      isPublic: true,
      reviewedBy: userId,
    });
    expect(row.reviewedAt).not.toBeNull();

    // Rejecting can never leave an image public, whatever the flag says.
    await reviewSubmissionMedia(db, {
      submissionId: id,
      mediaId,
      reviewedBy: userId,
      reviewStatus: "rejected",
      isPublic: true,
    });
    [row] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, mediaId));
    expect(row).toMatchObject({ reviewStatus: "rejected", isPublic: false });
  });

  it("will not review media that belongs to a different submission", async () => {
    const id = await newSubmission();
    const other = await newSubmission();
    const { id: mediaId } = await upload(id);
    await db
      .update(propertySubmissions)
      .set({ status: "in_review" })
      .where(eq(propertySubmissions.id, other));
    await expect(
      reviewSubmissionMedia(db, {
        submissionId: other,
        mediaId,
        reviewedBy: userId,
        reviewStatus: "confirmed",
        isPublic: true,
      }),
    ).rejects.toMatchObject({ code: "media_not_found" });
  });
});
