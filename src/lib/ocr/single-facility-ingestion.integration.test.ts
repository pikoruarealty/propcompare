import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  ocrExtractionJobs,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import type { OcrProviderAdapter } from "./adapter";
import { executeOcrExtractionJob } from "./ingestion";
import { isRouterEvidence } from "./single-facility";

/**
 * A single-facility page's amenity reaches the review screen as an unconfirmed
 * suggestion with router-labelled evidence, and its page is never sent to the
 * (paid) read. Synthetic adapter: nothing here calls a provider.
 */

const testUserId = `single-facility-${randomUUID()}`;
let submissionId: string;
let sourceDocumentId: string;
let jobId: string;

const manifest = {
  version: "v2",
  pageCount: 3,
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
      pages: [{ pageNumber: 1 }],
    },
    {
      scopeKey: "ignored",
      kind: "ignore",
      label: "Not selected for extraction",
      pages: [{ pageNumber: 2, label: "Swimming Pool" }, { pageNumber: 3 }],
    },
  ],
  singleFacilities: [
    {
      pageNumber: 2,
      caption: "Swimming Pool",
      amenityKey: "swimming_pool",
      amenityLabel: "Swimming pool",
    },
  ],
};

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Single Facility Test User",
    email: `${testUserId}@example.test`,
  });
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      submittedBy: testUserId,
      source: "ocr_brochure",
      status: "draft",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  submissionId = submission.id;
  const [document] = await db
    .insert(sourceDocuments)
    .values({
      documentType: "brochure_pdf",
      gcsPath: "synthetic/single-facility.pdf",
      uploadedBy: testUserId,
      pageCount: 3,
    })
    .returning({ id: sourceDocuments.id });
  sourceDocumentId = document.id;
  const [job] = await db
    .insert(ocrExtractionJobs)
    .values({
      sourceDocumentId,
      submissionId,
      status: "queued",
      pipelineVersion: "ocr-openrouter-v1",
      fieldSchemaVersion: "v5",
      routingManifest: manifest,
    })
    .returning({ id: ocrExtractionJobs.id });
  jobId = job.id;
});

afterAll(async () => {
  await db
    .delete(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  await db
    .delete(sourceDocuments)
    .where(eq(sourceDocuments.id, sourceDocumentId));
  await db.delete(users).where(eq(users.id, testUserId));
});

describe("a single-facility page during extraction", () => {
  it("is never sent to the read, and arrives as an unconfirmed amenity suggestion with router evidence", async () => {
    let sentPages: number[] = [];
    const adapter: OcrProviderAdapter = {
      providerKey: "synthetic:test",
      async extract(request) {
        sentPages = request.manifest.scopes
          .filter((scope) => scope.kind !== "ignore")
          .flatMap((scope) => scope.pages.map((page) => page.pageNumber));
        return {
          extraction: {
            origin: "new_pipeline",
            pipelineVersion: request.pipelineVersion,
            fieldSchemaVersion: request.fieldSchemaVersion,
            fields: [
              {
                fieldKey: "property.amenities",
                value: ["clubhouse"],
                confidence: 0.9,
                evidence: [
                  {
                    scopeKey: "amenities",
                    pageNumber: 1,
                    sourceSnippet: "Clubhouse",
                  },
                ],
              },
            ],
            unitVariants: [],
          },
          unmappedRawEvidence: [],
          providerRequestIds: ["synthetic-single-facility"],
        };
      },
    };

    await executeOcrExtractionJob({ jobId, adapter });

    // The suggested page is not among the pages the read was given.
    expect(sentPages).toEqual([1, 1]);
    const [field] = await db
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    expect(field.fieldKey).toBe("property.amenities");
    expect(field.value).toEqual(["clubhouse", "swimming_pool"]);
    // Never accepted on its own: a person still has to confirm the field.
    expect(field.reviewStatus).toBe("needs_review");

    const evidence = await db
      .select()
      .from(propertySubmissionFieldEvidence)
      .where(eq(propertySubmissionFieldEvidence.submissionFieldId, field.id));
    const router = evidence.find((row) => row.sourcePage === 2);
    expect(router?.ocrExtractionJobId).toBe(jobId);
    expect(isRouterEvidence(router?.sourceSnippet)).toBe(true);
    expect(evidence.find((row) => row.sourcePage === 1)?.sourceSnippet).toBe(
      "Clubhouse",
    );
  });
});
