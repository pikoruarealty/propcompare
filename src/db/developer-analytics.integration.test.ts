import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, dbClient } from "@/db";
import {
  developerReaderDb,
  developerReaderDbClient,
} from "@/db/developer-reader";
import { analyticsEvents } from "@/db/schema/analytics";
import {
  developerAnalyticsBenchmarks,
  developerAnalyticsPairings,
  developerAnalyticsReleased,
  developerAnalyticsRuns,
} from "@/db/schema/developer-analytics";
import { KEPT_RUNS, releaseDeveloperAnalytics } from "@/lib/analytics/release";
import {
  STALE_AFTER_HOURS,
  getExportRows,
  getPortfolioReport,
  getPropertyReport,
} from "@/lib/developers/analytics/report";
import { changeListingStatus } from "@/lib/submissions/listing";
import {
  publishTestPortfolio,
  type TestPortfolio,
} from "@/lib/submissions/test-support";

/**
 * Schema v21 against the real database (`docs/schema/schema.v21.md`,
 * `DECISIONS.md` 2026-09-26): the developer reader role sees the released
 * figures and nothing else, the table refuses a figure that breaks a release
 * rule, and the release job writes exactly the figures the rules allow.
 *
 * One file on purpose: the job prunes old runs and takes the one running slot,
 * so its tests must not run beside the table's tests in another file.
 */

const DENIED = "42501";
const CHECK = "23514";
const UNIQUE = "23505";

const app = dbClient;
const reader = developerReaderDbClient;

let developerId: string;
let runId: string;

/** One released-table row; each test overrides what it is about. */
const insertFigure = (row: Record<string, unknown>) =>
  app`insert into developer_analytics_released ${app({
    run_id: runId,
    window: "30d",
    window_start: "2026-08-27",
    window_end: "2026-09-25",
    developer_id: developerId,
    property_id: null,
    metric: "visitors",
    dimension: "none",
    dimension_value: null,
    released: true,
    value: 12,
    ...row,
  })}`;

beforeAll(async () => {
  [{ id: developerId }] = await app`
    insert into developers (name) values (${`Release Test Developer ${randomUUID()}`})
    returning id`;
  [{ id: runId }] = await app`
    insert into developer_analytics_runs
      (status, finished_at, data_through, min_visitors, rules_version)
    values ('succeeded', now(), '2026-09-25', 5, 'release-v1')
    returning id`;
});

afterAll(async () => {
  await app`delete from developer_analytics_runs where id = ${runId}`;
  await app`delete from developers where id = ${developerId}`;
  await reader.end();
});

describe("the developer reader role", () => {
  it("reads released figures and runs", async () => {
    await insertFigure({ metric: "viewers", value: 7 });
    const rows = await reader`
      select metric, released, value from developer_analytics_released
      where run_id = ${runId} and metric = 'viewers'`;
    expect(rows).toEqual([{ metric: "viewers", released: true, value: "7" }]);
    const runs = await reader`
      select status from developer_analytics_runs where id = ${runId}`;
    expect(runs).toEqual([{ status: "succeeded" }]);
  });

  it.each([
    "analytics_events",
    "analytics_event_monthly",
    "analytics_pair_monthly",
    "properties",
    "developers",
    "users",
    "enquiries",
    "private.budget_buckets",
  ])("cannot read %s", async (table) => {
    await expect(
      reader.unsafe(`select 1 from ${table} limit 1`),
    ).rejects.toMatchObject({ code: DENIED });
  });

  it("cannot write released figures or runs", async () => {
    await expect(
      reader`delete from developer_analytics_released where run_id = ${runId}`,
    ).rejects.toMatchObject({ code: DENIED });
    await expect(
      reader`update developer_analytics_runs set status = 'failed' where id = ${runId}`,
    ).rejects.toMatchObject({ code: DENIED });
  });

  it("holds no other table privilege and no role membership", async () => {
    // From the catalog itself: `information_schema` only lists grants the
    // querying role takes part in, so it would show nothing here.
    const grants = await app`
      select n.nspname as table_schema, c.relname as table_name,
             acl.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) acl
      join pg_roles r on r.oid = acl.grantee
      where r.rolname = 'propcompare_developer_reader'
      order by c.relname, acl.privilege_type`;
    expect(grants).toEqual([
      {
        table_schema: "public",
        table_name: "developer_analytics_benchmarks",
        privilege_type: "SELECT",
      },
      {
        table_schema: "public",
        table_name: "developer_analytics_pairings",
        privilege_type: "SELECT",
      },
      {
        table_schema: "public",
        table_name: "developer_analytics_released",
        privilege_type: "SELECT",
      },
      {
        table_schema: "public",
        table_name: "developer_analytics_runs",
        privilege_type: "SELECT",
      },
    ]);
    const [role] = await app`
      select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit,
             (select count(*)::int from pg_auth_members m where m.member = r.oid) as memberships
      from pg_roles r where rolname = 'propcompare_developer_reader'`;
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolinherit: false,
      memberships: 0,
    });
  });
});

describe("the released table's rules", () => {
  it("stores a withheld figure with no number, and never a number without release", async () => {
    await insertFigure({ metric: "savers", released: false, value: null });
    await expect(
      insertFigure({ metric: "unlockers", released: false, value: 0 }),
    ).rejects.toMatchObject({ code: CHECK });
    await expect(
      insertFigure({ metric: "comparers", released: true, value: null }),
    ).rejects.toMatchObject({ code: CHECK });
  });

  it("refuses any enquiry figure, even across the whole portfolio", async () => {
    for (const metric of ["enquirers", "enquirers_comparing", "enquiries"]) {
      await expect(insertFigure({ metric, value: 6 })).rejects.toMatchObject({
        code: CHECK,
      });
    }
  });

  it("accepts only known splits", async () => {
    await insertFigure({
      metric: "visitors",
      dimension: "budget_band",
      dimension_value: "₹1–1.5 crore",
    });
    await expect(
      insertFigure({
        metric: "visitors",
        dimension: "budget_band",
        dimension_value: "₹1.25 crore",
      }),
    ).rejects.toMatchObject({ code: CHECK });
    await expect(
      insertFigure({
        metric: "visitors",
        dimension: "none",
        dimension_value: "x",
      }),
    ).rejects.toMatchObject({ code: CHECK });
  });

  it("accepts only known windows and metrics", async () => {
    await expect(insertFigure({ window: "13m" })).rejects.toMatchObject({
      code: CHECK,
    });
    await expect(insertFigure({ metric: "score" })).rejects.toMatchObject({
      code: CHECK,
    });
  });

  it("holds one figure per window, property, metric and split in a run", async () => {
    await insertFigure({ metric: "visits", value: 20 });
    await expect(
      insertFigure({ metric: "visits", value: 21 }),
    ).rejects.toMatchObject({ code: UNIQUE });
  });

  it("allows one running job at a time, and a failure only with a short code", async () => {
    const [{ id }] = await app`
      insert into developer_analytics_runs (status, data_through, min_visitors, rules_version)
      values ('running', '2026-09-26', 5, 'release-v1') returning id`;
    try {
      await expect(
        app`insert into developer_analytics_runs (status, data_through, min_visitors, rules_version)
            values ('running', '2026-09-26', 5, 'release-v1')`,
      ).rejects.toMatchObject({ code: UNIQUE });
      await expect(
        app`update developer_analytics_runs
            set status = 'failed', finished_at = now(), error_code = 'Stack trace: ...'
            where id = ${id}`,
      ).rejects.toMatchObject({ code: CHECK });
    } finally {
      await app`delete from developer_analytics_runs where id = ${id}`;
    }
  });
});

describe("the release job", () => {
  // Data through 2031-06-15 (India time): no real event and no other test's
  // event is in June 2031, so every figure below is exactly this file's.
  const NOW = new Date("2031-06-16T06:00:00Z");
  const IN_WINDOW = new Date("2031-06-14T06:00:00Z");
  const events: (typeof analyticsEvents.$inferInsert)[] = [];

  let ours: TestPortfolio;
  let theirs: TestPortfolio;
  let unlisted: TestPortfolio;
  let p1 = "";
  let p2 = "";
  let rival = "";
  let hidden = "";

  const event = (
    visitorId: string,
    sessionId: string,
    name: string,
    fields: Partial<typeof analyticsEvents.$inferInsert> = {},
  ) =>
    events.push({
      occurredAt: IN_WINDOW,
      visitorId,
      sessionId,
      event: name,
      signedIn: false,
      device: "mobile",
      ...fields,
    });

  const figure = async (
    runId: string,
    window: string,
    developerId: string,
    propertyId: string | null,
    metric: string,
    dimension = "none",
    dimensionValue: string | null = null,
  ) => {
    const rows = await db
      .select({
        propertyId: developerAnalyticsReleased.propertyId,
        dimensionValue: developerAnalyticsReleased.dimensionValue,
        released: developerAnalyticsReleased.released,
        value: developerAnalyticsReleased.value,
      })
      .from(developerAnalyticsReleased)
      .where(
        and(
          eq(developerAnalyticsReleased.runId, runId),
          eq(developerAnalyticsReleased.window, window),
          eq(developerAnalyticsReleased.developerId, developerId),
          eq(developerAnalyticsReleased.metric, metric),
          eq(developerAnalyticsReleased.dimension, dimension),
        ),
      );
    const row = rows.find(
      (r) => r.propertyId === propertyId && r.dimensionValue === dimensionValue,
    );
    if (!row) return undefined;
    return {
      released: row.released,
      value: row.value === null ? null : Number(row.value),
    };
  };

  const shown = (value: number) => ({ released: true, value });
  const withheld = { released: false, value: null };

  let firstRun = "";

  beforeAll(async () => {
    ours = await publishTestPortfolio("Release ours", 2);
    theirs = await publishTestPortfolio("Release theirs");
    unlisted = await publishTestPortfolio("Release unlisted");
    [p1, p2] = ours.properties.map((property) => property.id);
    rival = theirs.properties[0].id;
    hidden = unlisted.properties[0].id;
    await changeListingStatus(db, {
      propertyId: hidden,
      status: "unlisted",
      actorUserId: unlisted.ownerUserId,
    });

    // p1: thirteen viewers (7 mobile, 5 desktop, 1 tablet); six state a band.
    const viewers = Array.from({ length: 13 }, () => ({
      visitorId: randomUUID(),
      sessionId: randomUUID(),
    }));
    viewers.forEach(({ visitorId, sessionId }, index) =>
      event(visitorId, sessionId, "property_viewed", {
        propertyId: p1,
        device: index < 7 ? "mobile" : index < 12 ? "desktop" : "tablet",
        budgetBand: index < 6 ? "₹1–1.5 crore" : null,
      }),
    );
    // The first viewer comes back twice more: 3 visits, 1 returning visitor.
    for (let visit = 0; visit < 2; visit += 1) {
      event(viewers[0].visitorId, randomUUID(), "property_viewed", {
        propertyId: p1,
      });
    }
    // Five of them read the dossier: 10+20 (same viewer), 20, 30, 40, 50 seconds.
    [10, 20, 30, 40, 50].forEach((seconds, index) =>
      event(
        viewers[index].visitorId,
        viewers[index].sessionId,
        "page_engaged",
        {
          propertyId: p1,
          engagedMs: seconds * 1000,
          detail: { page: "dossier" },
        },
      ),
    );
    event(viewers[0].visitorId, viewers[0].sessionId, "page_engaged", {
      propertyId: p1,
      engagedMs: 20_000,
      detail: { page: "dossier" },
    });
    // Four save it: one short of the gate, so the figure is withheld.
    viewers
      .slice(0, 4)
      .forEach(({ visitorId, sessionId }) =>
        event(visitorId, sessionId, "property_saved", { propertyId: p1 }),
      );
    // Six enquire: recorded in v20, never released to a developer.
    viewers.slice(0, 6).forEach(({ visitorId, sessionId }) =>
      event(visitorId, sessionId, "enquiry_submitted", {
        propertyId: p1,
        comparedIds: [p1, rival],
      }),
    );
    // Five others compare p1 with another developer's property.
    for (let index = 0; index < 5; index += 1) {
      event(randomUUID(), randomUUID(), "compare_opened", {
        comparedIds: [p1, rival],
      });
    }
    // Three more views and one more comparison from browsers with no visitor
    // id (a privacy signal): they count toward `views`/`comparisons`, the gate
    // stays the 13 identified viewers above, and they never appear in
    // `viewers`/`visitors` (2026-09-26, "count as activity, gate on identified").
    for (let index = 0; index < 3; index += 1) {
      events.push({
        occurredAt: IN_WINDOW,
        visitorId: null,
        sessionId: null,
        event: "property_viewed",
        propertyId: p1,
        signedIn: false,
        device: "mobile",
      });
    }
    events.push({
      occurredAt: IN_WINDOW,
      visitorId: null,
      sessionId: null,
      event: "compare_opened",
      comparedIds: [p1, rival],
      signedIn: false,
      device: "mobile",
    });

    // p2: window edges. Four inside; one at the 7-day window's first instant;
    // one a second before it (30-day only); one just after the last day.
    for (let index = 0; index < 4; index += 1) {
      event(randomUUID(), randomUUID(), "property_viewed", { propertyId: p2 });
    }
    event(randomUUID(), randomUUID(), "property_viewed", {
      propertyId: p2,
      occurredAt: new Date("2031-06-08T18:30:00Z"),
    });
    event(randomUUID(), randomUUID(), "property_viewed", {
      propertyId: p2,
      occurredAt: new Date("2031-06-08T18:29:59Z"),
    });
    event(randomUUID(), randomUUID(), "property_viewed", {
      propertyId: p2,
      occurredAt: new Date("2031-06-15T18:30:00Z"),
    });

    // An unlisted property with six viewers: no figures at all.
    for (let index = 0; index < 6; index += 1) {
      event(randomUUID(), randomUUID(), "property_viewed", {
        propertyId: hidden,
      });
    }

    await db.insert(analyticsEvents).values(events);
    firstRun = (await releaseDeveloperAnalytics(db, NOW)).runId;
  });

  afterAll(async () => {
    await db
      .delete(developerAnalyticsRuns)
      .where(eq(developerAnalyticsRuns.dataThrough, "2031-06-15"));
    // The application role may no longer delete an event (schema v22), so the
    // owner role tidies up the ones this file made.
    const owner = postgres(
      process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!,
    );
    await owner`delete from analytics_events
      where occurred_at >= '2031-01-01'::timestamptz
        and occurred_at < '2032-01-01'::timestamptz`;
    await owner.end();
    await ours?.remove();
    await theirs?.remove();
    await unlisted?.remove();
  });

  it("records a finished run through the last whole India-time day", async () => {
    const [run] = await db
      .select()
      .from(developerAnalyticsRuns)
      .where(eq(developerAnalyticsRuns.id, firstRun));
    expect(run).toMatchObject({
      status: "succeeded",
      dataThrough: "2031-06-15",
      minVisitors: 5,
      rulesVersion: "release-v2",
      errorCode: null,
    });
    expect(run.finishedAt).not.toBeNull();
    expect(run.trackingSince).not.toBeNull();
  });

  it("releases a property's figures at 5 visitors and withholds the rest", async () => {
    const at = (metric: string) =>
      figure(firstRun, "7d", ours.developerId, p1, metric);
    expect(await at("visitors")).toEqual(shown(18));
    expect(await at("viewers")).toEqual(shown(13));
    expect(await at("comparers")).toEqual(shown(5));
    expect(await at("visits")).toEqual(shown(20));
    expect(await at("median_dossier_seconds")).toEqual(shown(30));
    // 2026-09-26: the gate stays on identified visitors (unchanged above),
    // but `views`/`comparisons` also count the anonymous activity the gate
    // does not otherwise show: 15 identified property views (13 viewers, one
    // of whom returned twice) plus 3 anonymous; 5 identified comparisons plus
    // 1 anonymous.
    expect(await at("views")).toEqual(shown(18));
    expect(await at("comparisons")).toEqual(shown(6));
    // Four savers and one returning visitor are under the gate; nobody
    // unlocked or timed a comparison.
    expect(await at("returning_visitors")).toEqual(withheld);
    expect(await at("savers")).toEqual(withheld);
    expect(await at("unlockers")).toEqual(withheld);
    expect(await at("median_compare_seconds")).toEqual(withheld);
  });

  it("withholds a second split when only one would be hidden", async () => {
    const device = (metric: string, value: string) =>
      figure(firstRun, "7d", ours.developerId, p1, metric, "device", value);
    expect(await device("viewers", "mobile")).toEqual(shown(7));
    expect(await device("viewers", "desktop")).toEqual(withheld);
    expect(await device("viewers", "tablet")).toEqual(withheld);
    expect(await device("visitors", "mobile")).toEqual(shown(12));
    expect(await device("visitors", "desktop")).toEqual(withheld);
    expect(
      await figure(
        firstRun,
        "7d",
        ours.developerId,
        p1,
        "visitors",
        "budget_band",
        "₹1–1.5 crore",
      ),
    ).toEqual(shown(6));
  });

  it("counts the portfolio once per visitor", async () => {
    const at = (metric: string) =>
      figure(firstRun, "7d", ours.developerId, null, metric);
    expect(await at("visitors")).toEqual(shown(23));
    expect(await at("visits")).toEqual(shown(25));
    expect(await at("returning_visitors")).toEqual(withheld);
  });

  it("cuts windows at India-time midnight", async () => {
    expect(
      await figure(firstRun, "7d", ours.developerId, p2, "visitors"),
    ).toEqual(shown(5));
    expect(
      await figure(firstRun, "30d", ours.developerId, p2, "visitors"),
    ).toEqual(shown(6));
  });

  it("releases nothing about enquiries, unlisted properties or another developer's property", async () => {
    const rows = await db
      .select({
        developerId: developerAnalyticsReleased.developerId,
        propertyId: developerAnalyticsReleased.propertyId,
        metric: developerAnalyticsReleased.metric,
      })
      .from(developerAnalyticsReleased)
      .where(eq(developerAnalyticsReleased.runId, firstRun));
    expect(rows.some((row) => row.metric.startsWith("enquir"))).toBe(false);
    expect(rows.some((row) => row.propertyId === hidden)).toBe(false);
    expect(rows.some((row) => row.developerId === unlisted.developerId)).toBe(
      false,
    );
    const ourProperties = new Set(
      rows
        .filter((row) => row.developerId === ours.developerId)
        .map((row) => row.propertyId),
    );
    expect(ourProperties).toEqual(new Set([p1, p2, null]));
    // The rival is counted for its own developer, never for ours.
    expect(
      await figure(firstRun, "7d", theirs.developerId, rival, "comparers"),
    ).toEqual(shown(5));
  });

  it("gives the same figures on a rerun", async () => {
    const snapshot = async (runId: string) =>
      (
        await db
          .select({
            window: developerAnalyticsReleased.window,
            propertyId: developerAnalyticsReleased.propertyId,
            metric: developerAnalyticsReleased.metric,
            dimension: developerAnalyticsReleased.dimension,
            dimensionValue: developerAnalyticsReleased.dimensionValue,
            released: developerAnalyticsReleased.released,
            value: developerAnalyticsReleased.value,
          })
          .from(developerAnalyticsReleased)
          .where(
            and(
              eq(developerAnalyticsReleased.runId, runId),
              eq(developerAnalyticsReleased.developerId, ours.developerId),
            ),
          )
      )
        .map((row) => JSON.stringify(row))
        .sort();
    const { runId } = await releaseDeveloperAnalytics(db, NOW);
    expect(await snapshot(runId)).toEqual(await snapshot(firstRun));
  });

  it("records a failed run and leaves the last good figures in place", async () => {
    const latest = async () =>
      (
        await db
          .select({ id: developerAnalyticsRuns.id })
          .from(developerAnalyticsRuns)
          .where(eq(developerAnalyticsRuns.status, "succeeded"))
          .orderBy(desc(developerAnalyticsRuns.finishedAt))
          .limit(1)
      )[0].id;
    const before = await latest();
    // Another run holds the only running slot.
    const [blocker] = await db
      .insert(developerAnalyticsRuns)
      .values({
        status: "running",
        dataThrough: "2031-06-15",
        minVisitors: 5,
        rulesVersion: "release-v1",
      })
      .returning({ id: developerAnalyticsRuns.id });
    try {
      await expect(releaseDeveloperAnalytics(db, NOW)).rejects.toThrow();
    } finally {
      await db
        .delete(developerAnalyticsRuns)
        .where(eq(developerAnalyticsRuns.id, blocker.id));
    }
    const failed = await db
      .select({ errorCode: developerAnalyticsRuns.errorCode })
      .from(developerAnalyticsRuns)
      .where(
        and(
          eq(developerAnalyticsRuns.status, "failed"),
          eq(developerAnalyticsRuns.dataThrough, "2031-06-15"),
        ),
      );
    expect(failed).toEqual([{ errorCode: "release_failed" }]);
    expect(await latest()).toBe(before);
    expect(
      await figure(before, "7d", ours.developerId, p1, "visitors"),
    ).toEqual(shown(18));
  });

  it(`keeps only the latest ${KEPT_RUNS} successful runs`, async () => {
    for (let run = 0; run < KEPT_RUNS; run += 1) {
      await releaseDeveloperAnalytics(db, NOW);
    }
    const kept = await db
      .select({ id: developerAnalyticsRuns.id })
      .from(developerAnalyticsRuns)
      .where(eq(developerAnalyticsRuns.status, "succeeded"));
    expect(kept.length).toBe(KEPT_RUNS);
    expect(kept.some((run) => run.id === firstRun)).toBe(false);
  }, 60_000);
});

/**
 * The job's named rivals and peer benchmarks (schema v23): built from raw events
 * in a city of their own, so the cohorts hold exactly these properties and no
 * other row in the database can move a median.
 */
describe("the release job: rivals and peer benchmarks", () => {
  const NOW = new Date("2032-06-16T06:00:00Z");
  const IN_WINDOW = new Date("2032-06-14T06:00:00Z");
  const city = `Benchmark City ${randomUUID()}`;
  const events: (typeof analyticsEvents.$inferInsert)[] = [];

  let one: TestPortfolio;
  let two: TestPortfolio;
  let three: TestPortfolio;
  let four: TestPortfolio;
  let hiddenPortfolio: TestPortfolio;
  let a = "";
  let b = "";
  let c1 = "";
  let c2 = "";
  let d1 = "";
  let d2 = "";
  let e = "";
  let hidden = "";
  let runId = "";

  const event = (
    name: string,
    fields: Partial<typeof analyticsEvents.$inferInsert>,
    visitorId: string | null = randomUUID(),
  ) =>
    events.push({
      occurredAt: IN_WINDOW,
      visitorId,
      sessionId: visitorId === null ? null : randomUUID(),
      event: name,
      signedIn: false,
      device: "mobile",
      ...fields,
    });

  const viewed = (propertyId: string, visitors: number) => {
    for (let index = 0; index < visitors; index += 1) {
      event("property_viewed", { propertyId });
    }
  };

  /** `visitors` distinct visitors each open a comparison of these properties. */
  const compared = (comparedIds: string[], visitors: number) => {
    for (let index = 0; index < visitors; index += 1) {
      event("compare_opened", { comparedIds });
    }
  };

  const pairings = async (window: string) =>
    (
      await db
        .select({
          propertyId: developerAnalyticsPairings.propertyId,
          rivalPropertyId: developerAnalyticsPairings.rivalPropertyId,
          visitors: developerAnalyticsPairings.visitors,
        })
        .from(developerAnalyticsPairings)
        .where(
          and(
            eq(developerAnalyticsPairings.runId, runId),
            eq(developerAnalyticsPairings.window, window),
          ),
        )
    ).map((row) => `${row.propertyId}>${row.rivalPropertyId}:${row.visitors}`);

  const benchmarks = async (window: string, metric: string) =>
    Object.fromEntries(
      (
        await db
          .select({
            propertyId: developerAnalyticsBenchmarks.propertyId,
            cohort: developerAnalyticsBenchmarks.cohort,
            cohortProperties: developerAnalyticsBenchmarks.cohortProperties,
            cohortDevelopers: developerAnalyticsBenchmarks.cohortDevelopers,
            median: developerAnalyticsBenchmarks.median,
          })
          .from(developerAnalyticsBenchmarks)
          .where(
            and(
              eq(developerAnalyticsBenchmarks.runId, runId),
              eq(developerAnalyticsBenchmarks.window, window),
              eq(developerAnalyticsBenchmarks.metric, metric),
            ),
          )
      ).map((row) => [
        row.propertyId,
        {
          cohort: row.cohort,
          properties: row.cohortProperties,
          developers: row.cohortDevelopers,
          median: Number(row.median),
        },
      ]),
    );

  beforeAll(async () => {
    const where = { city };
    one = await publishTestPortfolio("Peer one", 2, where);
    two = await publishTestPortfolio("Peer two", 2, where);
    three = await publishTestPortfolio("Peer three", 2, where);
    four = await publishTestPortfolio("Peer four", 1, where);
    hiddenPortfolio = await publishTestPortfolio("Peer hidden", 1, where);
    [a, b] = one.properties.map((property) => property.id);
    [c1, c2] = two.properties.map((property) => property.id);
    [d1, d2] = three.properties.map((property) => property.id);
    e = four.properties[0].id;
    hidden = hiddenPortfolio.properties[0].id;
    await changeListingStatus(db, {
      propertyId: hidden,
      status: "unlisted",
      actorUserId: hiddenPortfolio.ownerUserId,
    });

    // Viewers per property: a 20, b 2, c1 8, c2 6, d1 10, d2 0, e 5, and thirty
    // on an unlisted one that no cohort may count.
    viewed(a, 20);
    viewed(b, 2);
    viewed(c1, 8);
    viewed(c2, 6);
    viewed(d1, 10);
    viewed(e, 5);
    viewed(hidden, 30);

    // a with c1: six visitors, one of whom opens it three times.
    compared([a, c1], 6);
    const repeat = randomUUID();
    for (let times = 0; times < 2; times += 1) {
      event("compare_opened", { comparedIds: [a, c1] }, repeat);
    }
    // a with d1: only four. a with its own b: five. a with an unlisted one: eight.
    compared([a, d1], 4);
    compared([a, b], 5);
    compared([a, hidden], 8);
    // a with e: five identified visitors and thirty browsers with no id.
    compared([a, e], 5);
    for (let index = 0; index < 30; index += 1) {
      event("compare_opened", { comparedIds: [a, e] }, null);
    }
    // A three-way comparison pairs each two of them.
    compared([c1, d1, e], 5);

    await db.insert(analyticsEvents).values(events);
    runId = (await releaseDeveloperAnalytics(db, NOW)).runId;
  });

  afterAll(async () => {
    await db
      .delete(developerAnalyticsRuns)
      .where(eq(developerAnalyticsRuns.dataThrough, "2032-06-15"));
    const owner = postgres(
      process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL!,
    );
    await owner`delete from analytics_events
      where occurred_at >= '2032-01-01'::timestamptz
        and occurred_at < '2033-01-01'::timestamptz`;
    await owner.end();
    for (const portfolio of [one, two, three, four, hiddenPortfolio]) {
      await portfolio?.remove();
    }
  });

  it("names only the properties compared with by at least five visitors", async () => {
    const got = await pairings("7d");
    const expected = [
      // a with c1: six visitors and a seventh who opens it twice, counted once.
      `${a}>${c1}:7`,
      `${c1}>${a}:7`,
      // a with its own b: allowed, and a developer's own project is named as such
      // by the service.
      `${a}>${b}:5`,
      `${b}>${a}:5`,
      // a with e: five identified visitors; the thirty with no id do not count.
      `${a}>${e}:5`,
      `${e}>${a}:5`,
      // The three-way comparison.
      `${c1}>${d1}:5`,
      `${d1}>${c1}:5`,
      `${c1}>${e}:5`,
      `${e}>${c1}:5`,
      `${d1}>${e}:5`,
      `${e}>${d1}:5`,
    ];
    expect(got.sort()).toEqual(expected.sort());
  });

  it("never pairs an unlisted property, a pair of four, or a property with itself", async () => {
    const got = (await pairings("7d")).join(" ");
    expect(got).not.toContain(hidden);
    expect(got).not.toContain(`${a}>${d1}`);
    expect(got).not.toContain(`${a}>${a}`);
    expect(await pairings("12m")).toEqual(await pairings("7d"));
  });

  it("sets each property against the median of the other developers' properties in its city", async () => {
    const viewers = await benchmarks("7d", "viewers");
    const city5 = (properties: number, developers: number, median: number) => ({
      cohort: "city",
      properties,
      developers,
      median,
    });
    expect(viewers[a]).toEqual(city5(5, 3, 6)); // c1 8, c2 6, d1 10, d2 0, e 5
    expect(viewers[b]).toEqual(city5(5, 3, 6));
    // c1's own developer and c1 itself are left out: a 20, b 2, d1 10, d2 0, e 5.
    expect(viewers[c1]).toEqual(city5(5, 3, 5));
    expect(viewers[c2]).toEqual(city5(5, 3, 5));
    expect(viewers[d1]).toEqual(city5(5, 3, 6));
    expect(viewers[d2]).toEqual(city5(5, 3, 6));
    // Six others, so the two middle values are averaged: 0, 2, 6, 8, 10, 20.
    expect(viewers[e]).toEqual(city5(6, 3, 7));
    expect(viewers[hidden]).toBeUndefined();
  });

  it("releases no benchmark whose median is under the gate", async () => {
    // Nobody saved anything, so every cohort's median is zero.
    expect(await benchmarks("7d", "savers")).toEqual({});
    const all = await db
      .select({ median: developerAnalyticsBenchmarks.median })
      .from(developerAnalyticsBenchmarks)
      .where(eq(developerAnalyticsBenchmarks.runId, runId));
    expect(all.every((row) => Number(row.median) >= 5)).toBe(true);
  });

  it("reads through the restricted role and holds nothing about the cohort's members", async () => {
    const [{ count }] = await reader`
      select count(*)::int as count from developer_analytics_benchmarks
      where run_id = ${runId}`;
    expect(count).toBeGreaterThan(0);
    const columns = await app`
      select column_name from information_schema.columns
      where table_name = 'developer_analytics_benchmarks'
      order by ordinal_position`;
    const names = columns.map((row) => row.column_name as string).join(" ");
    expect(names).not.toMatch(/visitor|session|member|rival|name/);
  });
});

/**
 * What a signed-in developer's services return over the released tables, read
 * through the real restricted `propcompare_developer_reader` connection: only
 * their own properties, withheld figures without a number, and nothing about
 * another developer. Here in this file because the services read "the latest
 * successful run", which the job's tests above also create and prune.
 */
describe("the developer report services", () => {
  const connections = { reader: developerReaderDb, catalog: db };
  const TRACKING_SINCE = new Date("2026-09-10T00:00:00Z");

  let a: TestPortfolio;
  let b: TestPortfolio;
  let c: TestPortfolio;
  let d: TestPortfolio;
  let reportRun = "";
  let finishedAt: Date;
  let a1 = "";
  let a2 = "";
  let b1 = "";

  const fig = (
    developer: string,
    property: string | null,
    metric: string,
    released: boolean,
    value: number | null,
    split?: [string, string],
    window: "30d" | "7d" = "30d",
  ) => ({
    runId: reportRun,
    window,
    windowStart: window === "30d" ? "2026-08-27" : "2026-09-19",
    windowEnd: "2026-09-25",
    developerId: developer,
    propertyId: property,
    metric,
    dimension: split ? split[0] : "none",
    dimensionValue: split ? split[1] : null,
    released,
    value: value === null ? null : String(value),
  });

  beforeAll(async () => {
    a = await publishTestPortfolio("Report A", 2);
    b = await publishTestPortfolio("Report B");
    c = await publishTestPortfolio("Report C");
    d = await publishTestPortfolio("Report D");
    [a1, a2] = a.properties.map((property) => property.id);
    b1 = b.properties[0].id;

    const [run] = await db
      .insert(developerAnalyticsRuns)
      .values({
        status: "succeeded",
        startedAt: new Date(Date.now() + 60 * 60 * 1000),
        finishedAt: new Date(Date.now() + 60 * 60 * 1000),
        dataThrough: "2026-09-25",
        trackingSince: TRACKING_SINCE,
        minVisitors: 5,
        rulesVersion: "release-v1",
      })
      .returning({
        id: developerAnalyticsRuns.id,
        finishedAt: developerAnalyticsRuns.finishedAt,
      });
    reportRun = run.id;
    finishedAt = run.finishedAt as Date;

    await db
      .insert(developerAnalyticsReleased)
      .values([
        fig(a.developerId, null, "visitors", true, 30),
        fig(a.developerId, null, "visits", false, null),
        fig(a.developerId, a1, "visitors", true, 18),
        fig(a.developerId, a1, "viewers", true, 13),
        fig(a.developerId, a1, "savers", false, null),
        fig(a.developerId, a1, "views", true, 40),
        fig(a.developerId, a1, "visitors", true, 9, ["device", "mobile"]),
        fig(a.developerId, a1, "visitors", true, 6, ["device", "desktop"]),
        fig(a.developerId, a1, "visitors", false, null, ["device", "tablet"]),
        fig(a.developerId, a2, "visitors", false, null),
        fig(a.developerId, a1, "visitors", true, 11, undefined, "7d"),
        fig(b.developerId, null, "visitors", true, 77),
        fig(b.developerId, b1, "visitors", true, 77),
      ]);

    // Rivals: a1 is compared with B's property (12 visitors), its own a2 (7) and
    // D's property (9), which is unlisted below; B's property is compared with a1.
    const rivalOfD = d.properties[0].id;
    const span = {
      runId: reportRun,
      window: "30d",
      windowStart: "2026-08-27",
      windowEnd: "2026-09-25",
    };
    await db.insert(developerAnalyticsPairings).values([
      {
        ...span,
        developerId: a.developerId,
        propertyId: a1,
        rivalPropertyId: b1,
        visitors: 12,
      },
      {
        ...span,
        developerId: a.developerId,
        propertyId: a1,
        rivalPropertyId: a2,
        visitors: 7,
      },
      {
        ...span,
        developerId: a.developerId,
        propertyId: a1,
        rivalPropertyId: rivalOfD,
        visitors: 9,
      },
      {
        ...span,
        developerId: b.developerId,
        propertyId: b1,
        rivalPropertyId: a1,
        visitors: 12,
      },
    ]);
    await db.insert(developerAnalyticsBenchmarks).values([
      {
        ...span,
        developerId: a.developerId,
        propertyId: a1,
        metric: "viewers",
        cohort: "locality",
        cohortProperties: 6,
        cohortDevelopers: 4,
        median: "8.5",
      },
      {
        ...span,
        developerId: a.developerId,
        propertyId: a1,
        metric: "comparers",
        cohort: "city",
        cohortProperties: 9,
        cohortDevelopers: 5,
        median: "6",
      },
      {
        ...span,
        developerId: b.developerId,
        propertyId: b1,
        metric: "viewers",
        cohort: "city",
        cohortProperties: 7,
        cohortDevelopers: 3,
        median: "31",
      },
    ]);
    await changeListingStatus(db, {
      propertyId: rivalOfD,
      status: "unlisted",
      actorUserId: d.ownerUserId,
    });
  });

  afterAll(async () => {
    await db
      .delete(developerAnalyticsRuns)
      .where(eq(developerAnalyticsRuns.id, reportRun));
    await a.remove();
    await b.remove();
    await c.remove();
    await d.remove();
  });

  it("shows a developer their own portfolio, with withheld figures as no number", async () => {
    const report = await getPortfolioReport(connections, a.developerId, "30d");
    expect(report.portfolio.visitors).toEqual({ released: true, value: 30 });
    expect(report.portfolio.visits).toEqual({ released: false, value: null });
    expect(report.portfolio.returningVisitors).toEqual({
      released: false,
      value: null,
    });
    expect(report.properties.map((p) => p.id).sort()).toEqual([a1, a2].sort());
    const first = report.properties.find((p) => p.id === a1)!;
    expect(first.figures.visitors).toEqual({ released: true, value: 18 });
    expect(first.figures.savers).toEqual({ released: false, value: null });
    expect(first.figures.views).toEqual({ released: true, value: 40 });
    expect(first.completeness.total).toBeGreaterThan(0);
    const second = report.properties.find((p) => p.id === a2)!;
    expect(second.figures.visitors).toEqual({ released: false, value: null });
  });

  it("carries when it was made, how far tracking reaches and the gate", async () => {
    const thirty = (await getPortfolioReport(connections, a.developerId, "30d"))
      .meta!;
    expect(thirty).toMatchObject({
      window: { key: "30d", start: "2026-08-27", end: "2026-09-25" },
      generatedAt: finishedAt.toISOString(),
      trackingSince: TRACKING_SINCE.toISOString(),
      coverage: "partial",
      minVisitors: 5,
      rulesVersion: "release-v1",
      stale: false,
    });
    const seven = (await getPortfolioReport(connections, a.developerId, "7d"))
      .meta!;
    expect(seven.coverage).toBe("full");
  });

  it("calls a report stale once the last successful run is old", async () => {
    const later = new Date(
      finishedAt.getTime() + (STALE_AFTER_HOURS + 1) * 60 * 60 * 1000,
    );
    const report = await getPortfolioReport(
      connections,
      a.developerId,
      "30d",
      later,
    );
    expect(report.meta?.stale).toBe(true);
  });

  it("never shows one developer another's properties or figures", async () => {
    const report = await getPortfolioReport(connections, a.developerId, "30d");
    const text = JSON.stringify(report);
    expect(text).not.toContain(b1);
    expect(text).not.toContain(b.properties[0].name);
    // B's figure is 77; none of A's may be, wherever it sits.
    const numbers = [
      report.portfolio.visitors.value,
      ...report.properties.flatMap((p) =>
        Object.values(p.figures).map((figure) => figure.value),
      ),
    ];
    expect(numbers).not.toContain(77);
    const theirs = await getPortfolioReport(connections, b.developerId, "30d");
    expect(theirs.portfolio.visitors).toEqual({ released: true, value: 77 });
    expect(theirs.properties.map((p) => p.id)).toEqual([b1]);
  });

  it("gives one property with its counted splits", async () => {
    const report = await getPropertyReport(
      connections,
      a.developerId,
      a1,
      "30d",
    );
    expect(report?.property).toMatchObject({ id: a1 });
    expect(report?.figures.viewers).toEqual({ released: true, value: 13 });
    expect(report?.splits).toEqual([
      {
        figure: "visitors",
        dimension: "device",
        cells: [
          { key: "mobile", figure: { released: true, value: 9 } },
          { key: "tablet", figure: { released: false, value: null } },
          { key: "desktop", figure: { released: true, value: 6 } },
        ],
      },
    ]);
    const week = await getPropertyReport(connections, a.developerId, a1, "7d");
    expect(week?.figures.visitors).toEqual({ released: true, value: 11 });
    expect(week?.splits).toEqual([]);
  });

  it("answers null for another developer's property, a malformed id and an unknown one", async () => {
    for (const id of [
      b1,
      "not-an-id",
      "00000000-0000-0000-0000-000000000000",
    ]) {
      expect(
        await getPropertyReport(connections, a.developerId, id, "30d"),
      ).toBeNull();
    }
  });

  it("stops reporting a property once it is unlisted", async () => {
    const [cProperty] = c.properties;
    await db
      .insert(developerAnalyticsReleased)
      .values(fig(c.developerId, cProperty.id, "visitors", true, 21));
    expect(
      (await getPropertyReport(connections, c.developerId, cProperty.id, "30d"))
        ?.figures.visitors,
    ).toEqual({ released: true, value: 21 });
    await changeListingStatus(db, {
      propertyId: cProperty.id,
      status: "unlisted",
      actorUserId: c.ownerUserId,
    });
    expect(
      await getPropertyReport(connections, c.developerId, cProperty.id, "30d"),
    ).toBeNull();
    const portfolio = await getPortfolioReport(
      connections,
      c.developerId,
      "30d",
    );
    expect(portfolio.properties).toEqual([]);
  });

  it("names the rivals a property is compared with, most compared first", async () => {
    const report = await getPropertyReport(
      connections,
      a.developerId,
      a1,
      "30d",
    );
    // D's property is unlisted, so it is not named at all.
    expect(
      report?.rivals.map((rival) => ({
        name: rival.property.name,
        own: rival.own,
        visitors: rival.visitors,
      })),
    ).toEqual([
      { name: b.properties[0].name, own: false, visitors: 12 },
      { name: a.properties[1].name, own: true, visitors: 7 },
    ]);
    expect(report?.rivals[0].developerName).toContain("Report B developer");
    // A rival is only the pairing: its name, developer and the count, and none of
    // its own figures.
    for (const rival of report?.rivals ?? []) {
      expect(Object.keys(rival).sort()).toEqual([
        "developerName",
        "own",
        "property",
        "visitors",
      ]);
    }
  });

  it("keeps rivals and benchmarks to the developer's own property and window", async () => {
    const mine = await getPropertyReport(connections, a.developerId, a1, "30d");
    expect(mine?.benchmarks.some((row) => row.median === 31)).toBe(false);
    const week = await getPropertyReport(connections, a.developerId, a1, "7d");
    expect(week?.rivals).toEqual([]);
    expect(week?.benchmarks).toEqual([]);
    const theirs = await getPropertyReport(
      connections,
      b.developerId,
      b1,
      "30d",
    );
    expect(theirs?.rivals.map((rival) => rival.property.id)).toEqual([a1]);
    expect(theirs?.rivals[0].own).toBe(false);
    expect(theirs?.benchmarks.map((row) => row.median)).toEqual([31]);
  });

  it("gives the benchmarks with what each is a median of", async () => {
    const report = await getPropertyReport(
      connections,
      a.developerId,
      a1,
      "30d",
    );
    expect(report?.benchmarks).toEqual([
      {
        figure: "viewers",
        cohort: "locality",
        cohortProperties: 6,
        cohortDevelopers: 4,
        median: 8.5,
      },
      {
        figure: "comparers",
        cohort: "city",
        cohortProperties: 9,
        cohortDevelopers: 5,
        median: 6,
      },
    ]);
  });

  it("exports the rivals and the nearby medians after the figures", async () => {
    const result = await getExportRows(connections, a.developerId, "30d", a1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tail = result.rows.slice(-4);
    expect(tail.map((row) => row.split)).toEqual([
      "Property",
      "Property",
      "Cohort",
      "Cohort",
    ]);
    expect(tail[0]).toMatchObject({ figure: "Compared with", value: 12 });
    expect(tail[0].splitValue).toContain(b.properties[0].name);
    expect(tail[1]).toMatchObject({ figure: "Compared with", value: 7 });
    expect(tail[2]).toMatchObject({
      figure: "Nearby median: viewers",
      splitValue: "locality (6 properties, 4 developers)",
      value: 8.5,
    });
    expect(tail[3]).toMatchObject({
      figure: "Nearby median: comparers",
      splitValue: "city (9 properties, 5 developers)",
      value: 6,
    });
  });

  it("exports the same figures as rows, portfolio first, withheld with no value", async () => {
    const result = await getExportRows(connections, a.developerId, "30d");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({
      property: "All properties",
      figure: "Visitors",
      status: "released",
      value: 30,
    });
    expect(
      result.rows.find(
        (row) => row.figure === "Visits" && row.property === "All properties",
      ),
    ).toMatchObject({ status: "not enough data", value: null });
    expect(
      result.rows.find(
        (row) => row.split === "Device" && row.splitValue === "tablet",
      ),
    ).toMatchObject({ status: "not enough data", value: null });
    // B's property may be named as a rival, and only there.
    expect(
      JSON.stringify(
        result.rows.filter((row) => row.figure !== "Compared with"),
      ),
    ).not.toContain(b.properties[0].name);
  });

  it("exports one property when asked", async () => {
    const result = await getExportRows(connections, a.developerId, "30d", a1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Set(result.rows.map((row) => row.property))).toEqual(
      new Set([a.properties[0].name]),
    );
  });
});
