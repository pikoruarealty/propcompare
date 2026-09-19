import { desc, eq, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  developers,
  properties,
  propertySubmissions,
  propertySubmissionFields,
} from "@/db/schema/catalog";
import { aiUsageEvents } from "@/db/schema/usage";

/**
 * The AI usage and cost ledger (docs/schema/schema.v6.md, section 1).
 *
 * ADMIN-ONLY. This module is imported only by the admin console and by the
 * ingestion code that makes the paid calls. It must never be imported by a
 * developer-portal or buyer route, and nothing that reaches a developer or buyer
 * may carry a cost — `usage-isolation.test.ts` enforces the first half.
 *
 * Amounts are USD as reported by the provider. `costUsd` is `null` when the
 * provider did not report one; it is never estimated from tokens, so any total
 * that includes unreported requests is a lower bound and says so
 * (`unreportedCount`).
 */

export interface AiUsageInput {
  kind: "page_router" | "ocr_extraction";
  status: "succeeded" | "failed";
  provider: string;
  model: string;
  providerRequestId?: string;
  scopeKey?: string;
  ocrJobId?: string;
  submissionId?: string;
  sourceDocumentId?: string;
  developerId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  createdBy?: string;
}

/** Records one row per provider request. Append-only: rows are never updated. */
export const recordAiUsage = async (
  database: PostgresJsDatabase,
  events: AiUsageInput[],
): Promise<void> => {
  if (events.length === 0) return;
  await database.insert(aiUsageEvents).values(
    events.map((event) => ({
      kind: event.kind,
      status: event.status,
      provider: event.provider,
      model: event.model,
      providerRequestId: event.providerRequestId ?? null,
      scopeKey: event.scopeKey ?? null,
      ocrJobId: event.ocrJobId ?? null,
      submissionId: event.submissionId ?? null,
      sourceDocumentId: event.sourceDocumentId ?? null,
      developerId: event.developerId ?? null,
      promptTokens: event.promptTokens ?? null,
      completionTokens: event.completionTokens ?? null,
      reasoningTokens: event.reasoningTokens ?? null,
      // numeric columns take strings, keeping the value exact end to end.
      costUsd: event.costUsd === undefined ? null : event.costUsd.toFixed(6),
      createdBy: event.createdBy ?? null,
    })),
  );
};

/** The instant `days` days before now, for period filters. */
export const daysAgo = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** `openrouter:anthropic/claude-sonnet-5` -> provider and model. */
export const splitProviderKey = (
  providerKey: string,
): { provider: string; model: string } => {
  const index = providerKey.indexOf(":");
  return index === -1
    ? { provider: "unknown", model: providerKey }
    : {
        provider: providerKey.slice(0, index),
        model: providerKey.slice(index + 1),
      };
};

export interface UsageTotals {
  requests: number;
  costUsd: number;
  /** Requests with no reported cost; when > 0 `costUsd` is a lower bound. */
  unreportedCount: number;
  failedCount: number;
}

export interface UsageBreakdownRow extends UsageTotals {
  key: string;
  label: string;
}

const totalsSelect = {
  requests: sql<number>`count(*)::int`,
  costUsd: sql<string>`coalesce(sum(${aiUsageEvents.costUsd}), 0)::text`,
  unreportedCount: sql<number>`(count(*) filter (where ${aiUsageEvents.costUsd} is null))::int`,
  failedCount: sql<number>`(count(*) filter (where ${aiUsageEvents.status} = 'failed'))::int`,
};

const toTotals = (row: {
  requests: number;
  costUsd: string;
  unreportedCount: number;
  failedCount: number;
}): UsageTotals => ({
  requests: row.requests,
  costUsd: Number(row.costUsd),
  unreportedCount: row.unreportedCount,
  failedCount: row.failedCount,
});

export const getUsageTotals = async (
  database: PostgresJsDatabase,
  since?: Date,
): Promise<UsageTotals> => {
  const [row] = await database
    .select(totalsSelect)
    .from(aiUsageEvents)
    .where(since ? gte(aiUsageEvents.createdAt, since) : undefined);
  return toTotals(row);
};

export const getUsageByDeveloper = async (
  database: PostgresJsDatabase,
  since?: Date,
): Promise<UsageBreakdownRow[]> => {
  const rows = await database
    .select({
      key: sql<string>`coalesce(${aiUsageEvents.developerId}::text, 'none')`,
      label: sql<string>`coalesce(${developers.name}, 'No developer linked')`,
      ...totalsSelect,
    })
    .from(aiUsageEvents)
    .leftJoin(developers, eq(developers.id, aiUsageEvents.developerId))
    .where(since ? gte(aiUsageEvents.createdAt, since) : undefined)
    .groupBy(aiUsageEvents.developerId, developers.name)
    .orderBy(sql`sum(${aiUsageEvents.costUsd}) desc nulls last`);
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    ...toTotals(row),
  }));
};

export const getUsageByModel = async (
  database: PostgresJsDatabase,
  since?: Date,
): Promise<UsageBreakdownRow[]> => {
  const rows = await database
    .select({
      key: sql<string>`${aiUsageEvents.provider} || ':' || ${aiUsageEvents.model} || ':' || ${aiUsageEvents.kind}`,
      label: sql<string>`${aiUsageEvents.model}`,
      ...totalsSelect,
    })
    .from(aiUsageEvents)
    .where(since ? gte(aiUsageEvents.createdAt, since) : undefined)
    .groupBy(aiUsageEvents.provider, aiUsageEvents.model, aiUsageEvents.kind)
    .orderBy(sql`sum(${aiUsageEvents.costUsd}) desc nulls last`);
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    ...toTotals(row),
  }));
};

export interface UsageBySubmissionRow extends UsageTotals {
  submissionId: string | null;
  propertyName: string | null;
  developerName: string | null;
  lastAt: Date;
}

/** Spend per brochure/property, most recent first. */
export const getUsageBySubmission = async (
  database: PostgresJsDatabase,
  since?: Date,
  limit = 50,
): Promise<UsageBySubmissionRow[]> => {
  const rows = await database
    .select({
      submissionId: aiUsageEvents.submissionId,
      propertyName: sql<
        string | null
      >`coalesce(${properties.name}, (select f.value #>> '{}' from ${propertySubmissionFields} f where f.submission_id = ${aiUsageEvents.submissionId} and f.field_key = 'property.name'))`,
      developerName: developers.name,
      lastAt: sql<Date>`max(${aiUsageEvents.createdAt})`,
      ...totalsSelect,
    })
    .from(aiUsageEvents)
    .leftJoin(
      propertySubmissions,
      eq(propertySubmissions.id, aiUsageEvents.submissionId),
    )
    .leftJoin(properties, eq(properties.id, propertySubmissions.propertyId))
    .leftJoin(developers, eq(developers.id, aiUsageEvents.developerId))
    .where(since ? gte(aiUsageEvents.createdAt, since) : undefined)
    .groupBy(aiUsageEvents.submissionId, properties.name, developers.name)
    .orderBy(sql`max(${aiUsageEvents.createdAt}) desc`)
    .limit(limit);
  return rows.map((row) => ({
    submissionId: row.submissionId,
    propertyName: row.propertyName,
    developerName: row.developerName,
    lastAt: new Date(row.lastAt),
    ...toTotals(row),
  }));
};

export interface RecentUsageRow {
  id: string;
  createdAt: Date;
  kind: "page_router" | "ocr_extraction";
  status: "succeeded" | "failed";
  model: string;
  scopeKey: string | null;
  submissionId: string | null;
  developerName: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

export const getRecentUsage = async (
  database: PostgresJsDatabase,
  limit = 50,
): Promise<RecentUsageRow[]> => {
  const rows = await database
    .select({
      id: aiUsageEvents.id,
      createdAt: aiUsageEvents.createdAt,
      kind: aiUsageEvents.kind,
      status: aiUsageEvents.status,
      model: aiUsageEvents.model,
      scopeKey: aiUsageEvents.scopeKey,
      submissionId: aiUsageEvents.submissionId,
      developerName: developers.name,
      promptTokens: aiUsageEvents.promptTokens,
      completionTokens: aiUsageEvents.completionTokens,
      costUsd: aiUsageEvents.costUsd,
    })
    .from(aiUsageEvents)
    .leftJoin(developers, eq(developers.id, aiUsageEvents.developerId))
    .orderBy(desc(aiUsageEvents.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...row,
    costUsd: row.costUsd === null ? null : Number(row.costUsd),
  }));
};
