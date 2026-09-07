import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  amenityCatalog,
  ocrExtractionJobs,
  propertyTypes,
  propertySchemaFields,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  sourceDocuments,
} from "@/db/schema/catalog";
import {
  buildSubmissionFieldCandidates,
  OcrAdapterError,
  type ActiveOcrField,
  type OcrExtractionRequest,
  type OcrProviderAdapter,
  type OcrProviderExtractionResult,
} from "./adapter";
import { parseOcrRoutingManifest } from "./routing";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class OcrIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrIngestionError";
  }
}

/**
 * Keeps a successfully parsed provider result reachable when only persistence
 * fails. Call retryOcrExtractionPersistence(error.jobId, error.result) to retry
 * the database transaction without making another provider request.
 */
export class OcrPersistenceError extends OcrIngestionError {
  constructor(
    public readonly jobId: string,
    public readonly result: OcrProviderExtractionResult,
    public readonly persistenceCause: unknown,
  ) {
    super(`OCR extraction succeeded but persistence failed for job ${jobId}`);
    this.name = "OcrPersistenceError";
  }
}

const markJobFailed = async (
  jobId: string,
  errorCode: string,
  errorMessage: string,
): Promise<void> => {
  await db
    .update(ocrExtractionJobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorCode,
      errorMessage: errorMessage.slice(0, 4_000),
    })
    .where(eq(ocrExtractionJobs.id, jobId));
};

export const persistOcrExtractionResult = async (
  tx: Tx,
  params: {
    jobId: string;
    sourceDocumentId: string;
    submissionId: string;
    manifest: OcrExtractionRequest["manifest"];
    result: OcrProviderExtractionResult;
  },
): Promise<void> => {
  const candidates = buildSubmissionFieldCandidates(
    params.result.extraction,
    params.manifest,
  );

  for (const candidate of candidates) {
    const [submissionField] = await tx
      .insert(propertySubmissionFields)
      .values({
        submissionId: params.submissionId,
        fieldKey: candidate.fieldKey,
        value: candidate.value,
        confidence:
          candidate.confidence === undefined
            ? null
            : String(candidate.confidence),
        reviewStatus: "needs_review",
      })
      .onConflictDoNothing()
      .returning({ id: propertySubmissionFields.id });

    if (!submissionField) {
      throw new OcrIngestionError(
        `submission field already exists and was not overwritten: ${candidate.fieldKey}`,
      );
    }
    if (candidate.evidence.length === 0) {
      throw new OcrIngestionError(
        `submission field has no evidence: ${candidate.fieldKey}`,
      );
    }
    await tx.insert(propertySubmissionFieldEvidence).values(
      candidate.evidence.map((evidence) => ({
        submissionFieldId: submissionField.id,
        ocrExtractionJobId: params.jobId,
        sourceDocumentId: params.sourceDocumentId,
        sourcePage: evidence.pageNumber,
        valuePath: evidence.valuePath,
        sourceSnippet: evidence.sourceSnippet ?? null,
      })),
    );
  }
};

export const retryOcrExtractionPersistence = async (params: {
  jobId: string;
  result: OcrProviderExtractionResult;
}): Promise<OcrProviderExtractionResult> => {
  const [job] = await db
    .select({
      id: ocrExtractionJobs.id,
      sourceDocumentId: ocrExtractionJobs.sourceDocumentId,
      submissionId: ocrExtractionJobs.submissionId,
      status: ocrExtractionJobs.status,
      errorCode: ocrExtractionJobs.errorCode,
      routingManifest: ocrExtractionJobs.routingManifest,
      pageCount: sourceDocuments.pageCount,
    })
    .from(ocrExtractionJobs)
    .innerJoin(
      sourceDocuments,
      eq(ocrExtractionJobs.sourceDocumentId, sourceDocuments.id),
    )
    .where(eq(ocrExtractionJobs.id, params.jobId));

  if (!job) {
    throw new OcrIngestionError(`OCR job not found: ${params.jobId}`);
  }
  if (
    job.status !== "processing" &&
    !(
      job.status === "failed" && job.errorCode === "evidence_persistence_failed"
    )
  ) {
    throw new OcrIngestionError(
      `OCR persistence retry requires a processing job or an evidence_persistence_failed job, received ${job.status}`,
    );
  }

  const manifest = parseOcrRoutingManifest(
    job.routingManifest,
    job.pageCount ?? undefined,
  );
  try {
    await db.transaction(async (tx) => {
      const [lockedJob] = await tx
        .select({
          status: ocrExtractionJobs.status,
          errorCode: ocrExtractionJobs.errorCode,
        })
        .from(ocrExtractionJobs)
        .where(eq(ocrExtractionJobs.id, job.id))
        .for("update");
      if (
        lockedJob?.status !== "processing" &&
        !(
          lockedJob?.status === "failed" &&
          lockedJob.errorCode === "evidence_persistence_failed"
        )
      ) {
        throw new OcrIngestionError(
          "OCR job is not eligible for persistence; evidence was not written",
        );
      }
      if (lockedJob.status === "failed") {
        await tx
          .update(ocrExtractionJobs)
          .set({
            status: "processing",
            completedAt: null,
            errorCode: null,
            errorMessage: null,
          })
          .where(eq(ocrExtractionJobs.id, job.id));
      }
      await persistOcrExtractionResult(tx, {
        jobId: job.id,
        sourceDocumentId: job.sourceDocumentId,
        submissionId: job.submissionId,
        manifest,
        result: params.result,
      });
      await tx
        .update(ocrExtractionJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          providerJobId: params.result.providerRequestIds[0] ?? null,
          errorCode: null,
          errorMessage: null,
        })
        .where(eq(ocrExtractionJobs.id, job.id));
    });
  } catch (error) {
    await markJobFailed(job.id, "evidence_persistence_failed", String(error));
    throw new OcrPersistenceError(job.id, params.result, error);
  }

  return params.result;
};

export const executeOcrExtractionJob = async (params: {
  jobId: string;
  adapter: OcrProviderAdapter;
}): Promise<OcrProviderExtractionResult> => {
  const [job] = await db
    .select({
      id: ocrExtractionJobs.id,
      sourceDocumentId: ocrExtractionJobs.sourceDocumentId,
      submissionId: ocrExtractionJobs.submissionId,
      status: ocrExtractionJobs.status,
      pipelineVersion: ocrExtractionJobs.pipelineVersion,
      fieldSchemaVersion: ocrExtractionJobs.fieldSchemaVersion,
      routingManifest: ocrExtractionJobs.routingManifest,
      gcsPath: sourceDocuments.gcsPath,
      pageCount: sourceDocuments.pageCount,
    })
    .from(ocrExtractionJobs)
    .innerJoin(
      sourceDocuments,
      eq(ocrExtractionJobs.sourceDocumentId, sourceDocuments.id),
    )
    .where(eq(ocrExtractionJobs.id, params.jobId));

  if (!job) throw new OcrIngestionError(`OCR job not found: ${params.jobId}`);
  if (job.status !== "draft" && job.status !== "queued") {
    throw new OcrIngestionError(
      `OCR job must be draft or queued, received ${job.status}`,
    );
  }

  const manifest = parseOcrRoutingManifest(
    job.routingManifest,
    job.pageCount ?? undefined,
  );
  const activeFields: ActiveOcrField[] = await db
    .select({
      fieldKey: propertySchemaFields.fieldKey,
      dataType: propertySchemaFields.dataType,
    })
    .from(propertySchemaFields)
    .where(eq(propertySchemaFields.isActive, true));
  const propertyTypeRows = await db
    .select({ key: propertyTypes.key })
    .from(propertyTypes);
  const amenityRows = await db
    .select({ key: amenityCatalog.key })
    .from(amenityCatalog);
  const activeFieldsWithVocabularies = activeFields.map((field) => {
    if (field.fieldKey === "property.type") {
      return {
        ...field,
        allowedValues: propertyTypeRows.map((row) => row.key),
      };
    }
    if (field.fieldKey === "property.amenities") {
      return {
        ...field,
        allowedValues: amenityRows.map((row) => row.key),
      };
    }
    return field;
  });
  const request: OcrExtractionRequest = {
    jobId: job.id,
    sourceDocumentId: job.sourceDocumentId,
    gcsPath: job.gcsPath,
    manifest,
    pipelineVersion: job.pipelineVersion,
    fieldSchemaVersion: job.fieldSchemaVersion,
    activeFields: activeFieldsWithVocabularies,
  };

  const processingRows = await db
    .update(ocrExtractionJobs)
    .set({
      status: "processing",
      providerKey: params.adapter.providerKey,
      startedAt: new Date(),
      completedAt: null,
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(ocrExtractionJobs.id, job.id),
        eq(ocrExtractionJobs.status, job.status),
      ),
    )
    .returning({ id: ocrExtractionJobs.id });
  if (processingRows.length === 0) {
    throw new OcrIngestionError("OCR job status changed before extraction");
  }

  let result: OcrProviderExtractionResult;
  try {
    result = await params.adapter.extract(request);
  } catch (error) {
    const code =
      error instanceof OcrAdapterError ? error.code : "unexpected_error";
    await markJobFailed(job.id, code, String(error));
    throw error;
  }

  return retryOcrExtractionPersistence({ jobId: job.id, result });
};
