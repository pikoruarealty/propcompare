import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  developers,
  ocrExtractionJobs,
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import { createBrochureSubmission } from "@/lib/ingestion/brochure-upload";
import { createLocalStorageAdapter } from "@/lib/storage/local-adapter";
import { addBrochurePageImage } from "./brochure-page-media";
import { listSubmissionQueue } from "./queue";
import {
  removeSubmission,
  restoreSubmission,
  SubmissionRemovalError,
} from "./removal";

const userId = `removal-${randomUUID()}`;
const developerName = `Removal Developer ${randomUUID().slice(0, 8)}`;
let dir: string;
let developerId: string;
const createdSubmissionIds: string[] = [];

const storage = () => createLocalStorageAdapter({ rootDir: dir, secret: "s" });
const deps = () => ({ database: db, storage: storage() });

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

const newBrochureSubmission = async () => {
  const created = await createBrochureSubmission(
    { database: db, storage: storage() },
    { developerId, uploadedBy: userId, bytes: await makePdf(2) },
  );
  createdSubmissionIds.push(created.submissionId);
  return created.submissionId;
};

const exists = async (id: string) =>
  (
    await db
      .select({ id: propertySubmissions.id })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id))
  ).length === 1;

const fileExists = (storagePath: string) =>
  storage()
    .download(storagePath)
    .then(
      () => true,
      () => false,
    );

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "propcompare-removal-"));
  await db.insert(users).values({
    id: userId,
    name: "Removal",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: developerName })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, createdSubmissionIds));
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.uploadedBy, userId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
  await rm(dir, { recursive: true, force: true });
});

describe("removeSubmission — never published", () => {
  it("deletes it with its fields, images, extraction attempt, brochure and files", async () => {
    const id = await newBrochureSubmission();
    await db.insert(propertySubmissionFields).values({
      submissionId: id,
      fieldKey: "property.name",
      value: "Gone",
    });
    const image = await addBrochurePageImage(deps(), {
      submissionId: id,
      uploadedBy: userId,
      pageNumber: 1,
      mediaType: "photo",
    });
    const [media] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, image.id));
    const [job] = await db
      .select({ documentId: ocrExtractionJobs.sourceDocumentId })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.submissionId, id));
    const [document] = await db
      .select({ path: sourceDocuments.gcsPath })
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, job.documentId));
    expect(await fileExists(media.gcsPath)).toBe(true);
    expect(await fileExists(document.path)).toBe(true);

    expect(await removeSubmission(deps(), { submissionId: id })).toEqual({
      outcome: "deleted",
    });

    expect(await exists(id)).toBe(false);
    expect(
      await db
        .select({ id: propertySubmissionFields.id })
        .from(propertySubmissionFields)
        .where(eq(propertySubmissionFields.submissionId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: propertySubmissionMedia.id })
        .from(propertySubmissionMedia)
        .where(eq(propertySubmissionMedia.submissionId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: sourceDocuments.id })
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, job.documentId)),
    ).toHaveLength(0);
    expect(await fileExists(media.gcsPath)).toBe(false);
    expect(await fileExists(document.path)).toBe(false);
  });

  it("deletes a rejected one too, and reports a missing one", async () => {
    const id = await newBrochureSubmission();
    await db
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, id));
    expect((await removeSubmission(deps(), { submissionId: id })).outcome).toBe(
      "deleted",
    );
    await expect(
      removeSubmission(deps(), { submissionId: randomUUID() }),
    ).rejects.toMatchObject({ code: "submission_not_found" });
  });

  it("refuses while a brochure read is running, and deletes nothing", async () => {
    const id = await newBrochureSubmission();
    await db
      .update(ocrExtractionJobs)
      .set({ status: "processing" })
      .where(eq(ocrExtractionJobs.submissionId, id));

    await expect(
      removeSubmission(deps(), { submissionId: id }),
    ).rejects.toBeInstanceOf(SubmissionRemovalError);
    expect(await exists(id)).toBe(true);

    await db
      .update(ocrExtractionJobs)
      .set({ status: "failed" })
      .where(eq(ocrExtractionJobs.submissionId, id));
    expect((await removeSubmission(deps(), { submissionId: id })).outcome).toBe(
      "deleted",
    );
  });

  it("keeps a picture file that another submission's image still points at", async () => {
    const first = await newBrochureSubmission();
    const image = await addBrochurePageImage(deps(), {
      submissionId: first,
      uploadedBy: userId,
      pageNumber: 2,
      mediaType: "photo",
    });
    const [media] = await db
      .select()
      .from(propertySubmissionMedia)
      .where(eq(propertySubmissionMedia.id, image.id));
    // A second submission whose image row uses the very same stored file, as an
    // edit's candidate does when the page is already live.
    const second = await newBrochureSubmission();
    await db.insert(propertySubmissionMedia).values({
      submissionId: second,
      mediaType: "photo",
      sourceKind: "developer_brochure",
      gcsPath: media.gcsPath,
      attribution: "shared",
      displayOrder: 0,
    });

    await removeSubmission(deps(), { submissionId: first });

    expect(await fileExists(media.gcsPath)).toBe(true);
    await removeSubmission(deps(), { submissionId: second });
    expect(await fileExists(media.gcsPath)).toBe(false);
  });
});

describe("removeSubmission — published", () => {
  it("archives it instead of deleting, keeps its first date, and restores it", async () => {
    const id = await newBrochureSubmission();
    await db
      .update(propertySubmissions)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(propertySubmissions.id, id));

    expect(await removeSubmission(deps(), { submissionId: id })).toEqual({
      outcome: "archived",
    });
    const [archived] = await db
      .select({ archivedAt: propertySubmissions.archivedAt })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id));
    expect(archived.archivedAt).not.toBeNull();

    await removeSubmission(deps(), { submissionId: id });
    const [again] = await db
      .select({ archivedAt: propertySubmissions.archivedAt })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id));
    expect(again.archivedAt?.getTime()).toBe(archived.archivedAt?.getTime());

    await restoreSubmission(db, { submissionId: id });
    const [restored] = await db
      .select({ archivedAt: propertySubmissions.archivedAt })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, id));
    expect(restored.archivedAt).toBeNull();
    await expect(
      restoreSubmission(db, { submissionId: id }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("leaves the archived one out of the queue but in the archived view", async () => {
    const id = await newBrochureSubmission();
    await db
      .update(propertySubmissions)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(propertySubmissions.id, id));

    const ids = async (archived: boolean) =>
      (await listSubmissionQueue(db, { archived })).map((row) => row.id);
    expect(await ids(false)).toContain(id);
    expect(await ids(true)).not.toContain(id);

    await removeSubmission(deps(), { submissionId: id });

    expect(await ids(false)).not.toContain(id);
    expect(await ids(true)).toContain(id);
    // Looking one up by id is never filtered.
    expect(await listSubmissionQueue(db, { id })).toHaveLength(1);
  });
});
