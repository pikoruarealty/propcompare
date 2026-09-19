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
import { createBrochureSubmission } from "./brochure-upload";
import {
  buildConfirmedRoutingManifest,
  queueConfirmedOcr,
  RoutingConfirmationError,
  saveConfirmedRouting,
} from "./routing-confirmation";

let directory: string;
const userId = "routing-confirmation-" + randomUUID();
let developerId: string;
const submissionIds: string[] = [];

const makePdf = async (pageCount: number): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) {
    pdf.addPage([300, 400]);
  }
  return pdf.save();
};

const createDraft = async (pageCount: number) => {
  const created = await createBrochureSubmission(
    {
      database: db,
      storage: createLocalStorageAdapter({
        rootDir: directory,
        secret: "test",
      }),
    },
    { developerId, uploadedBy: userId, bytes: await makePdf(pageCount) },
  );
  submissionIds.push(created.submissionId);
  return created;
};

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "propcompare-routing-"));
  await db.insert(users).values({
    id: userId,
    name: "Routing Confirmation Test",
    email: userId + "@example.test",
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: "Routing Developer " + randomUUID() })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  for (const submissionId of submissionIds) {
    await db
      .delete(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
  }
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.uploadedBy, userId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
  await rm(directory, { recursive: true, force: true });
});

describe("buildConfirmedRoutingManifest", () => {
  it("creates the one v2 scope shape from complete page choices", () => {
    expect(
      buildConfirmedRoutingManifest(
        [
          { pageNumber: 1, category: "project_details" },
          { pageNumber: 2, category: "amenities" },
          { pageNumber: 3, category: "floor_plan" },
          { pageNumber: 4, category: "ignore" },
        ],
        4,
      ),
    ).toEqual({
      version: "v2",
      pageCount: 4,
      scopes: [
        {
          scopeKey: "project-details",
          kind: "property_details",
          label: "Project details",
          pages: [{ pageNumber: 1 }],
        },
        {
          scopeKey: "amenities",
          kind: "amenities",
          label: "Amenities",
          pages: [{ pageNumber: 2 }],
        },
        {
          scopeKey: "floor-plans",
          kind: "floor_plans",
          label: "Confirmed floor plans",
          pages: [{ pageNumber: 3 }],
        },
        {
          scopeKey: "ignored",
          kind: "ignore",
          label: "Not selected for extraction",
          pages: [{ pageNumber: 4 }],
        },
      ],
    });
  });

  it("rejects missing, duplicate, and all-ignore page choices", () => {
    expect(() =>
      buildConfirmedRoutingManifest(
        [{ pageNumber: 1, category: "project_details" }],
        2,
      ),
    ).toThrow(RoutingConfirmationError);
    expect(() =>
      buildConfirmedRoutingManifest(
        [
          { pageNumber: 1, category: "project_details" },
          { pageNumber: 1, category: "ignore" },
        ],
        2,
      ),
    ).toThrow("categorized more than once");
    expect(() =>
      buildConfirmedRoutingManifest(
        [
          { pageNumber: 1, category: "ignore" },
          { pageNumber: 2, category: "ignore" },
        ],
        2,
      ),
    ).toThrow("at least one extraction scope");
  });
});

describe("confirmed brochure routing", () => {
  it("persists a complete draft manifest, then freezes it by queueing", async () => {
    const created = await createDraft(3);
    const manifest = await saveConfirmedRouting(db, {
      ocrJobId: created.ocrJobId,
      pages: [
        { pageNumber: 1, category: "project_details" },
        { pageNumber: 2, category: "floor_plan" },
        { pageNumber: 3, category: "ignore" },
      ],
    });
    expect(manifest.version).toBe("v2");

    await queueConfirmedOcr(db, created.ocrJobId);
    const [job] = await db
      .select()
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, created.ocrJobId));
    expect(job.status).toBe("queued");
    expect(job.routingManifest).toEqual(manifest);

    await expect(
      saveConfirmedRouting(db, {
        ocrJobId: created.ocrJobId,
        pages: [
          { pageNumber: 1, category: "project_details" },
          { pageNumber: 2, category: "ignore" },
          { pageNumber: 3, category: "ignore" },
        ],
      }),
    ).rejects.toMatchObject({ code: "job_not_draft" });
    await expect(queueConfirmedOcr(db, created.ocrJobId)).rejects.toMatchObject(
      {
        code: "job_not_draft",
      },
    );
  });

  it("refuses to queue an untouched or all-ignore draft", async () => {
    const untouched = await createDraft(2);
    await expect(
      queueConfirmedOcr(db, untouched.ocrJobId),
    ).rejects.toMatchObject({
      code: "routing_unconfirmed",
    });

    const allIgnored = await createDraft(2);
    await expect(
      saveConfirmedRouting(db, {
        ocrJobId: allIgnored.ocrJobId,
        pages: [
          { pageNumber: 1, category: "ignore" },
          { pageNumber: 2, category: "ignore" },
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid_routing" });
    const [job] = await db
      .select({ status: ocrExtractionJobs.status })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, allIgnored.ocrJobId));
    expect(job.status).toBe("draft");
  });
});
