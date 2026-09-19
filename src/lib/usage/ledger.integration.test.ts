import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { developers, propertySubmissions } from "@/db/schema/catalog";
import { aiUsageEvents } from "@/db/schema/usage";
import {
  daysAgo,
  getRecentUsage,
  getUsageByDeveloper,
  getUsageBySubmission,
  getUsageTotals,
  recordAiUsage,
  splitProviderKey,
} from "./ledger";

let developerId: string;
let submissionId: string;
const marker = `ledger-test-${randomUUID()}`;

beforeAll(async () => {
  const [developer] = await db
    .insert(developers)
    .values({ name: `Ledger Test Developer ${marker}` })
    .returning({ id: developers.id });
  developerId = developer.id;
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      source: "ocr_brochure",
      status: "draft",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  submissionId = submission.id;
});

afterAll(async () => {
  // The app role cannot delete ledger rows (by design), so tidy up as the owner
  // would: removing the parents detaches them (`on delete set null`), and the
  // marker model keeps these rows identifiable and out of real totals below.
  await db
    .delete(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  await db.delete(developers).where(eq(developers.id, developerId));
});

describe("usage ledger", () => {
  it("records requests and summarises them by developer, brochure and totals", async () => {
    const before = await getUsageTotals(db);
    await recordAiUsage(db, [
      {
        kind: "page_router",
        status: "succeeded",
        provider: "openrouter",
        model: marker,
        submissionId,
        developerId,
        promptTokens: 1000,
        completionTokens: 40,
        costUsd: 0.0125,
      },
      {
        kind: "ocr_extraction",
        status: "succeeded",
        provider: "openrouter",
        model: marker,
        scopeKey: "project",
        submissionId,
        developerId,
        costUsd: 0.2,
      },
      {
        kind: "ocr_extraction",
        status: "failed",
        provider: "openrouter",
        model: marker,
        submissionId,
        developerId,
        // no cost reported: recorded as null, never estimated
      },
    ]);

    const after = await getUsageTotals(db);
    expect(after.requests - before.requests).toBe(3);
    expect(after.failedCount - before.failedCount).toBe(1);
    expect(after.unreportedCount - before.unreportedCount).toBe(1);
    expect(after.costUsd - before.costUsd).toBeCloseTo(0.2125, 6);

    const developer = (await getUsageByDeveloper(db)).find(
      (row) => row.key === developerId,
    );
    expect(developer).toMatchObject({
      requests: 3,
      failedCount: 1,
      unreportedCount: 1,
    });
    expect(developer?.costUsd).toBeCloseTo(0.2125, 6);

    const brochure = (await getUsageBySubmission(db)).find(
      (row) => row.submissionId === submissionId,
    );
    expect(brochure?.requests).toBe(3);

    const recent = await getRecentUsage(db, 200);
    const failed = recent.find(
      (row) => row.model === marker && row.status === "failed",
    );
    expect(failed?.costUsd).toBeNull();
  });

  it("filters by period", async () => {
    const recentOnly = await getUsageTotals(db, daysAgo(1));
    const everything = await getUsageTotals(db);
    expect(recentOnly.requests).toBeLessThanOrEqual(everything.requests);
    expect(recentOnly.requests).toBeGreaterThanOrEqual(3);
  });

  it("is append-only for the application role", async () => {
    await expect(
      db.update(aiUsageEvents).set({ model: "tampered" }),
    ).rejects.toThrow();
    await expect(db.delete(aiUsageEvents)).rejects.toThrow();
  });

  it("keeps spend history when the draft and developer it belongs to are deleted", async () => {
    const [{ id: tempDeveloperId }] = await db
      .insert(developers)
      .values({ name: `Ledger Detach ${marker}` })
      .returning({ id: developers.id });
    const [{ id: tempSubmissionId }] = await db
      .insert(propertySubmissions)
      .values({
        developerId: tempDeveloperId,
        source: "manual_form",
        status: "draft",
        payload: {},
      })
      .returning({ id: propertySubmissions.id });
    await recordAiUsage(db, [
      {
        kind: "page_router",
        status: "succeeded",
        provider: "openrouter",
        model: `${marker}-detach`,
        submissionId: tempSubmissionId,
        developerId: tempDeveloperId,
        costUsd: 0.01,
      },
    ]);

    await db
      .delete(propertySubmissions)
      .where(eq(propertySubmissions.id, tempSubmissionId));
    await db.delete(developers).where(eq(developers.id, tempDeveloperId));

    const survivor = (await getRecentUsage(db, 200)).find(
      (row) => row.model === `${marker}-detach`,
    );
    expect(survivor).toBeDefined();
    expect(survivor?.submissionId).toBeNull();
    expect(survivor?.developerName).toBeNull();
  });

  it("rejects a negative cost", async () => {
    await expect(
      recordAiUsage(db, [
        {
          kind: "page_router",
          status: "succeeded",
          provider: "openrouter",
          model: marker,
          costUsd: -1,
        },
      ]),
    ).rejects.toThrow();
  });
});

describe("splitProviderKey", () => {
  it("splits provider and model, tolerating a bare key", () => {
    expect(splitProviderKey("openrouter:anthropic/claude-sonnet-5")).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-5",
    });
    expect(splitProviderKey("plain")).toEqual({
      provider: "unknown",
      model: "plain",
    });
  });
});
