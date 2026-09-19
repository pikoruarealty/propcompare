import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ocrExtractionJobs } from "@/db/schema/catalog";
import {
  IMAGE_LAYOUTS,
  IMAGERY_TAGS,
  PAGE_CATEGORIES,
  type ImageLayout,
  PageRouterError,
  type PageRouterUsage,
  type PageCategory,
  type PageRouter,
  type PageSuggestion,
} from "@/lib/ocr/page-router";
import type { StorageAdapter } from "@/lib/storage/adapter";
import { recordAiUsage, type AiUsageInput } from "@/lib/usage/ledger";
import { getSubmissionBrochure } from "./queries";

/**
 * Runs the page router over a draft brochure and stores its suggestions on the
 * draft OCR attempt's `routingManifest`, under `suggestions`. A draft manifest is
 * never parsed as a routing contract until a human confirms and queues it, so
 * carrying the suggestions there needs no schema change and cannot be mistaken
 * for a confirmed route. Suggestions are advice; nothing here creates a scope.
 *
 * Token usage is stored for operations but is deliberately not part of what
 * `readStoredSuggestions` returns: no screen shows what a run cost.
 */

export interface StoredSuggestions {
  model: string;
  generatedAt: string;
  pages: PageSuggestion[];
}

export class PageSuggestionError extends Error {
  constructor(
    public readonly code:
      "job_not_found" | "job_not_draft" | "already_suggested",
    message: string,
  ) {
    super(message);
    this.name = "PageSuggestionError";
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads suggestions back out of a manifest, tolerating (and dropping) junk. */
export const readStoredSuggestions = (
  manifest: unknown,
): StoredSuggestions | null => {
  if (!isRecord(manifest) || !isRecord(manifest.suggestions)) return null;
  const { model, generatedAt, pages } = manifest.suggestions;
  if (
    typeof model !== "string" ||
    typeof generatedAt !== "string" ||
    !Array.isArray(pages)
  ) {
    return null;
  }
  const clean: PageSuggestion[] = [];
  for (const entry of pages) {
    if (
      !isRecord(entry) ||
      typeof entry.page !== "number" ||
      !PAGE_CATEGORIES.includes(entry.category as PageCategory) ||
      typeof entry.confidence !== "number"
    ) {
      continue;
    }
    clean.push({
      page: entry.page,
      category: entry.category as PageCategory,
      confidence: entry.confidence,
      imagery: Array.isArray(entry.imagery)
        ? entry.imagery.filter((tag): tag is (typeof IMAGERY_TAGS)[number] =>
            IMAGERY_TAGS.includes(tag as (typeof IMAGERY_TAGS)[number]),
          )
        : [],
      ...(typeof entry.caption === "string" ? { caption: entry.caption } : {}),
      ...(IMAGE_LAYOUTS.includes(entry.imageLayout as ImageLayout)
        ? { imageLayout: entry.imageLayout as ImageLayout }
        : {}),
    });
  }
  return { model, generatedAt, pages: clean };
};

export const runPageRouting = async (
  deps: {
    database: PostgresJsDatabase;
    storage: StorageAdapter;
    router: PageRouter;
  },
  input: {
    ocrJobId: string;
    replaceExisting?: boolean;
    /** The admin who started the run, for the usage ledger. */
    requestedBy?: string;
  },
): Promise<StoredSuggestions> => {
  const { database, storage, router } = deps;

  const brochure = await getSubmissionBrochure(database, input.ocrJobId, "job");
  if (!brochure) {
    throw new PageSuggestionError("job_not_found", "No such brochure attempt.");
  }
  if (brochure.ocrJobStatus !== "draft") {
    throw new PageSuggestionError(
      "job_not_draft",
      "Pages can only be suggested while the attempt is still a draft.",
    );
  }
  if (
    readStoredSuggestions(brochure.routingManifest) &&
    !input.replaceExisting
  ) {
    throw new PageSuggestionError(
      "already_suggested",
      "Suggestions already exist for this brochure.",
    );
  }

  const bytes = await storage.download(brochure.storagePath);

  // Every provider request is recorded — including ones billed before a later
  // window failed — so the admin usage ledger matches the bill.
  const base = (): Omit<AiUsageInput, "status"> => ({
    kind: "page_router",
    provider: "openrouter",
    model: router.model,
    ocrJobId: input.ocrJobId,
    submissionId: brochure.submissionId,
    sourceDocumentId: brochure.sourceDocumentId,
    developerId: brochure.developerId,
    createdBy: input.requestedBy,
  });
  const recordRequests = (
    usage: PageRouterUsage,
    lastFailed: boolean,
  ): AiUsageInput[] =>
    usage.perRequest.map((request, index) => ({
      ...base(),
      status:
        lastFailed && index === usage.perRequest.length - 1
          ? "failed"
          : "succeeded",
      providerRequestId: request.providerRequestId,
      promptTokens: request.promptTokens,
      completionTokens: request.completionTokens,
      costUsd: request.costUsd,
    }));

  let result;
  try {
    result = await router.route(bytes);
  } catch (error) {
    if (error instanceof PageRouterError) {
      // A reply we could not use was still billed (the last recorded request);
      // a request that never got a reply has no usage, so it is recorded as a
      // failed request with nothing reported rather than dropped.
      const usage = error.usage;
      const billedButUnusable =
        error.code === "invalid_response" &&
        (usage?.perRequest.length ?? 0) > 0;
      const events = [
        ...(usage ? recordRequests(usage, billedButUnusable) : []),
        ...(billedButUnusable
          ? []
          : [{ ...base(), status: "failed" as const }]),
      ];
      await recordAiUsage(database, events).catch(() => undefined);
    }
    throw error;
  }
  await recordAiUsage(database, recordRequests(result.usage, false));

  const stored: StoredSuggestions = {
    model: result.model,
    generatedAt: new Date().toISOString(),
    pages: result.suggestions,
  };
  const manifest = isRecord(brochure.routingManifest)
    ? brochure.routingManifest
    : {};
  await database
    .update(ocrExtractionJobs)
    .set({
      routingManifest: {
        ...manifest,
        suggestions: { ...stored, usage: result.usage },
      },
    })
    .where(eq(ocrExtractionJobs.id, input.ocrJobId));

  return stored;
};
