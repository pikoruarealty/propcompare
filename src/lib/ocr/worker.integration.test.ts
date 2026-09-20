import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import {
  ocrExtractionJobs,
  propertySubmissionFields,
  propertySubmissions,
  sourceDocuments,
} from "@/db/schema/catalog";
import { aiUsageEvents } from "@/db/schema/usage";
import { reopenFailedOcr } from "@/lib/ingestion/extraction-retry";
import {
  createOpenRouterOcrAdapter,
  OcrAdapterError,
  type OcrProviderAdapter,
} from "./adapter";
import { recoverStaleOcrJobs, runNextQueuedOcrJob } from "./worker";

const testUserId = `ocr-worker-user-${randomUUID()}`;
const createdSubmissionIds: string[] = [];
const createdDocumentIds: string[] = [];

const manifest = {
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
};

const createJob = async (
  status: "queued" | "processing" | "failed" = "queued",
  routingManifest: unknown = manifest,
): Promise<{ jobId: string; submissionId: string }> => {
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      submittedBy: testUserId,
      source: "ocr_brochure",
      status: "draft",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  createdSubmissionIds.push(submission.id);
  const [document] = await db
    .insert(sourceDocuments)
    .values({
      documentType: "brochure_pdf",
      gcsPath: "synthetic/worker-test.pdf",
      uploadedBy: testUserId,
      pageCount: 2,
    })
    .returning({ id: sourceDocuments.id });
  createdDocumentIds.push(document.id);
  const [job] = await db
    .insert(ocrExtractionJobs)
    .values({
      sourceDocumentId: document.id,
      submissionId: submission.id,
      status,
      pipelineVersion: "ocr-openrouter-v1",
      fieldSchemaVersion: "v5",
      routingManifest,
    })
    .returning({ id: ocrExtractionJobs.id });
  return { jobId: job.id, submissionId: submission.id };
};

const readJob = async (jobId: string) => {
  const [job] = await db
    .select()
    .from(ocrExtractionJobs)
    .where(eq(ocrExtractionJobs.id, jobId));
  return job;
};

const succeedingAdapter = (): OcrProviderAdapter => ({
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
            value: "Worker Test Residences",
            confidence: 0.9,
            evidence: [
              { scopeKey: "project", pageNumber: 1, sourceSnippet: "Worker" },
            ],
          },
        ],
        unitVariants: [],
      },
      unmappedRawEvidence: [],
      // Provider request ids are unique per provider, so each run needs its own.
      providerRequestIds: [`worker-test-${randomUUID()}`],
    };
  },
});

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "OCR Worker Test User",
    email: `${testUserId}@example.test`,
  });
});

afterAll(async () => {
  for (const id of createdSubmissionIds) {
    await db.delete(propertySubmissions).where(eq(propertySubmissions.id, id));
  }
  for (const id of createdDocumentIds) {
    await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id));
  }
  await db.delete(users).where(eq(users.id, testUserId));
});

describe("the extraction worker", () => {
  it("runs a queued job to completion and writes draft fields", async () => {
    const { jobId, submissionId } = await createJob();

    const result = await runNextQueuedOcrJob({
      database: db,
      createAdapter: succeedingAdapter,
      onlyJobId: jobId,
    });

    expect(result).toEqual({ outcome: "completed", jobId });
    expect((await readJob(jobId)).status).toBe("completed");
    const fields = await db
      .select()
      .from(propertySubmissionFields)
      .where(eq(propertySubmissionFields.submissionId, submissionId));
    expect(fields.map((field) => field.fieldKey)).toEqual(["property.name"]);
    expect(fields[0].reviewStatus).toBe("needs_review");
  });

  it("is idle when nothing is queued", async () => {
    const { jobId } = await createJob("failed");
    const result = await runNextQueuedOcrJob({
      database: db,
      createAdapter: succeedingAdapter,
      onlyJobId: jobId,
    });
    expect(result).toEqual({ outcome: "idle" });
  });

  it("lets only one of two simultaneous workers run a job", async () => {
    const { jobId } = await createJob();
    let calls = 0;
    const slow: OcrProviderAdapter = {
      providerKey: "synthetic:test",
      async extract(request) {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        return succeedingAdapter().extract(request);
      },
    };

    const results = await Promise.all([
      runNextQueuedOcrJob({
        database: db,
        createAdapter: () => slow,
        onlyJobId: jobId,
      }),
      runNextQueuedOcrJob({
        database: db,
        createAdapter: () => slow,
        onlyJobId: jobId,
      }),
    ]);

    expect(calls).toBe(1);
    // Whichever worker looks second either finds the job already taken or loses the claim.
    expect(
      results.filter((result) => result.outcome === "completed"),
    ).toHaveLength(1);
    expect(
      results.filter((result) =>
        ["idle", "not_claimed"].includes(result.outcome),
      ),
    ).toHaveLength(1);
    expect((await readJob(jobId)).status).toBe("completed");
  });

  it("fails the job with the provider's code and records what was billed", async () => {
    const { jobId, submissionId } = await createJob();
    // Real adapter, fake network: the first scope answers (and is billed), the second errors.
    // A 500 is retried once, so the second scope fails on both attempts.
    const responses = [
      okResponse(),
      new Response("nope", { status: 500 }),
      new Response("nope", { status: 500 }),
    ];
    const adapter = createOpenRouterOcrAdapter({
      apiKey: "test",
      loadSourcePdf: async () => await twoPagePdf(),
      fetch: async () => responses.shift() as Response,
      checkpointDirectory: false,
      retryDelayMs: 1,
    });
    const twoScopes = {
      version: "v1",
      pageCount: 2,
      scopes: [
        {
          scopeKey: "project",
          kind: "property_details",
          label: "Project",
          pages: [{ pageNumber: 1 }],
        },
        {
          scopeKey: "amenities",
          kind: "amenities",
          label: "Amenities",
          pages: [{ pageNumber: 2 }],
        },
      ],
    };
    await db
      .update(ocrExtractionJobs)
      .set({ routingManifest: twoScopes })
      .where(eq(ocrExtractionJobs.id, jobId));

    const result = await runNextQueuedOcrJob({
      database: db,
      createAdapter: () => adapter,
      onlyJobId: jobId,
    });

    expect(result).toMatchObject({ outcome: "failed", code: "provider_error" });
    const job = await readJob(jobId);
    expect(job.status).toBe("failed");
    expect(job.errorCode).toBe("provider_error");
    const usage = await db
      .select()
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.submissionId, submissionId));
    // The first scope succeeded and was billed before the second one failed.
    expect(usage.map((row) => [row.scopeKey, row.status])).toEqual([
      ["project", "succeeded"],
    ]);
    expect(Number(usage[0].costUsd)).toBeCloseTo(0.0042, 6);
  });

  it("fails a job that cannot start instead of leaving it queued", async () => {
    const { jobId } = await createJob();
    const result = await runNextQueuedOcrJob({
      database: db,
      createAdapter: () => {
        throw new OcrAdapterError("configuration_error", "no key");
      },
      onlyJobId: jobId,
    });
    expect(result).toMatchObject({
      outcome: "failed",
      code: "configuration_error",
    });
    expect((await readJob(jobId)).status).toBe("failed");
  });

  it("fails a job whose confirmed routing cannot be read, rather than looping on it", async () => {
    const { jobId } = await createJob("queued", { version: "v9" });
    const result = await runNextQueuedOcrJob({
      database: db,
      createAdapter: succeedingAdapter,
      onlyJobId: jobId,
    });
    expect(result.outcome).toBe("failed");
    expect((await readJob(jobId)).status).toBe("failed");
  });

  it("marks a job whose worker died as interrupted, and leaves a live one alone", async () => {
    const { jobId } = await createJob("processing");
    const fresh = await recoverStaleOcrJobs(db, {
      leaseMs: 10 * 60_000,
      onlyJobId: jobId,
    });
    expect(fresh).toEqual([]);
    expect((await readJob(jobId)).status).toBe("processing");

    const later = new Date(Date.now() + 11 * 60_000);
    const stale = await recoverStaleOcrJobs(db, {
      leaseMs: 10 * 60_000,
      now: later,
      onlyJobId: jobId,
    });
    expect(stale).toEqual([jobId]);
    const job = await readJob(jobId);
    expect(job.status).toBe("failed");
    expect(job.errorCode).toBe("worker_interrupted");
  });
});

describe("trying a failed extraction again", () => {
  it("requeues a failed attempt, and only a failed one", async () => {
    const { jobId } = await createJob("failed");
    await db
      .update(ocrExtractionJobs)
      .set({ errorCode: "provider_error", errorMessage: "boom" })
      .where(eq(ocrExtractionJobs.id, jobId));

    await reopenFailedOcr(db, jobId, "requeue");
    const job = await readJob(jobId);
    expect(job.status).toBe("queued");
    expect(job.errorCode).toBeNull();
    expect(job.errorMessage).toBeNull();

    await expect(reopenFailedOcr(db, jobId, "requeue")).rejects.toMatchObject({
      code: "job_not_draft",
    });
  });

  it("can send a failed attempt back to its page choices", async () => {
    const { jobId } = await createJob("failed");
    await reopenFailedOcr(db, jobId, "edit_pages");
    expect((await readJob(jobId)).status).toBe("draft");
  });

  it("does not let two simultaneous clicks queue it twice", async () => {
    const { jobId } = await createJob("failed");
    const results = await Promise.allSettled([
      reopenFailedOcr(db, jobId, "requeue"),
      reopenFailedOcr(db, jobId, "requeue"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

const okResponse = (): Response => {
  const body = [
    `data: ${JSON.stringify({
      id: "gen-project",
      choices: [
        {
          delta: {
            content: JSON.stringify({ fields: [], unmappedRawEvidence: [] }),
          },
          finish_reason: "stop",
        },
      ],
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "gen-project",
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        cost: 0.0042,
      },
    })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
};

const twoPagePdf = async (): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  return doc.save();
};
