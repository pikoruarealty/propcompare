import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  ocrExtractionJobs,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import { createLocalStorageAdapter } from "@/lib/storage/local-adapter";
import {
  BrochureUploadError,
  createBrochureSubmission,
  inspectBrochurePdf,
} from "./brochure-upload";

let dir: string;
const userId = `upload-test-${randomUUID()}`;
let developerId: string;
const submissionIds: string[] = [];

export const makePdf = async (pages: number): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([400, 600]);
  return pdf.save();
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "propcompare-upload-"));
  await db.insert(users).values({
    id: userId,
    name: "Upload Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Upload Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  for (const id of submissionIds) {
    await db.delete(propertySubmissions).where(eq(propertySubmissions.id, id));
  }
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.uploadedBy, userId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
  await rm(dir, { recursive: true, force: true });
});

describe("inspectBrochurePdf", () => {
  it("counts the pages of a real PDF", async () => {
    expect(await inspectBrochurePdf(await makePdf(3))).toEqual({
      pageCount: 3,
    });
  });

  it("rejects something that is not a PDF, and a damaged PDF", async () => {
    await expect(
      inspectBrochurePdf(new TextEncoder().encode("hello world")),
    ).rejects.toMatchObject({ code: "not_a_pdf" });
    await expect(
      inspectBrochurePdf(new TextEncoder().encode("%PDF-1.7 garbage")),
    ).rejects.toMatchObject({ code: "unreadable" });
  });
});

describe("createBrochureSubmission", () => {
  it("stores the file and creates the source document, draft submission and draft job", async () => {
    const storage = createLocalStorageAdapter({ rootDir: dir, secret: "s" });
    const created = await createBrochureSubmission(
      { database: db, storage },
      { developerId, uploadedBy: userId, bytes: await makePdf(4) },
    );
    submissionIds.push(created.submissionId);
    expect(created.pageCount).toBe(4);

    const [document] = await db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, created.sourceDocumentId));
    expect(document).toMatchObject({
      documentType: "brochure_pdf",
      pageCount: 4,
      uploadedBy: userId,
    });
    expect(
      (await storage.download(document.gcsPath)).byteLength,
    ).toBeGreaterThan(0);

    const [submission] = await db
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, created.submissionId));
    expect(submission).toMatchObject({
      status: "draft",
      source: "ocr_brochure",
      developerId,
      submittedBy: userId,
    });

    const [job] = await db
      .select()
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, created.ocrJobId));
    expect(job.status).toBe("draft");
    expect(job.routingManifest).toEqual({
      version: "v1",
      pageCount: 4,
      scopes: [],
    });
  });

  it("refuses an unknown developer without storing anything", async () => {
    const storage = createLocalStorageAdapter({ rootDir: dir, secret: "s" });
    await expect(
      createBrochureSubmission(
        { database: db, storage },
        {
          developerId: randomUUID(),
          uploadedBy: userId,
          bytes: await makePdf(1),
        },
      ),
    ).rejects.toBeInstanceOf(BrochureUploadError);
  });
});
