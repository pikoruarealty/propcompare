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
import type { PageRouter } from "@/lib/ocr/page-router";
import { createLocalStorageAdapter } from "@/lib/storage/local-adapter";
import { createBrochureSubmission } from "./brochure-upload";
import {
  PageSuggestionError,
  readStoredSuggestions,
  runPageRouting,
} from "./page-suggestions";

let dir: string;
const userId = `suggest-test-${randomUUID()}`;
let developerId: string;
let submissionId: string;
let ocrJobId: string;

const fakeRouter = (calls: { count: number }): PageRouter => ({
  model: "fake/router",
  async route() {
    calls.count += 1;
    return {
      model: "fake/router",
      suggestions: [
        {
          page: 1,
          category: "project_details",
          confidence: 0.9,
          imagery: ["exterior_render"],
        },
        {
          page: 2,
          category: "floor_plan",
          confidence: 0.4,
          imagery: ["floor_plan"],
          caption: "2 BHK",
        },
      ],
      usage: {
        requests: 1,
        promptTokens: 10,
        completionTokens: 5,
        perRequest: [{ promptTokens: 10, completionTokens: 5 }],
      },
    };
  },
});

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "propcompare-suggest-"));
  await db.insert(users).values({
    id: userId,
    name: "Suggest Test",
    email: `${userId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Suggest Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;

  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  pdf.addPage([300, 400]);
  const created = await createBrochureSubmission(
    {
      database: db,
      storage: createLocalStorageAdapter({ rootDir: dir, secret: "s" }),
    },
    { developerId, uploadedBy: userId, bytes: await pdf.save() },
  );
  submissionId = created.submissionId;
  ocrJobId = created.ocrJobId;
});

afterAll(async () => {
  await db
    .delete(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.uploadedBy, userId));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, userId));
  await rm(dir, { recursive: true, force: true });
});

describe("runPageRouting", () => {
  it("stores suggestions on the draft manifest without making it a confirmed route", async () => {
    const storage = createLocalStorageAdapter({ rootDir: dir, secret: "s" });
    const calls = { count: 0 };
    const stored = await runPageRouting(
      { database: db, storage, router: fakeRouter(calls) },
      { ocrJobId },
    );
    expect(stored.pages).toHaveLength(2);

    const [job] = await db
      .select()
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, ocrJobId));
    expect(job.status).toBe("draft");
    const manifest = job.routingManifest as { scopes: unknown[] };
    expect(manifest.scopes).toEqual([]);
    expect(readStoredSuggestions(job.routingManifest)?.pages[1]).toMatchObject({
      category: "floor_plan",
      caption: "2 BHK",
    });
    // Usage is kept for operations but never returned to a screen.
    expect(
      JSON.stringify(readStoredSuggestions(job.routingManifest)),
    ).not.toMatch(/promptTokens/);
  });

  it("refuses to pay for a second run unless asked to replace", async () => {
    const storage = createLocalStorageAdapter({ rootDir: dir, secret: "s" });
    const calls = { count: 0 };
    await expect(
      runPageRouting(
        { database: db, storage, router: fakeRouter(calls) },
        { ocrJobId },
      ),
    ).rejects.toMatchObject({ code: "already_suggested" });
    expect(calls.count).toBe(0);

    await runPageRouting(
      { database: db, storage, router: fakeRouter(calls) },
      { ocrJobId, replaceExisting: true },
    );
    expect(calls.count).toBe(1);
  });

  it("reports an unknown attempt and an attempt that is no longer a draft", async () => {
    const storage = createLocalStorageAdapter({ rootDir: dir, secret: "s" });
    const calls = { count: 0 };
    await expect(
      runPageRouting(
        { database: db, storage, router: fakeRouter(calls) },
        { ocrJobId: randomUUID() },
      ),
    ).rejects.toBeInstanceOf(PageSuggestionError);

    await db
      .update(ocrExtractionJobs)
      .set({ status: "queued" })
      .where(eq(ocrExtractionJobs.id, ocrJobId));
    await expect(
      runPageRouting(
        { database: db, storage, router: fakeRouter(calls) },
        { ocrJobId, replaceExisting: true },
      ),
    ).rejects.toMatchObject({ code: "job_not_draft" });
    expect(calls.count).toBe(0);
  });
});

describe("readStoredSuggestions", () => {
  it("returns null when there is nothing usable and drops malformed entries", () => {
    expect(readStoredSuggestions({ scopes: [] })).toBeNull();
    expect(readStoredSuggestions(null)).toBeNull();
    expect(
      readStoredSuggestions({
        suggestions: {
          model: "m",
          generatedAt: "t",
          pages: [
            { page: 1, category: "nope", confidence: 1 },
            { page: 2, category: "other", confidence: 0.5, imagery: ["x"] },
          ],
        },
      })?.pages,
    ).toEqual([{ page: 2, category: "other", confidence: 0.5, imagery: [] }]);
  });
});
