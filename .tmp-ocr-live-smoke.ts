import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { users } from "./src/db/schema/auth";
import {
  ocrExtractionJobs,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  propertySubmissions,
  sourceDocuments,
} from "./src/db/schema/catalog";
import { createOpenRouterOcrAdapter } from "./src/lib/ocr/adapter";
import { executeOcrExtractionJob } from "./src/lib/ocr/ingestion";

const brochurePath =
  "C:\\Users\\Bhavarth\\AppData\\Local\\Temp\\claude\\d--Pikorua-PropCompare\\7a63ffcc-e475-470c-8324-5c679f2db749\\scratchpad\\ocr-eval\\brochures\\Adani Amaris Brochure.pdf";
const allPages = Array.from({ length: 69 }, (_, index) => index + 1);
const projectPages = [3, 25, 26, 29, 34, 67, 69];
const amenityPages = [12, 14, 18, 22, 32, 66];
const specificationPages = [64, 65];
const variantPages = [29, 39, 41];
const extractedPages = new Set([
  ...projectPages,
  ...amenityPages,
  ...specificationPages,
  ...variantPages,
]);
const ignoredPages = allPages.filter((page) => !extractedPages.has(page));

const testUserId = `ocr-live-smoke-${randomUUID()}`;
let submissionId: string | undefined;
let sourceDocumentId: string | undefined;
let jobId: string | undefined;

const uploadMetrics: Array<{
  scope: string;
  bytes: number;
}> = [];

const measuredFetch: typeof fetch = async (input, init) => {
  const request = JSON.parse(String(init?.body)) as {
    messages: Array<{
      content: Array<{
        file?: { filename: string; file_data: string };
      }>;
    }>;
  };
  const file = request.messages[0].content[0].file;
  if (file) {
    const encoded = file.file_data.split(",", 2)[1] ?? "";
    const metric = {
      scope: file.filename.replace(/\.pdf$/, ""),
      bytes: Math.floor((encoded.length * 3) / 4),
    };
    uploadMetrics.push(metric);
    console.info(`scope_upload_started=${JSON.stringify(metric)}`);
  }
  return fetch(input, init);
};

try {
  const brochure = await readFile(brochurePath);
  console.info(`source_pdf_bytes=${brochure.byteLength}`);

  await db.insert(users).values({
    id: testUserId,
    name: "OCR Live Smoke Test",
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
      gcsPath: brochurePath,
      uploadedBy: testUserId,
      pageCount: 69,
    })
    .returning({ id: sourceDocuments.id });
  sourceDocumentId = document.id;

  const [job] = await db
    .insert(ocrExtractionJobs)
    .values({
      sourceDocumentId,
      submissionId,
      status: "queued",
      pipelineVersion: "openrouter-claude-sonnet-5-v1",
      fieldSchemaVersion: "v5",
      routingManifest: {
        version: "v1",
        pageCount: 69,
        scopes: [
          {
            scopeKey: "project",
            kind: "property_details",
            label: "Project, location, structure, developer, and legal details",
            pages: projectPages.map((pageNumber) => ({ pageNumber })),
          },
          {
            scopeKey: "amenities",
            kind: "amenities",
            label: "Amenity lists",
            pages: amenityPages.map((pageNumber) => ({ pageNumber })),
          },
          {
            scopeKey: "specifications",
            kind: "specifications",
            label: "Construction specifications",
            pages: specificationPages.map((pageNumber) => ({ pageNumber })),
          },
          {
            scopeKey: "tower-a-type-a",
            kind: "unit_variant",
            label: "Tower A 4 BHK Type A",
            pages: variantPages.map((pageNumber) => ({ pageNumber })),
            variant: {
              variantName: "Tower A - 4 BHK Type A",
              bhkTypeKey: "4bhk",
            },
          },
          {
            scopeKey: "ignored",
            kind: "ignore",
            label: "Pages outside this representative smoke run",
            pages: ignoredPages.map((pageNumber) => ({ pageNumber })),
          },
        ],
      },
    })
    .returning({ id: ocrExtractionJobs.id });
  jobId = job.id;

  const adapter = createOpenRouterOcrAdapter({
    loadSourcePdf: async () => brochure,
    fetch: measuredFetch,
  });
  const result = await executeOcrExtractionJob({ jobId, adapter });

  const fields = await db
    .select({
      id: propertySubmissionFields.id,
      fieldKey: propertySubmissionFields.fieldKey,
      value: propertySubmissionFields.value,
      confidence: propertySubmissionFields.confidence,
      reviewStatus: propertySubmissionFields.reviewStatus,
    })
    .from(propertySubmissionFields)
    .where(eq(propertySubmissionFields.submissionId, submissionId));
  const evidence = await db
    .select({
      submissionFieldId: propertySubmissionFieldEvidence.submissionFieldId,
      sourcePage: propertySubmissionFieldEvidence.sourcePage,
      valuePath: propertySubmissionFieldEvidence.valuePath,
    })
    .from(propertySubmissionFieldEvidence)
    .where(eq(propertySubmissionFieldEvidence.ocrExtractionJobId, jobId));
  const [storedJob] = await db
    .select({
      status: ocrExtractionJobs.status,
      providerKey: ocrExtractionJobs.providerKey,
      providerJobId: ocrExtractionJobs.providerJobId,
      errorCode: ocrExtractionJobs.errorCode,
    })
    .from(ocrExtractionJobs)
    .where(eq(ocrExtractionJobs.id, jobId));

  console.info(`scope_uploads=${JSON.stringify(uploadMetrics)}`);
  console.info(
    `provider_request_ids=${JSON.stringify(result.providerRequestIds)}`,
  );
  console.info(`provider_usage=${JSON.stringify(result.usage ?? [])}`);
  console.info(`checkpoint_path=${result.checkpointPath ?? "none"}`);
  console.info(`job=${JSON.stringify(storedJob)}`);
  console.info(`db_submission_field_count=${fields.length}`);
  console.info(`db_evidence_row_count=${evidence.length}`);
  console.info(
    `db_fields=${JSON.stringify(
      fields.map((field) => ({
        fieldKey: field.fieldKey,
        value: field.value,
        confidence: field.confidence,
        reviewStatus: field.reviewStatus,
        evidenceRows: evidence.filter(
          (item) => item.submissionFieldId === field.id,
        ).length,
      })),
    )}`,
  );
  console.info(
    `unmapped_field_keys=${JSON.stringify(result.unmappedRawEvidence.map((item) => item.fieldKey))}`,
  );
} catch (error) {
  console.error(
    `live_smoke_error=${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
  );
  if (jobId) {
    const [storedJob] = await db
      .select({
        status: ocrExtractionJobs.status,
        errorCode: ocrExtractionJobs.errorCode,
        errorMessage: ocrExtractionJobs.errorMessage,
      })
      .from(ocrExtractionJobs)
      .where(eq(ocrExtractionJobs.id, jobId));
    console.error(`failed_job=${JSON.stringify(storedJob)}`);
  }
  process.exitCode = 1;
} finally {
  if (submissionId) {
    await db
      .delete(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
  }
  if (sourceDocumentId) {
    await db
      .delete(sourceDocuments)
      .where(eq(sourceDocuments.id, sourceDocumentId));
  }
  await db.delete(users).where(eq(users.id, testUserId));
  console.info("temporary_db_rows_removed=true");
  process.exit();
}
