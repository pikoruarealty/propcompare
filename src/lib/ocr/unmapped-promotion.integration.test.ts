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

const testUserId = `promotion-test-user-${randomUUID()}`;
let submissionId: string;
let sourceDocumentId: string;
let jobId: string;

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Promotion Test User",
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
      gcsPath: "synthetic/promotion.pdf",
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
            label: "Project",
            pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
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

const evidence = (pageNumber: number, sourceSnippet: string) => ({
  scopeKey: "project",
  pageNumber,
  sourceSnippet,
});

describe("what a read found before a field existed for it", () => {
  it("becomes a reviewable candidate with its evidence, without replacing a field the read filled", async () => {
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
                evidence: [evidence(1, "Synthetic Residences")],
              },
              {
                fieldKey: "property.specifications.flooring",
                value: "Vitrified tiles (as read)",
                evidence: [evidence(2, "Vitrified tiles")],
              },
            ],
            unitVariants: [],
          },
          unmappedRawEvidence: [
            {
              fieldKey: "property.specifications.windows",
              value: "UPVC windows",
              scopeKey: "project",
              evidence: [evidence(2, "UPVC"), evidence(2, "UPVC windows")],
            },
            {
              // A raw key the catalog knows only as a synonym, and a list of places.
              fieldKey: "amenities.nearby_hospitals",
              value: [{ name: "Sterling Hospital", travel_time: "4 min" }],
              scopeKey: "project",
              evidence: [evidence(1, "Sterling Hospital 4 min")],
            },
            {
              // Already read by the extraction: the unmapped copy must not win.
              fieldKey: "property.specifications.flooring",
              value: "Marble (unmapped copy)",
              scopeKey: "project",
              evidence: [evidence(2, "Marble")],
            },
            {
              // Retired: never a destination.
              fieldKey: "property.specifications.lifts_per_tower",
              value: "3",
              scopeKey: "project",
              evidence: [evidence(2, "3 lifts")],
            },
            {
              // A fact no field holds stays unmapped.
              fieldKey: "unit.lobby_width",
              value: "3055 MM WIDE",
              scopeKey: "project",
              evidence: [evidence(2, "3055 MM")],
            },
          ],
          providerRequestIds: ["synthetic-promotion-1"],
        };
      },
    };

    await executeOcrExtractionJob({ jobId, adapter });

    const fields = await db
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    const byKey = new Map(fields.map((field) => [field.fieldKey, field]));

    expect([...byKey.keys()].sort()).toEqual([
      "property.name",
      "property.specifications.flooring",
      "property.specifications.nearby_hospitals",
      "property.specifications.windows",
    ]);
    expect(byKey.get("property.specifications.flooring")?.value).toBe(
      "Vitrified tiles (as read)",
    );
    expect(byKey.get("property.specifications.windows")?.value).toBe(
      "UPVC windows",
    );
    expect(byKey.get("property.specifications.nearby_hospitals")?.value).toBe(
      "Sterling Hospital 4 min",
    );
    for (const key of [
      "property.specifications.windows",
      "property.specifications.nearby_hospitals",
    ]) {
      // To be reviewed like anything read from a brochure.
      expect(byKey.get(key)?.reviewStatus).toBe("needs_review");
    }

    const windowsEvidence = await db
      .select()
      .from(propertySubmissionFieldEvidence)
      .where(
        eq(
          propertySubmissionFieldEvidence.submissionFieldId,
          byKey.get("property.specifications.windows")!.id,
        ),
      );
    // A page cited twice is one piece of evidence.
    expect(windowsEvidence).toHaveLength(1);
    expect(windowsEvidence[0]).toMatchObject({
      ocrExtractionJobId: jobId,
      sourceDocumentId,
      sourcePage: 2,
      valuePath: "$",
    });
  });
});
