import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, dbClient } from "@/db";
import { developerReaderDbClient } from "@/db/developer-reader";
import { analyticsEvents } from "@/db/schema/analytics";
import {
  developerAnalyticsReleased,
  developerAnalyticsRuns,
} from "@/db/schema/developer-analytics";
import { KEPT_RUNS, releaseDeveloperAnalytics } from "@/lib/analytics/release";
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
      rulesVersion: "release-v1",
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
