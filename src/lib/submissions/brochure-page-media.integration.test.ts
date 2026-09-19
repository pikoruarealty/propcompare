import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  propertySubmissionMedia,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import { createBrochureSubmission } from "@/lib/ingestion/brochure-upload";
import { createLocalStorageAdapter } from "@/lib/storage/local-adapter";
import { addBrochurePageImage } from "./brochure-page-media";

const userId = `page-media-${randomUUID()}`;
const developerName = `Page Media Developer ${randomUUID().slice(0, 8)}`;
let dir: string;
let developerId: string;
let submissionId: string;
const createdSubmissionIds: string[] = [];

const storage = () => createLocalStorageAdapter({ rootDir: dir, secret: "s" });

const makePdf = async (pages: number) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    pdf
      .addPage([600, 420])
      .drawText(`Page ${i}`, { x: 40, y: 360, size: 32, font });
  }
  return pdf.save();
};

const add = (over: Partial<Parameters<typeof addBrochurePageImage>[1]> = {}) =>
  addBrochurePageImage(
    { database: db, storage: storage() },
    {
      submissionId,
      uploadedBy: userId,
      pageNumber: 2,
      mediaType: "floor_plan",
      ...over,
    },
  );

const rowsFor = (id: string) =>
  db
    .select()
    .from(propertySubmissionMedia)
    .where(eq(propertySubmissionMedia.submissionId, id));

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "propcompare-pagemedia-"));
  await db.insert(users).values({
    id: userId,
    name: "Page Media",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: developerName })
    .returning({ id: developers.id });
  developerId = developer.id;
  const created = await createBrochureSubmission(
    { database: db, storage: storage() },
    { developerId, uploadedBy: userId, bytes: await makePdf(3) },
  );
  submissionId = created.submissionId;
  createdSubmissionIds.push(submissionId);
});

afterAll(async () => {
  for (const id of createdSubmissionIds) {
    await db.delete(propertySubmissions).where(eq(propertySubmissions.id, id));
  }
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.uploadedBy, userId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
  await rm(dir, { recursive: true, force: true });
});

describe("addBrochurePageImage", () => {
  it("renders the page into a private, unreviewed candidate credited to the developer", async () => {
    const { id } = await add({ unitVariantName: " 3 BHK - A " });
    const [row] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, id));
    expect(row).toMatchObject({
      submissionId,
      mediaType: "floor_plan",
      sourceKind: "developer_brochure",
      caption: "Brochure page 2",
      unitVariantName: "3 BHK - A",
      isPublic: false,
      reviewStatus: "needs_review",
      uploadedBy: userId,
      displayOrder: 0,
    });
    expect(row.sourceDocumentId).not.toBeNull();
    expect(row.attribution).toBe(`Image from the ${developerName} brochure`);
    expect(row.gcsPath).toMatch(
      /^submission-media\/brochure-[0-9a-f-]{36}-page-2\.webp$/,
    );

    const stored = await storage().download(row.gcsPath);
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1600);
  });

  it("uses the caption it is given and orders images as they are added", async () => {
    const { id } = await add({
      pageNumber: 3,
      mediaType: "photo",
      caption: "  Clubhouse  ",
    });
    const [row] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, id));
    expect(row).toMatchObject({
      caption: "Clubhouse",
      mediaType: "photo",
      displayOrder: 1,
    });
  });

  it("refuses the same page twice, and leaves the first image's file alone", async () => {
    const before = await rowsFor(submissionId);
    await expect(add({ pageNumber: 2 })).rejects.toMatchObject({
      code: "already_added",
    });
    const after = await rowsFor(submissionId);
    expect(after).toHaveLength(before.length);
    const existing = after.find((r) => r.gcsPath.endsWith("-page-2.webp"))!;
    expect(
      (await storage().download(existing.gcsPath)).byteLength,
    ).toBeGreaterThan(0);
  });

  it("lets only one of two simultaneous requests add a page", async () => {
    const created = await createBrochureSubmission(
      { database: db, storage: storage() },
      { developerId, uploadedBy: userId, bytes: await makePdf(2) },
    );
    createdSubmissionIds.push(created.submissionId);
    const race = () =>
      addBrochurePageImage(
        { database: db, storage: storage() },
        {
          submissionId: created.submissionId,
          uploadedBy: userId,
          pageNumber: 1,
          mediaType: "photo",
        },
      );
    const results = await Promise.allSettled([race(), race()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rows = await rowsFor(created.submissionId);
    expect(rows).toHaveLength(1);
    // The winner's file must still be there.
    expect(
      (await storage().download(rows[0].gcsPath)).byteLength,
    ).toBeGreaterThan(0);
  });

  it("refuses a page outside the brochure and an over-long caption, storing nothing", async () => {
    const before = (await rowsFor(submissionId)).length;
    for (const pageNumber of [0, 4, 1.5]) {
      await expect(add({ pageNumber })).rejects.toMatchObject({
        code: "invalid_media",
      });
    }
    await expect(
      add({ pageNumber: 1, caption: "x".repeat(501) }),
    ).rejects.toMatchObject({
      code: "invalid_media",
    });
    expect(await rowsFor(submissionId)).toHaveLength(before);
  });

  it("only works while the submission is editable, and only for one that has a brochure", async () => {
    const created = await createBrochureSubmission(
      { database: db, storage: storage() },
      { developerId, uploadedBy: userId, bytes: await makePdf(1) },
    );
    createdSubmissionIds.push(created.submissionId);
    await db
      .update(propertySubmissions)
      .set({ status: "in_review" })
      .where(eq(propertySubmissions.id, created.submissionId));
    await expect(
      addBrochurePageImage(
        { database: db, storage: storage() },
        {
          submissionId: created.submissionId,
          uploadedBy: userId,
          pageNumber: 1,
          mediaType: "photo",
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_state" });

    const [manual] = await db
      .insert(propertySubmissions)
      .values({
        developerId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
    createdSubmissionIds.push(manual.id);
    await expect(
      addBrochurePageImage(
        { database: db, storage: storage() },
        {
          submissionId: manual.id,
          uploadedBy: userId,
          pageNumber: 1,
          mediaType: "photo",
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });
});
