import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { EVENTS_PER_WINDOW } from "@/lib/analytics/rate-limit";
import { VISITOR_COOKIE } from "./cookies";
import { loadAnalyticsDashboard } from "./dashboard";
import { listVisitors, loadJourney, visitorLabel } from "./visitors";
import { purgeOldAnalytics } from "./retention";

/**
 * The analytics pipeline against the real database: the route records, refuses
 * and sets its cookies, and keeps a browser with a privacy signal anonymously; the
 * dashboard's figures come out right for a known set of events, anonymous ones
 * included; retention counts old months and clears their ids. The dashboard and
 * retention rows are placed in January 2001, a month no real event can be in, so
 * the figures are exactly ours.
 */

const owner = postgres(
  process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!,
);
let a = { id: "", slug: "", name: "" };
let b = { id: "", slug: "", name: "" };
const visitorIds: string[] = [];
const ANON_SOURCE = "test-anonymous-" + randomUUID().slice(0, 8);

// Two listed properties of this file's own, so the test does not depend on
// other files' fixtures existing at the same moment (2026-09-26 — Deep: it
// failed whenever it ran alone).
let portfolio: TestPortfolio | undefined;

beforeAll(async () => {
  portfolio = await publishTestPortfolio("Analytics", 2);
  [a, b] = portfolio.properties;
});

afterAll(async () => {
  // The application role never deletes an event; the owner role tidies up.
  if (visitorIds.length > 0) {
    await owner`delete from analytics_events where visitor_id in ${owner(visitorIds)}`;
  }
  await owner`delete from analytics_events where source like ${ANON_SOURCE + "%"}`;
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

  it("keeps an event from a browser with a privacy signal, with no id and no cookie", async () => {
    const signals: Record<string, string>[] = [
      { "sec-gpc": "1" },
      { dnt: "1" },
    ];
    for (const signal of signals) {
      const response = await post(
        {
          event: "compare_opened",
          slugs: [a.slug, b.slug],
          utm: { source: ANON_SOURCE, medium: null, campaign: null },
        },
        signal,
      );
      expect(response.status).toBe(204);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.source, ANON_SOURCE));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        visitorId: null,
        sessionId: null,
        event: "compare_opened",
        device: "mobile",
      });
      expect(row.comparedIds).toEqual([a.id, b.id]);
    }
    // A cookie the browser still holds is not read for it either.
    const held = randomUUID();
    await post(
      {
        event: "property_viewed",
        slug: a.slug,
        utm: { source: ANON_SOURCE, medium: null, campaign: null },
      },
      { "sec-gpc": "1", cookie: `${VISITOR_COOKIE}=${held}` },
    );
    const [viewed] = await db
      .select()
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.source, ANON_SOURCE),
          eq(analyticsEvents.event, "property_viewed"),
        ),
      );
    expect(viewed.visitorId).toBeNull();
  });

  it("records nothing for a crawler, an unknown event or a price", async () => {
    const before = (await db.select().from(analyticsEvents)).length;
    const refused = [
      await post(
        { event: "property_viewed", slug: a.slug },
        { "user-agent": "Googlebot/2.1" },
      ),
      await post({ event: "price_seen", slug: a.slug }),
      await post({ event: "property_viewed", slug: "no-such-property" }),
      await post({
        event: "property_viewed",
        slug: a.slug,
        band: "₹2,34,00,000",
      }),
    ];
    for (const response of refused) expect(response.status).toBe(204);
    // The two that were kept carry a visitor cookie; register it so afterAll
    // removes them (they were left behind on every run before).
    for (const response of refused) {
      if (response.headers.getSetCookie().length > 0) visitorOf(response);
    }
    // Only the last one is kept, and without the figure it tried to carry.
    const after = await db.select().from(analyticsEvents);
    expect(after.length).toBe(before + 1);
    const last = after.find(
      (row) =>
        row.visitorId !== null &&
        !visitorIds.includes(row.visitorId) &&
        row.budgetBand === null,
    );
    if (last?.visitorId) visitorIds.push(last.visitorId);
    expect(JSON.stringify(after)).not.toContain("2,34,00,000");
  });
});

describe("the dashboard and retention", () => {
  const at = (day: number, hour = 10, minute = 0) =>
    new Date(Date.UTC(2001, 0, day, hour, minute));
  const v1 = randomUUID();
  const v2 = randomUUID();
  const range = {
    from: new Date(Date.UTC(2001, 0, 1)),
    to: new Date(Date.UTC(2001, 1, 1)),
  };

  beforeAll(async () => {
    const s1 = randomUUID();
    const s2 = randomUUID();
    const base = { device: "desktop", signedIn: false };
    await db.insert(analyticsEvents).values([
      {
        ...base,
        occurredAt: at(3, 10, 0),
        visitorId: v1,
        sessionId: s1,
        event: "property_viewed",
        propertyId: a.id,
      },
      {
        ...base,
        occurredAt: at(3, 10, 1),
        visitorId: v1,
        sessionId: s1,
        event: "property_viewed",
        propertyId: b.id,
      },
      {
        ...base,
        occurredAt: at(3, 10, 2),
        visitorId: v1,
        sessionId: s1,
        event: "comparison_started",
        propertyId: b.id,
        comparedIds: [a.id, b.id],
      },
      {
        ...base,
        occurredAt: at(3, 10, 3),
        visitorId: v1,
        sessionId: s1,
        event: "compare_opened",
        comparedIds: [a.id, b.id],
        budgetBand: "₹2–3 crore",
      },
      {
        ...base,
        occurredAt: at(3, 10, 4),
        visitorId: v1,
        sessionId: s1,
        event: "page_engaged",
        comparedIds: [a.id, b.id],
        engagedMs: 90_000,
        detail: { page: "compare" },
      },
      {
        ...base,
        occurredAt: at(3, 11, 0),
        visitorId: v1,
        sessionId: s1,
        signedIn: true,
        event: "compare_opened",
        comparedIds: [a.id, b.id],
      },
      {
        ...base,
        occurredAt: at(3, 11, 1),
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
      // From a browser with a privacy signal: no ids, so they count as events but
      // never as a visitor, a visit or a step of the funnel.
      {
        ...base,
        occurredAt: at(4, 13),
        visitorId: null,
        sessionId: null,
        event: "compare_opened",
        comparedIds: [a.id, b.id],
      },
      {
        ...base,
        occurredAt: at(4, 13),
        visitorId: null,
        sessionId: null,
        event: "page_engaged",
        comparedIds: [a.id, b.id],
        engagedMs: 60_000,
        detail: { page: "compare" },
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
      eventsWithoutVisitor: 2,
      propertyViews: 3,
      comparisonsOpened: 3,
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
    expect(pair.comparisons).toBe(3);
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
      inComparisons: 3,
      topRival: b.name,
      topRivalCount: 3,
      medianDossierSeconds: 30,
    });
    expect(dashboard.groupsOpened).toEqual([
      { label: "Room by room", key: "rooms", count: 1 },
    ]);
    expect(dashboard.comparisonSize).toEqual([
      { label: "2 properties", count: 3 },
    ]);
    const sources = Object.fromEntries(
      dashboard.sources.map((row) => [row.label, row.visitors]),
    );
    expect(sources).toEqual({ Direct: 1, "google / cpc": 1 });
    expect(
      dashboard.budgetBands.find((row) => row.label === "₹2–3 crore"),
    ).toMatchObject({ visitors: 1, comparers: 1, enquirers: 1 });
    // Every Indian day the period touches is there (1 Feb 00:00 UTC is 05:30 in
    // India, so 1 January to 1 February is 32 days), the quiet ones as zeros.
    expect(dashboard.days).toHaveLength(32);
    expect(
      dashboard.days.filter((d) => d.visitors > 0).map((d) => d.day),
    ).toEqual(["2001-01-03", "2001-01-04"]);
    expect(dashboard.days[0]).toEqual({
      day: "2001-01-01",
      visitors: 0,
      comparisons: 0,
      enquiries: 0,
    });
  });

  it("lists the visitors behind a figure, narrowed by funnel step, gate, property or pair", async () => {
    const all = await listVisitors(db, range);
    expect(all.total).toBe(2);
    // Most recent first; the anonymous events belong to no visitor.
    expect(all.rows.map((row) => row.visitorId)).toEqual([v2, v1]);
    const one = all.rows.find((row) => row.visitorId === v1)!;
    expect(one).toMatchObject({
      visits: 1,
      events: 8,
      comparisons: 2,
      signedIn: true,
      enquired: true,
      device: "desktop",
      engagedSeconds: 90,
    });
    expect(one.viewed.sort()).toEqual([a.name, b.name].sort());
    expect(one.label).toBe(visitorLabel(v1));

    const ids = async (filter: Parameters<typeof listVisitors>[2]) =>
      (await listVisitors(db, range, filter)).rows.map((row) => row.visitorId);
    expect(await ids({ reached: "opened" })).toEqual([v1]);
    expect(await ids({ reached: "gate" })).toEqual([v1]);
    expect(await ids({ reached: "viewed_two" })).toEqual([v1]);
    expect(await ids({ reached: "saved" })).toEqual([]);
    // Viewed a property and went no further: the second visitor.
    expect(await ids({ stopped: "viewed" })).toEqual([v2]);
    expect(await ids({ stopped: "enquired" })).toEqual([v1]);
    expect(await ids({ propertyId: b.id })).toEqual([v1]);
    expect(await ids({ propertyId: a.id })).toEqual([v2, v1]);
    expect(await ids({ pair: [a.id, b.id] })).toEqual([v1]);
    expect(await ids({ pair: [a.id, randomUUID()] })).toEqual([]);
  });

  it("opens, from each source, budget, device and section row, exactly the visitors it counted", async () => {
    const dashboard = await loadAnalyticsDashboard(db, range);
    const total = async (filter: Parameters<typeof listVisitors>[2]) =>
      (await listVisitors(db, range, filter)).total;
    expect(dashboard.sources.length).toBeGreaterThan(0);
    for (const row of dashboard.sources) {
      expect(await total({ source: row.key })).toBe(row.visitors);
    }
    for (const row of dashboard.budgetBands) {
      expect(await total({ band: row.key })).toBe(row.visitors);
    }
    for (const row of dashboard.devices) {
      expect(await total({ device: row.key })).toBe(row.visitors);
    }
    expect(dashboard.groupsOpened.map((row) => row.key)).toEqual(["rooms"]);
    const opened = await listVisitors(db, range, { group: "rooms" });
    expect(opened.rows.map((row) => row.visitorId)).toEqual([v1]);
    // A value nobody has matches nobody; a bound parameter, never spliced in.
    expect(await total({ source: "x' or 'a'='a" })).toBe(0);
    expect(await total({ group: "no_such_section" })).toBe(0);
  });

  it("tells one visitor's journey in order, in words, by visit", async () => {
    const journey = (await loadJourney(db, v1))!;
    expect(journey.visits).toHaveLength(1);
    const texts = journey.visits[0].events.map((event) => event.text);
    expect(texts).toEqual([
      `Opened ${a.name}`,
      `Opened ${b.name}`,
      `Added ${b.name} to a comparison, now ${a.name} and ${b.name}`,
      `Opened a comparison of ${a.name} and ${b.name}, locked: not signed in`,
      `Spent 1m 30s on the comparison of ${a.name} and ${b.name}`,
      `Opened a comparison of ${a.name} and ${b.name}, signed in`,
      'Opened "Room by room" in the comparison',
      `Sent an enquiry about ${b.name}, while comparing ${a.name} and ${b.name}`,
    ]);
    expect(journey.visits[0].events.at(-1)?.href).toBe("/admin/enquiries");
    expect(journey).toMatchObject({
      signedIn: true,
      budgetBand: "₹2–3 crore",
      engagedSeconds: 90,
    });
    expect(await loadJourney(db, randomUUID())).toBeNull();
  });

  it("counts whole old months, then clears the ids and keeps the events", async () => {
    const before = await owner`
      select count(*)::int n from analytics_events where occurred_at < '2002-01-01'`;
    const { anonymised } = await purgeOldAnalytics(
      db,
      new Date(Date.UTC(2002, 5, 15)),
    );
    expect(anonymised).toBe(before[0].n);
    expect(anonymised).toBeGreaterThanOrEqual(12);

    const monthly = await owner`
      select event, property_id, events, visitors, engaged_ms from analytics_event_monthly
      where month = '2001-01-01'`;
    const count = (event: string, propertyId: string | null) =>
      monthly.find(
        (row) => row.event === event && row.property_id === propertyId,
      );
    expect(Number(count("property_viewed", a.id)?.events)).toBe(2);
    expect(Number(count("property_viewed", a.id)?.visitors)).toBe(2);
    // The compare time of the identified visitor and of the anonymous event.
    expect(Number(count("page_engaged", null)?.engaged_ms)).toBe(150_000);

    const [pair] = await owner`
      select comparisons, visitors from analytics_pair_monthly where month = '2001-01-01'`;
    expect(Number(pair.comparisons)).toBe(3);
    // Distinct visitors survive the ids; the anonymous event adds none.
    expect(Number(pair.visitors)).toBe(1);

    // The events stay, with what they said, but nothing ties them to a browser.
    const [left] = await owner`
      select count(*)::int n,
        count(*) filter (where visitor_id is not null or session_id is not null)::int ids,
        count(*) filter (where anonymised_at is null)::int unstamped,
        count(*) filter (where budget_band = '₹2–3 crore')::int bands
      from analytics_events where occurred_at < '2002-01-01'`;
    expect(left.n).toBe(before[0].n);
    expect(left.ids).toBe(0);
    expect(left.unstamped).toBe(0);
    expect(left.bands).toBe(1);

    // A second run counts nothing twice.
    const again = await purgeOldAnalytics(db, new Date(Date.UTC(2002, 5, 15)));
    expect(again.anonymised).toBe(0);
    const [still] = await owner`
      select comparisons from analytics_pair_monthly where month = '2001-01-01'`;
    expect(Number(still.comparisons)).toBe(3);
  });

  it("does not let the application role delete or rewrite an event", async () => {
    await expect(
      db.execute(
        sql`delete from analytics_events where occurred_at < '2002-01-01'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`update analytics_events set event = 'x' where occurred_at < '2002-01-01'`,
      ),
    ).rejects.toThrow();
  });

  it("sums a visitor's dossier pings within one visit before taking the median (2026-09-26)", async () => {
    // Its own visitor, session and day so this is exactly its own figures: two
    // pings on the same visit (35s + 15s) must count as one 50-second visit,
    // not two separate data points of 35 and 15 — the mistake this fixes.
    const visitorId = randomUUID();
    const sessionId = randomUUID();
    const day = new Date(Date.UTC(2001, 0, 20, 10));
    await db.insert(analyticsEvents).values([
      {
        occurredAt: day,
        visitorId,
        sessionId,
        event: "property_viewed",
        signedIn: false,
        device: "desktop",
        propertyId: a.id,
      },
      {
        occurredAt: day,
        visitorId,
        sessionId,
        event: "page_engaged",
        signedIn: false,
        device: "desktop",
        propertyId: a.id,
        engagedMs: 35_000,
        detail: { page: "dossier" },
      },
      {
        occurredAt: new Date(day.getTime() + 60_000),
        visitorId,
        sessionId,
        event: "page_engaged",
        signedIn: false,
        device: "desktop",
        propertyId: a.id,
        engagedMs: 15_000,
        detail: { page: "dossier" },
      },
    ]);
    visitorIds.push(visitorId);

    const dashboard = await loadAnalyticsDashboard(db, {
      from: new Date(Date.UTC(2001, 0, 20)),
      to: new Date(Date.UTC(2001, 0, 21)),
    });
    expect(dashboard.overview.medianDossierSecondsPerView).toBe(50);
    expect(
      dashboard.properties.find((row) => row.id === a.id)?.medianDossierSeconds,
    ).toBe(50);
  });
});

describe("POST /api/v1/events rate limit", () => {
  const LIMITED_SOURCE = `${ANON_SOURCE}-limit`;
  const valid = {
    event: "property_viewed",
    slug: "",
    utm: { source: LIMITED_SOURCE, medium: null, campaign: null },
  };
  const from = (address: string) => ({ "x-forwarded-for": address });

  it("stops recording one address after a minute's allowance, and leaves another alone, still with a 204", async () => {
    const noisy = "198.51.100." + (1 + Math.floor(Math.random() * 200));
    // Junk bodies count against the limit without recording anything.
    for (let i = 0; i < EVENTS_PER_WINDOW; i += 1) {
      await post({ event: "not-an-event" }, from(noisy));
    }
    const refused = await post({ ...valid, slug: a.slug }, from(noisy));
    expect(refused.status).toBe(204);
    // A recorded event sets the visitor cookie; a dropped one leaves no trace.
    expect(refused.headers.getSetCookie()).toEqual([]);

    const other = await post(
      { ...valid, slug: a.slug },
      from("203.0.113." + (1 + Math.floor(Math.random() * 200))),
    );
    visitorOf(other);

    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.source, LIMITED_SOURCE));
    expect(rows).toHaveLength(1);
  });
});
