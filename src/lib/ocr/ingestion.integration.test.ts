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
import { OcrAdapterError, type OcrProviderAdapter } from "./adapter";
import { executeOcrExtractionJob } from "./ingestion";

const testUserId = `ocr-test-user-${randomUUID()}`;
let submissionId: string;
let sourceDocumentId: string;
let jobId: string;

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "OCR Synthetic Test User",
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
      gcsPath: "synthetic/redacted-brochure.pdf",
      uploadedBy: testUserId,
      pageCount: 2,
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
      routingManifest: {
        version: "v1",
        pageCount: 2,
        scopes: [
          {
            scopeKey: "project",
            kind: "property_details",
            label: "Synthetic project details",
            pages: [{ pageNumber: 1 }],
          },
          {
            scopeKey: "ignored",
            kind: "ignore",
            label: "Synthetic ignored page",
            pages: [{ pageNumber: 2 }],
          },
        ],
      },
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

describe("executeOcrExtractionJob", () => {
  it("turns a confirmed synthetic manifest into reviewable evidence rows", async () => {
    const adapter: OcrProviderAdapter = {
      providerKey: "synthetic:test",
      async extract(request) {
        return {
          extraction: {
            origin: "new_pipeline",
            pipelineVersion: request.pipelineVersion,
            fieldSchemaVersion: request.fieldSchemaVersion,
            fields: [
              {
                fieldKey: "property.name",
                value: "Synthetic Residences",
                confidence: 0.99,
                evidence: [
                  {
                    scopeKey: "project",
                    pageNumber: 1,
                    sourceSnippet: "Synthetic Residences",
                  },
                ],
              },
            ],
            unitVariants: [],
          },
          unmappedRawEvidence: [],
          providerRequestIds: ["synthetic-generation-1"],
        };
      },
    };

    const result = await executeOcrExtractionJob({ jobId, adapter });

    expect(result.unmappedRawEvidence).toEqual([]);
    const [field] = await db
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    expect(field.fieldKey).toBe("property.name");
    expect(field.value).toBe("Synthetic Residences");
    expect(field.reviewStatus).toBe("needs_review");

    const evidence = await db
      .select()
      .from(propertySubmissionFieldEvidence)
      .where(eq(propertySubmissionFieldEvidence.submissionFieldId, field.id));
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      ocrExtractionJobId: jobId,
      sourceDocumentId,
      sourcePage: 1,
      valuePath: "$",
      sourceSnippet: "Synthetic Residences",
    });

    const [job] = await db
      .select()
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, jobId));
    expect(job.status).toBe("completed");
    expect(job.providerKey).toBe("synthetic:test");
    expect(job.providerJobId).toBe("synthetic-generation-1");
  });

  it("marks the attempt failed when the provider exhausts its output budget", async () => {
    const [failedJob] = await db
      .insert(ocrExtractionJobs)
      .values({
        sourceDocumentId,
        submissionId,
        status: "queued",
        pipelineVersion: "ocr-openrouter-v1",
        fieldSchemaVersion: "v5",
        routingManifest: {
          version: "v1",
          pageCount: 2,
          scopes: [
            {
              scopeKey: "project",
              kind: "property_details",
              label: "Synthetic project details",
              pages: [{ pageNumber: 1 }],
            },
            {
              scopeKey: "ignored",
              kind: "ignore",
              label: "Synthetic ignored page",
              pages: [{ pageNumber: 2 }],
            },
          ],
        },
      })
      .returning({ id: ocrExtractionJobs.id });
    const adapter: OcrProviderAdapter = {
      providerKey: "synthetic:test",
      async extract() {
        throw new OcrAdapterError(
          "output_length",
          "Synthetic output truncation",
        );
      },
    };

    await expect(
      executeOcrExtractionJob({ jobId: failedJob.id, adapter }),
    ).rejects.toMatchObject({ code: "output_length" });

    const [job] = await db
      .select()
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, failedJob.id));
    expect(job.status).toBe("failed");
    expect(job.errorCode).toBe("output_length");
    expect(job.errorMessage).toContain("Synthetic output truncation");
  });
});
