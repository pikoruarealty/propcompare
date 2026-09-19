import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import {
  developers,
  ocrExtractionJobs,
  propertySubmissions,
  sourceDocuments,
} from "./catalog";

/**
 * AI usage and cost ledger (schema v6, section 1 — docs/schema/schema.v6.md;
 * approved by the owner 2026-09-20).
 *
 * Append-only: one row per provider request, never updated, and the application
 * role is granted SELECT and INSERT only. Every link is `on delete set null` so
 * spend history survives a deleted draft, document or developer.
 *
 * Admin-only by construction: only the admin Usage screen reads this table, and
 * no developer or buyer route may (asserted by a test). `cost_usd` is the
 * provider-reported figure in USD; null means "not reported" and is never
 * estimated from tokens.
 */
export const aiUsageKind = pgEnum("ai_usage_kind", [
  "page_router",
  "ocr_extraction",
]);

export const aiUsageStatus = pgEnum("ai_usage_status", ["succeeded", "failed"]);

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: aiUsageKind("kind").notNull(),
    status: aiUsageStatus("status").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    providerRequestId: text("provider_request_id"),
    scopeKey: text("scope_key"),
    ocrJobId: uuid("ocr_job_id").references(() => ocrExtractionJobs.id, {
      onDelete: "set null",
    }),
    submissionId: uuid("submission_id").references(
      () => propertySubmissions.id,
      { onDelete: "set null" },
    ),
    sourceDocumentId: uuid("source_document_id").references(
      () => sourceDocuments.id,
      { onDelete: "set null" },
    ),
    developerId: uuid("developer_id").references(() => developers.id, {
      onDelete: "set null",
    }),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("ai_usage_events_created_at_idx").on(table.createdAt),
    index("ai_usage_events_developer_id_idx").on(table.developerId),
    index("ai_usage_events_submission_id_idx").on(table.submissionId),
    check(
      "ai_usage_events_amounts_non_negative",
      sql`(${table.promptTokens} is null or ${table.promptTokens} >= 0)
        and (${table.completionTokens} is null or ${table.completionTokens} >= 0)
        and (${table.reasoningTokens} is null or ${table.reasoningTokens} >= 0)
        and (${table.costUsd} is null or ${table.costUsd} >= 0)`,
    ),
  ],
);
