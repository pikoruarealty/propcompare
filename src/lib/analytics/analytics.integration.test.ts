import "dotenv/config";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema/analytics";
import {
  publishTestPortfolio,
  type TestPortfolio,
} from "@/lib/submissions/test-support";
import { POST } from "@/app/api/v1/events/route";
import { VISITOR_COOKIE } from "./cookies";
import { loadAnalyticsDashboard } from "./dashboard";
import { purgeOldAnalytics } from "./retention";

/**
 * The analytics pipeline against the real database: the route records, refuses
 * and sets its cookies; the dashboard's figures come out right for a known set of
 * events; retention rolls old months up and deletes them. The dashboard and
 * retention rows are placed in January 2001, a month no real event can be in, so
 * the figures are exactly ours.
 */

const owner = postgres(
  process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!,
);
let a = { id: "", slug: "", name: "" };
let b = { id: "", slug: "", name: "" };
const visitorIds: string[] = [];

// Two listed properties of this file's own, so the test does not depend on
// other files' fixtures existing at the same moment (2026-09-26 — Deep: it
// failed whenever it ran alone).
let portfolio: TestPortfolio | undefined;

beforeAll(async () => {
  portfolio = await publishTestPortfolio("Analytics", 2);
  [a, b] = portfolio.properties;
});

afterAll(async () => {
  if (visitorIds.length > 0) {
    await db
      .delete(analyticsEvents)
      .where(inArray(analyticsEvents.visitorId, visitorIds));
  }
  await owner`delete from analytics_events where occurred_at < '2002-01-01'`;
  await owner`delete from analytics_event_monthly where month < '2002-01-01'`;
  await owner`delete from analytics_pair_monthly where month < '2002-01-01'`;
  await owner.end();
  await portfolio?.remove();
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );

const visitorOf = (response: Response): string => {
  const set = response.headers.getSetCookie().join(";");
  const match = new RegExp(`${VISITOR_COOKIE}=([0-9a-f-]{36})`).exec(set);
  if (!match) throw new Error("no visitor cookie");
  visitorIds.push(match[1]);
  return match[1];
};

describe("POST /api/v1/events", () => {
  it("records an event with a new visitor id, the device, and the referring domain only", async () => {
    const response = await post({
      event: "compare_opened",
      slugs: [a.slug, b.slug, "no-such-property"],
      utm: { source: "WhatsApp Share", medium: "social", campaign: null },
      referrer: "https://www.instagram.com/p/abc?x=1",
      band: "₹2–3 crore",
    });
    expect(response.status).toBe(204);
    const visitor = visitorOf(response);

    const [row] = await db
      .select()
      .from(analyticsEvents)
      .where(inArray(analyticsEvents.visitorId, [visitor]));
    expect(row).toMatchObject({
      event: "compare_opened",
      signedIn: false,
      device: "mobile",
      source: "whatsapp-share",
      medium: "social",
      referrerDomain: "instagram.com",
      budgetBand: "₹2–3 crore",
      propertyId: null,
    });
    // The made-up slug is not a property; the two real ones keep their order.
    expect(row.comparedIds).toEqual([a.id, b.id]);
  });

  it("keeps the same visitor across requests that carry the cookie", async () => {
    const first = await post({ event: "property_viewed", slug: a.slug });
    const visitor = visitorOf(first);
    await post(
      { event: "property_viewed", slug: b.slug },
      { cookie: `${VISITOR_COOKIE}=${visitor}` },
    );
    const rows = await db
      .select({ propertyId: analyticsEvents.propertyId })
      .from(analyticsEvents)
      .where(inArray(analyticsEvents.visitorId, [visitor]));
    expect(rows.map((row) => row.propertyId).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("records nothing for a crawler, an opted-out browser, an unknown event or a price", async () => {
    const before = (await db.select().from(analyticsEvents)).length;
    const refused = [
      await post(
        { event: "property_viewed", slug: a.slug },
        { "user-agent": "Googlebot/2.1" },
      ),
      await post(
        { event: "property_viewed", slug: a.slug },
        { "sec-gpc": "1" },
      ),
      await post({ event: "property_viewed", slug: a.slug }, { dnt: "1" }),
      await post({ event: "price_seen", slug: a.slug }),
      await post({ event: "property_viewed", slug: "no-such-property" }),
      await post({
        event: "property_viewed",
        slug: a.slug,
        band: "₹2,34,00,000",
      }),
    ];
    for (const response of refused) expect(response.status).toBe(204);
    // Only the last one is kept, and without the figure it tried to carry.
    const after = await db.select().from(analyticsEvents);
    expect(after.length).toBe(before + 1);
    const last = after.find(
      (row) => !visitorIds.includes(row.visitorId) && row.budgetBand === null,
    );
    if (last) visitorIds.push(last.visitorId);
    expect(JSON.stringify(after)).not.toContain("2,34,00,000");
  });
});

describe("the dashboard and retention", () => {
  const at = (day: number, hour = 10) => new Date(Date.UTC(2001, 0, day, hour));

  beforeAll(async () => {
    const v1 = randomUUID();
    const v2 = randomUUID();
    const s1 = randomUUID();
    const s2 = randomUUID();
    const base = { device: "desktop", signedIn: false };
    await db.insert(analyticsEvents).values([
      {
        ...base,
        occurredAt: at(3),
        visitorId: v1,
        sessionId: s1,
        event: "property_viewed",
        propertyId: a.id,
      },
      {
        ...base,
        occurredAt: at(3),
        visitorId: v1,
        sessionId: s1,
        event: "property_viewed",
        propertyId: b.id,
      },
      {
        ...base,
        occurredAt: at(3),
        visitorId: v1,
        sessionId: s1,
        event: "comparison_started",
        propertyId: b.id,
        comparedIds: [a.id, b.id],
      },
      {
        ...base,
        occurredAt: at(3),
        visitorId: v1,
        sessionId: s1,
        event: "compare_opened",
        comparedIds: [a.id, b.id],
        budgetBand: "₹2–3 crore",
      },
      {
        ...base,
        occurredAt: at(3),
        visitorId: v1,
        sessionId: s1,
        event: "page_engaged",
        comparedIds: [a.id, b.id],
        engagedMs: 90_000,
        detail: { page: "compare" },
      },
      {
        ...base,
        occurredAt: at(3, 11),
        visitorId: v1,
        sessionId: s1,
        signedIn: true,
        event: "compare_opened",
        comparedIds: [a.id, b.id],
      },
      {
        ...base,
        occurredAt: at(3, 11),
        visitorId: v1,
        sessionId: s1,
        signedIn: true,
        event: "compare_group_opened",
        comparedIds: [a.id, b.id],
        detail: { group: "rooms" },
      },
      {
        ...base,
        occurredAt: at(3, 12),
        visitorId: v1,
        sessionId: s1,
        signedIn: true,
        event: "enquiry_submitted",
        propertyId: b.id,
        comparedIds: [a.id, b.id],
      },
      {
        ...base,
        occurredAt: at(4),
        visitorId: v2,
        sessionId: s2,
        event: "property_viewed",
        propertyId: a.id,
        source: "google",
        medium: "cpc",
      },
      {
        ...base,
        occurredAt: at(4),
        visitorId: v2,
        sessionId: s2,
        event: "page_engaged",
        propertyId: a.id,
        engagedMs: 30_000,
        detail: { page: "dossier" },
      },
    ]);
  });

  it("works out the overview, funnel, gate and the pair compared, with its enquiries", async () => {
    const dashboard = await loadAnalyticsDashboard(db, {
      from: new Date(Date.UTC(2001, 0, 1)),
      to: new Date(Date.UTC(2001, 1, 1)),
    });

    expect(dashboard.overview).toMatchObject({
      visitors: 2,
      visits: 2,
      propertyViews: 3,
      comparisonsOpened: 2,
      comparingVisitors: 1,
      comparisonsPerComparer: 2,
      medianCompareSecondsPerVisit: 90,
      medianDossierSecondsPerView: 30,
      enquiries: 1,
      enquiriesAfterComparing: 1,
    });
    expect(
      Object.fromEntries(dashboard.funnel.map((s) => [s.key, s.visitors])),
    ).toEqual({
      visited: 2,
      viewed: 2,
      viewed_two: 1,
      started: 1,
      opened: 1,
      unlocked: 1,
      saved: 0,
      enquired: 1,
    });
    expect(dashboard.gate).toEqual({ reached: 1, unlocked: 1 });

    expect(dashboard.pairs).toHaveLength(1);
    const [pair] = dashboard.pairs;
    expect(pair.comparisons).toBe(2);
    expect(pair.visitors).toBe(1);
    // The enquiry after comparing went to b.
    const [first, second] = [pair.aId, pair.bId];
    expect(first < second).toBe(true);
    expect(pair.aId === b.id ? pair.enquiriesA : pair.enquiriesB).toBe(1);
    expect(pair.aId === a.id ? pair.enquiriesA : pair.enquiriesB).toBe(0);

    const rowA = dashboard.properties.find((row) => row.id === a.id);
    expect(rowA).toMatchObject({
      views: 2,
      viewers: 2,
      inComparisons: 2,
      topRival: b.name,
      topRivalCount: 2,
      medianDossierSeconds: 30,
    });
    expect(dashboard.groupsOpened).toEqual([
      { label: "Room by room", count: 1 },
    ]);
    expect(dashboard.comparisonSize).toEqual([
      { label: "2 properties", count: 2 },
    ]);
    const sources = Object.fromEntries(
      dashboard.sources.map((row) => [row.label, row.visitors]),
    );
    expect(sources).toEqual({ Direct: 1, "google / cpc": 1 });
    expect(
      dashboard.budgetBands.find((row) => row.label === "₹2–3 crore"),
    ).toMatchObject({ visitors: 1, comparers: 1, enquirers: 1 });
    expect(dashboard.days.map((d) => d.day)).toEqual([
      "2001-01-03",
      "2001-01-04",
    ]);
  });

  it("rolls whole old months into counts and deletes the raw rows", async () => {
    const { deleted } = await purgeOldAnalytics(
      db,
      new Date(Date.UTC(2002, 5, 15)),
    );
    expect(deleted).toBeGreaterThanOrEqual(10);

    const monthly = await owner`
      select event, property_id, events, visitors, engaged_ms from analytics_event_monthly
      where month = '2001-01-01'`;
    const count = (event: string, propertyId: string | null) =>
      monthly.find(
        (row) => row.event === event && row.property_id === propertyId,
      );
    expect(Number(count("property_viewed", a.id)?.events)).toBe(2);
    expect(Number(count("property_viewed", a.id)?.visitors)).toBe(2);
    expect(Number(count("page_engaged", null)?.engaged_ms)).toBe(90_000);

    const [pair] = await owner`
      select comparisons, visitors from analytics_pair_monthly where month = '2001-01-01'`;
    expect(Number(pair.comparisons)).toBe(2);
    expect(Number(pair.visitors)).toBe(1);

    const [left] = await owner`
      select count(*)::int n from analytics_events where occurred_at < '2002-01-01'`;
    expect(left.n).toBe(0);
  });
});
