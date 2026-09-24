import {
  EDIT_ONLY_FIELD_KEYS,
  MAIN_PHOTO_FIELD_KEY,
  MAP_URL_FIELD_KEY,
  RERA_ONLY_FIELD_KEYS,
} from "@/lib/submissions/edit-only-fields";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { db } from "@/db";
import {
  amenityCatalog,
  bhkTypes,
  ocrExtractionJobs,
  propertyTypes,
  propertySchemaFields,
  propertySubmissions,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  sourceDocuments,
} from "@/db/schema/catalog";
import {
  buildSubmissionFieldCandidates,
  OcrAdapterError,
  partialUsageOf,
  type ActiveOcrField,
  type OcrExtractionRequest,
  type OcrProviderAdapter,
  type OcrProviderExtractionResult,
} from "./adapter";
import { parseOcrRoutingManifest } from "./routing";
import {
  recordAiUsage,
  splitProviderKey,
  type AiUsageInput,
} from "@/lib/usage/ledger";
import { storageAdapter } from "@/lib/storage";
import { autoMapFloorPlanImages } from "@/lib/submissions/floor-plan-auto-map";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class OcrIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrIngestionError";
  }
}

/** Another worker (or an admin action) took the job first; nothing was run. */
export class OcrJobNotClaimedError extends OcrIngestionError {
  constructor(message: string) {
    super(message);
    this.name = "OcrJobNotClaimedError";
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
        // A unit variant's scopeKey resolves against the manifest floor-plan
        // unit discovery actually produced, not the confirmed manifest's own
        // single floor-plans scope — see `OcrProviderExtractionResult.effectiveManifest`.
        manifest: params.result.effectiveManifest ?? manifest,
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

  // Best effort, after the extraction is safely stored: a failure here costs an
  // admin one manual "Use as image", and must never turn a finished, paid-for
  // extraction into a failed one.
  await tieFloorPlanImages(job.submissionId, params.result, manifest).catch(
    (error) => {
      console.error("Floor-plan image mapping failed:", error);
    },
  );

  return params.result;
};

/**
 * Offers each discovered unit type's floor-plan page as a needs-review image
 * candidate (`autoMapFloorPlanImages`), keyed on the router's page captions.
 */
const tieFloorPlanImages = async (
  submissionId: string,
  result: OcrProviderExtractionResult,
  confirmedManifest: OcrExtractionRequest["manifest"],
): Promise<void> => {
  const manifest = result.effectiveManifest ?? confirmedManifest;
  const pages = manifest.scopes
    .filter(
      (scope) => scope.kind === "floor_plans" || scope.kind === "unit_variant",
    )
    .flatMap((scope) => scope.pages);
  const variants = result.extraction.unitVariants.flatMap((variant) =>
    variant.variantName
      ? [
          {
            variantName: variant.variantName,
            evidencePages: variant.evidence.map((item) => item.pageNumber),
          },
        ]
      : [],
  );
  if (pages.length === 0 || variants.length === 0) return;
  await autoMapFloorPlanImages(
    { database: db, storage: storageAdapter },
    { submissionId, variants, pages },
  );
};

export const executeOcrExtractionJob = async (params: {
  jobId: string;
  adapter: OcrProviderAdapter;
  /** The admin who started the run, for the usage ledger. */
  requestedBy?: string;
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
    throw new OcrJobNotClaimedError(
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
    // A legal entity is chosen by an admin from recorded entities; a brochure
    // can name a company but cannot know which record it is. The fields that
    // change a live listing (removals, listing status) are an admin's decisions
    // and are never asked of the model, and neither are fields only a
    // regulator's own record can state (RERA_ONLY_FIELD_KEYS).
    .where(
      and(
        eq(propertySchemaFields.isActive, true),
        ne(propertySchemaFields.dataType, "legal_entity_id"),
        notInArray(propertySchemaFields.fieldKey, [
          ...EDIT_ONLY_FIELD_KEYS,
          MAIN_PHOTO_FIELD_KEY,
          MAP_URL_FIELD_KEY,
          ...RERA_ONLY_FIELD_KEYS,
        ]),
      ),
    );
  const propertyTypeRows = await db
    .select({ key: propertyTypes.key })
    .from(propertyTypes);
  const amenityRows = await db
    .select({ key: amenityCatalog.key })
    .from(amenityCatalog);
  const bhkTypeRows = await db.select({ key: bhkTypes.key }).from(bhkTypes);
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
    // The BHK catalog's own keys, so a floor plan whose heading prints the
    // configuration can carry it into review instead of arriving blank. The
    // adapter accepts a key only when it appears here.
    if (field.fieldKey === "unit_variants") {
      return { ...field, allowedValues: bhkTypeRows.map((row) => row.key) };
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
    throw new OcrJobNotClaimedError("OCR job status changed before extraction");
  }

  // Usage is recorded whether or not the run succeeds: a provider request can be
  // billed even when its result is unusable, and the admin ledger must match.
  const [owner] = await db
    .select({ developerId: propertySubmissions.developerId })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, job.submissionId));
  const { provider, model } = splitProviderKey(params.adapter.providerKey);
  const usageBase = (): Omit<AiUsageInput, "status"> => ({
    kind: "ocr_extraction",
    provider,
    model,
    ocrJobId: job.id,
    submissionId: job.submissionId,
    sourceDocumentId: job.sourceDocumentId,
    developerId: owner?.developerId ?? null,
    createdBy: params.requestedBy,
  });

  let result: OcrProviderExtractionResult;
  try {
    result = await params.adapter.extract(request);
  } catch (error) {
    // Bill what was actually spent: scopes that succeeded before the failure, and
    // the request whose response was unusable (failed, but still charged).
    const failedRequestId =
      error instanceof OcrAdapterError ? error.providerRequestId : undefined;
    const partial: AiUsageInput[] = partialUsageOf(error).map((entry) => ({
      ...usageBase(),
      status: (entry.providerRequestId !== undefined &&
      entry.providerRequestId === failedRequestId
        ? "failed"
        : "succeeded") as "failed" | "succeeded",
      scopeKey: entry.scopeKey,
      providerRequestId: entry.providerRequestId,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      reasoningTokens: entry.reasoningTokens,
      costUsd: entry.costUsd,
    }));
    if (
      failedRequestId !== undefined &&
      !partial.some((entry) => entry.providerRequestId === failedRequestId)
    ) {
      partial.push({
        ...usageBase(),
        status: "failed",
        scopeKey: undefined,
        providerRequestId: failedRequestId,
        promptTokens: undefined,
        completionTokens: undefined,
        reasoningTokens: undefined,
        costUsd: undefined,
      });
    }
    await recordAiUsage(db, partial).catch((ledgerError) => {
      console.error("Failed to record OCR usage:", ledgerError);
    });
    const code =
      error instanceof OcrAdapterError ? error.code : "unexpected_error";
    await markJobFailed(job.id, code, String(error));
    throw error;
  }

  await recordAiUsage(
    db,
    (result.usage ?? []).map((entry) => ({
      ...usageBase(),
      status: "succeeded" as const,
      scopeKey: entry.scopeKey,
      providerRequestId: entry.providerRequestId,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      reasoningTokens: entry.reasoningTokens,
      costUsd: entry.costUsd,
    })),
  ).catch((error) => {
    // Never lose an extraction result because the ledger write failed.
    console.error("Failed to record OCR usage:", error);
  });

  return retryOcrExtractionPersistence({ jobId: job.id, result });
};
