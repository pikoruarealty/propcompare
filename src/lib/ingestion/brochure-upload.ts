import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { PDFDocument } from "pdf-lib";
import {
  developers,
  ocrExtractionJobs,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import type { StorageAdapter } from "@/lib/storage/adapter";

/**
 * Turns an uploaded brochure PDF into its three starting records: an immutable
 * `source_documents` row, a draft `property_submissions` row for the developer,
 * and a draft `ocr_extraction_jobs` attempt whose page-routing manifest is still
 * empty. Nothing here calls the OCR provider — extraction is paid and only
 * starts after a human has confirmed page routing (DECISIONS.md 2026-09-19).
 *
 * The file is stored once under a generated key and never overwritten, so the
 * evidence a published fact cites cannot change underneath it. None of the
 * tables written here is a live catalog table.
 */

/** OCR contract versions a new attempt is created against. */
export const OCR_PIPELINE_VERSION = "ocr-openrouter-v1";
export const OCR_FIELD_SCHEMA_VERSION = "v5";

export const MAX_BROCHURE_BYTES = 100 * 1024 * 1024;
export const MAX_BROCHURE_PAGES = 300;

export type BrochureUploadErrorCode =
  | "not_a_pdf"
  | "too_large"
  | "too_many_pages"
  | "unreadable"
  | "developer_not_found";

export class BrochureUploadError extends Error {
  constructor(
    public readonly code: BrochureUploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BrochureUploadError";
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Validates the bytes are a readable, unencrypted PDF and counts its pages. */
export const inspectBrochurePdf = async (
  bytes: Uint8Array,
): Promise<{ pageCount: number }> => {
  if (bytes.byteLength > MAX_BROCHURE_BYTES) {
    throw new BrochureUploadError(
      "too_large",
      `The file is larger than ${MAX_BROCHURE_BYTES / 1024 / 1024} MB.`,
    );
  }
  if (!PDF_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new BrochureUploadError("not_a_pdf", "The file is not a PDF.");
  }

  let pageCount: number;
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    pageCount = document.getPageCount();
  } catch {
    throw new BrochureUploadError(
      "unreadable",
      "The PDF could not be read. It may be damaged or password-protected.",
    );
  }
  if (pageCount < 1) {
    throw new BrochureUploadError("unreadable", "The PDF has no pages.");
  }
  if (pageCount > MAX_BROCHURE_PAGES) {
    throw new BrochureUploadError(
      "too_many_pages",
      `The PDF has more than ${MAX_BROCHURE_PAGES} pages.`,
    );
  }
  return { pageCount };
};

export interface CreatedBrochureSubmission {
  sourceDocumentId: string;
  submissionId: string;
  ocrJobId: string;
  pageCount: number;
}

export const createBrochureSubmission = async (
  deps: { database: PostgresJsDatabase; storage: StorageAdapter },
  input: { developerId: string; uploadedBy: string; bytes: Uint8Array },
): Promise<CreatedBrochureSubmission> => {
  const { database, storage } = deps;

  const [developer] = await (/^[0-9a-f-]{36}$/i.test(input.developerId)
    ? database
        .select({ id: developers.id })
        .from(developers)
        .where(eq(developers.id, input.developerId))
        .limit(1)
    : Promise.resolve([]));
  if (!developer) {
    throw new BrochureUploadError(
      "developer_not_found",
      "That developer profile does not exist.",
    );
  }

  const { pageCount } = await inspectBrochurePdf(input.bytes);

  const objectKey = `source-documents/${randomUUID()}.pdf`;
  await storage.upload({
    path: objectKey,
    body: input.bytes,
    contentType: "application/pdf",
  });

  try {
    return await database.transaction(async (tx) => {
      const [document] = await tx
        .insert(sourceDocuments)
        .values({
          documentType: "brochure_pdf",
          gcsPath: objectKey,
          uploadedBy: input.uploadedBy,
          pageCount,
        })
        .returning({ id: sourceDocuments.id });

      const [submission] = await tx
        .insert(propertySubmissions)
        .values({
          developerId: input.developerId,
          submittedBy: input.uploadedBy,
          source: "ocr_brochure",
          status: "draft",
          payload: {},
        })
        .returning({ id: propertySubmissions.id });

      const [job] = await tx
        .insert(ocrExtractionJobs)
        .values({
          sourceDocumentId: document.id,
          submissionId: submission.id,
          status: "draft",
          pipelineVersion: OCR_PIPELINE_VERSION,
          fieldSchemaVersion: OCR_FIELD_SCHEMA_VERSION,
          // Empty until a human confirms page routing; it cannot pass
          // `parseOcrRoutingManifest` and so cannot be queued by accident.
          routingManifest: { version: "v1", pageCount, scopes: [] },
        })
        .returning({ id: ocrExtractionJobs.id });

      return {
        sourceDocumentId: document.id,
        submissionId: submission.id,
        ocrJobId: job.id,
        pageCount,
      };
    });
  } catch (cause) {
    // Do not leave an orphaned file behind a rolled-back transaction.
    await storage.delete(objectKey).catch(() => undefined);
    throw cause;
  }
};
