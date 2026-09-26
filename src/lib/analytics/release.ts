import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  RELEASE_BENCHMARK_METRICS,
  RELEASE_BUDGET_BANDS,
  RELEASE_DEVICES,
  developerAnalyticsBenchmarks,
  developerAnalyticsPairings,
  developerAnalyticsReleased,
  developerAnalyticsRuns,
} from "@/db/schema/developer-analytics";
import { properties } from "@/db/schema/catalog";
import { isListed } from "@/lib/properties/visibility";
import {
  MIN_VISITORS,
  RULES_VERSION,
  lastCompleteDay,
  releaseBenchmark,
  releaseCell,
  releaseGroup,
  releasePairings,
  reportWindows,
  windowBounds,
  type BenchmarkProperty,
  type CandidateCell,
  type PairCandidate,
  type ReportWindow,
} from "./release-rules";

/**
 * The release job (schema v21, `DECISIONS.md` 2026-09-26): reads the raw v20
 * events and writes, for every listed property and its developer's portfolio,
 * the figures a developer may see. The counting is here; what may be shown is
 * decided only by `release-rules.ts`. Nothing about enquiries is computed, and
 * no visitor or visit id, hidden count or rival property leaves this module.
 *
 * One run is one transaction: a failure leaves the previous run as the latest
 * and records a failed run beside it, so reports show the figures as stale
 * rather than half replaced.
 */

/** Successful runs kept; older ones (and their figures) are removed. */
export const KEPT_RUNS = 7;

/** The unsplit figures every listed property and portfolio always has a row for. */
const PROPERTY_METRICS = [
  "visitors",
  "viewers",
  "comparers",
  "savers",
  "unlockers",
  "visits",
  "returning_visitors",
  "median_dossier_seconds",
  "median_compare_seconds",
  "views",
  "comparisons",
] as const;
const PORTFOLIO_METRICS = ["visitors", "visits", "returning_visitors"] as const;

const ALLOWED_SPLITS: Record<string, ReadonlySet<string>> = {
  budget_band: new Set(RELEASE_BUDGET_BANDS),
  device: new Set(RELEASE_DEVICES),
};

const allowedSplit = (dimension: string, value: string | null): boolean => {
  if (!value) return false;
  if (dimension === "intake_bhk") return /^[a-z0-9_]{1,40}$/.test(value);
  if (dimension === "intake_city")
    return value.length <= 60 && !/[\x00-\x1f\x7f]/.test(value);
  return ALLOWED_SPLITS[dimension]?.has(value) ?? false;
};

interface CandidateRow {
  developer_id: string;
  property_id: string | null;
  metric: string;
  dimension: string;
  dimension_value: string | null;
  visitors: number;
  value: number;
  [key: string]: unknown;
}

/**
 * Every candidate figure in one window, with the distinct visitors behind it.
 * An event is "about" a property when it names it or compares it; only listed
 * properties count (Deep, 2026-09-26), under the developer that owns them now.
 *
 * `listed` is the run's own lock-held read (`isListed`, held `for key share` for
 * the whole run) rather than a second, hand-written check here: "listed" was
 * checked two different ways until 2026-09-26 — the shared definition for the
 * lock, and a raw `listing_status = 'listed'` copy for the candidates, which
 * could silently drift apart if `isListed`'s definition ever grows a second
 * condition. There is now exactly one place that decides eligibility.
 */
const candidatesFor = async (
  db: PostgresJsDatabase,
  window: ReportWindow,
  listed: ListedProperty[],
): Promise<CandidateRow[]> => {
  const { from, until } = windowBounds(window);
  if (listed.length === 0) return [];
  const result = await db.execute<CandidateRow>(sql`
    with eligible (property_id, developer_id) as (
      values ${sql.join(
        listed.map(
          (row) => sql`(${row.propertyId}::uuid, ${row.developerId}::uuid)`,
        ),
        sql`, `,
      )}
    ),
    about as (
      select e.visitor_id, e.session_id, e.event, e.occurred_at, e.engaged_ms,
             e.detail ->> 'page' as page, e.device, e.budget_band,
             x.property_id, el.developer_id,
             e.property_id is not distinct from x.property_id as direct
      from analytics_events e
      cross join lateral (
        select e.property_id as property_id where e.property_id is not null
        union
        select unnest(e.compared_ids)
      ) x
      join eligible el on el.property_id = x.property_id
      where e.occurred_at >= ${from.toISOString()}::timestamptz
        and e.occurred_at < ${until.toISOString()}::timestamptz
    ),
    visits_per_visitor as (
      select developer_id, property_id, visitor_id,
             count(distinct session_id) as visits
      from about group by 1, 2, 3
    ),
    portfolio_visits_per_visitor as (
      select developer_id, visitor_id, count(distinct session_id) as visits
      from about group by 1, 2
    ),
    dossier_time as (
      select developer_id, property_id, visitor_id, sum(engaged_ms)::float8 as ms
      from about
      where event = 'page_engaged' and page = 'dossier' and direct
      group by 1, 2, 3
    ),
    compare_time as (
      select developer_id, property_id, visitor_id, sum(engaged_ms)::float8 as ms
      from about
      where event = 'page_engaged' and page = 'compare'
      group by 1, 2, 3
    ),
    intake_choices as (
      select visitor_id, occurred_at, id, detail
      from analytics_events
      where event = 'intake_completed'
        and visitor_id is not null
        and occurred_at < ${until.toISOString()}::timestamptz
    ),
    intake_demand as (
      -- One intake choice per identified visitor and listed property: the
      -- latest intake preceding their first later view or comparison in this
      -- window. No account join, no intake row or visitor id is released.
      select distinct on (b.developer_id, b.property_id, b.visitor_id)
             b.developer_id, b.property_id, b.visitor_id,
             bhk.key as bhk,
             initcap(lower(btrim(i.detail ->> 'city'))) as city
      from about b
      join intake_choices i on i.visitor_id = b.visitor_id
        and i.occurred_at <= b.occurred_at
      left join bhk_types bhk on bhk.key = lower(i.detail ->> 'bhk')
      where b.visitor_id is not null
        and ((b.event = 'property_viewed' and b.direct)
          or b.event = 'compare_opened')
      order by b.developer_id, b.property_id, b.visitor_id,
               b.occurred_at, i.occurred_at desc, i.id desc
    )
    select developer_id, property_id, 'visitors' as metric, 'none' as dimension,
           null::text as dimension_value,
           count(distinct visitor_id)::int as visitors,
           count(distinct visitor_id)::int as value
    from about group by developer_id, property_id
    union all
    select developer_id, property_id, 'visitors', 'budget_band', budget_band,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where budget_band is not null
    group by developer_id, property_id, budget_band
    union all
    select developer_id, property_id, 'visitors', 'device', device,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about group by developer_id, property_id, device
    union all
    select developer_id, property_id, 'visitors', 'intake_bhk', bhk,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from intake_demand where bhk is not null
    group by developer_id, property_id, bhk
    union all
    select developer_id, property_id, 'visitors', 'intake_city', city,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from intake_demand where city is not null and city <> ''
    group by developer_id, property_id, city
    union all
    select developer_id, property_id, 'viewers', 'none', null,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where event = 'property_viewed' and direct
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'viewers', 'budget_band', budget_band,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about
    where event = 'property_viewed' and direct and budget_band is not null
    group by developer_id, property_id, budget_band
    union all
    select developer_id, property_id, 'viewers', 'device', device,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where event = 'property_viewed' and direct
    group by developer_id, property_id, device
    union all
    select developer_id, property_id, 'comparers', 'none', null,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where event = 'compare_opened'
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'comparers', 'budget_band', budget_band,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where event = 'compare_opened' and budget_band is not null
    group by developer_id, property_id, budget_band
    union all
    -- 'views' and 'comparisons' count every event, including one with no
    -- visitor id (a privacy signal, or older than the raw retention window);
    -- 'viewers' and 'comparers' above count only identified people. The gate
    -- is still the identified count, so privacy is unchanged — once enough
    -- real people are behind a figure, the number shown also counts the real
    -- activity a gate on identity alone would otherwise hide.
    select developer_id, property_id, 'views', 'none', null,
           count(distinct visitor_id)::int, count(*)::int
    from about where event = 'property_viewed' and direct
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'comparisons', 'none', null,
           count(distinct visitor_id)::int, count(*)::int
    from about where event = 'compare_opened'
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'savers', 'none', null,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where event = 'property_saved' and direct
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'unlockers', 'none', null,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about where event = 'dossier_unlocked' and direct
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'visits', 'none', null,
           count(distinct visitor_id)::int, count(distinct session_id)::int
    from about group by developer_id, property_id
    union all
    select developer_id, property_id, 'returning_visitors', 'none', null,
           count(*)::int, count(*)::int
    from visits_per_visitor where visits >= 2
    group by developer_id, property_id
    union all
    select developer_id, property_id, 'median_dossier_seconds', 'none', null,
           count(*)::int,
           round(percentile_cont(0.5) within group (order by ms) / 1000.0)::int
    from dossier_time group by developer_id, property_id
    union all
    select developer_id, property_id, 'median_compare_seconds', 'none', null,
           count(*)::int,
           round(percentile_cont(0.5) within group (order by ms) / 1000.0)::int
    from compare_time group by developer_id, property_id
    union all
    select developer_id, null::uuid, 'visitors', 'none', null,
           count(distinct visitor_id)::int, count(distinct visitor_id)::int
    from about group by developer_id
    union all
    select developer_id, null::uuid, 'visits', 'none', null,
           count(distinct visitor_id)::int, count(distinct session_id)::int
    from about group by developer_id
    union all
    select developer_id, null::uuid, 'returning_visitors', 'none', null,
           count(*)::int, count(*)::int
    from portfolio_visits_per_visitor where visits >= 2
    group by developer_id
  `);
  return [...result];
};

interface ListedProperty {
  propertyId: string;
  developerId: string;
  city: string;
  locality: string;
}

/**
 * Every pair of listed properties held together in a comparison in one window,
 * with the distinct identified visitors who opened it (`compare_opened` only: the
 * event that means a comparison was looked at). Both directions are returned, so
 * each developer gets their own property first. Which pairs may be shown, and how
 * many, is `releasePairings`'s decision, not this query's.
 */
const pairCandidatesFor = async (
  db: PostgresJsDatabase,
  window: ReportWindow,
  listed: ListedProperty[],
): Promise<(PairCandidate & { developerId: string })[]> => {
  const { from, until } = windowBounds(window);
  if (listed.length === 0) return [];
  const result = await db.execute<{
    developer_id: string;
    property_id: string;
    rival_property_id: string;
    visitors: number;
    [key: string]: unknown;
  }>(sql`
    with eligible (property_id, developer_id) as (
      values ${sql.join(
        listed.map(
          (row) => sql`(${row.propertyId}::uuid, ${row.developerId}::uuid)`,
        ),
        sql`, `,
      )}
    )
    select a.developer_id, a.property_id, b.property_id as rival_property_id,
           count(distinct e.visitor_id)::int as visitors
    from analytics_events e
    cross join lateral unnest(e.compared_ids) as x(id)
    join eligible a on a.property_id = x.id
    cross join lateral unnest(e.compared_ids) as y(id)
    join eligible b on b.property_id = y.id and b.property_id <> a.property_id
    where e.event = 'compare_opened'
      and e.visitor_id is not null
      and e.occurred_at >= ${from.toISOString()}::timestamptz
      and e.occurred_at < ${until.toISOString()}::timestamptz
    group by a.developer_id, a.property_id, b.property_id
  `);
  return [...result].map((row) => ({
    developerId: row.developer_id,
    propertyId: row.property_id,
    rivalPropertyId: row.rival_property_id,
    visitors: Number(row.visitors),
  }));
};

/**
 * One benchmark row per listed property and count metric that has a large enough
 * cohort. The counts are the ones already computed for the figures (a property
 * with nothing counted is a zero here, which is a real observation for the
 * median), so this adds no new read of the events.
 */
export const benchmarksFor = (
  listed: ListedProperty[],
  candidates: CandidateRow[],
) => {
  const rows: {
    developerId: string;
    propertyId: string;
    metric: (typeof RELEASE_BENCHMARK_METRICS)[number];
    cohort: "locality" | "city";
    cohortProperties: number;
    cohortDevelopers: number;
    median: number;
  }[] = [];
  for (const metric of RELEASE_BENCHMARK_METRICS) {
    const counted = new Map<string, number>();
    for (const row of candidates) {
      if (
        row.metric === metric &&
        row.dimension === "none" &&
        row.property_id !== null
      ) {
        counted.set(row.property_id, Number(row.value));
      }
    }
    const everyone: BenchmarkProperty[] = listed.map((property) => ({
      ...property,
      value: counted.get(property.propertyId) ?? 0,
    }));
    for (const subject of everyone) {
      const cell = releaseBenchmark(subject, everyone);
      if (!cell) continue;
      rows.push({
        developerId: subject.developerId,
        propertyId: subject.propertyId,
        metric,
        cohort: cell.cohort,
        cohortProperties: cell.properties,
        cohortDevelopers: cell.developers,
        median: cell.median,
      });
    }
  }
  return rows;
};

export interface ReleasedFigure {
  window: ReportWindow;
  developerId: string;
  propertyId: string | null;
  metric: string;
  dimension: string;
  dimensionValue: string | null;
  released: boolean;
  value: number | null;
}

/**
 * Turns one window's candidates into figures: a row for every unsplit metric of
 * every listed property and portfolio (withheld when nothing was counted), and
 * the splits that were counted, each group released under the shared rules.
 * Pure, so it can be tested without a database.
 */
export const figuresFor = (
  window: ReportWindow,
  listed: { propertyId: string; developerId: string }[],
  candidates: CandidateRow[],
): ReleasedFigure[] => {
  const groups = new Map<
    string,
    {
      developerId: string;
      propertyId: string | null;
      metric: string;
      dimension: string;
      cells: CandidateCell[];
    }
  >();
  const groupOf = (
    developerId: string,
    propertyId: string | null,
    metric: string,
    dimension: string,
  ) => {
    const key = [developerId, propertyId ?? "", metric, dimension].join("|");
    let group = groups.get(key);
    if (!group) {
      group = { developerId, propertyId, metric, dimension, cells: [] };
      groups.set(key, group);
    }
    return group;
  };

  // Every unsplit figure exists, so "not enough data" is always a row.
  const developers = new Set<string>();
  for (const { propertyId, developerId } of listed) {
    developers.add(developerId);
    for (const metric of PROPERTY_METRICS) {
      groupOf(developerId, propertyId, metric, "none");
    }
  }
  for (const developerId of developers) {
    for (const metric of PORTFOLIO_METRICS) {
      groupOf(developerId, null, metric, "none");
    }
  }

  for (const row of candidates) {
    if (row.dimension !== "none") {
      if (!allowedSplit(row.dimension, row.dimension_value)) {
        continue;
      }
    }
    groupOf(
      row.developer_id,
      row.property_id,
      row.metric,
      row.dimension,
    ).cells.push({
      key: row.dimension === "none" ? null : row.dimension_value,
      visitors: Number(row.visitors),
      value: Number(row.value),
    });
  }

  const figures: ReleasedFigure[] = [];
  for (const group of groups.values()) {
    const released =
      group.dimension === "none"
        ? [
            group.cells[0]
              ? releaseCell(group.cells[0])
              : { key: null, released: false, value: null },
          ]
        : releaseGroup(group.cells);
    for (const cell of released) {
      figures.push({
        window,
        developerId: group.developerId,
        propertyId: group.propertyId,
        metric: group.metric,
        dimension: group.dimension,
        dimensionValue: cell.key,
        released: cell.released,
        value: cell.value,
      });
    }
  }
  return figures;
};

export interface ReleaseResult {
  runId: string;
  dataThrough: string;
  figures: number;
  released: number;
}

/** Runs the release for every window ending on the last whole India-time day. */
export const releaseDeveloperAnalytics = async (
  db: PostgresJsDatabase,
  now: Date = new Date(),
): Promise<ReleaseResult> => {
  const dataThrough = lastCompleteDay(now);
  try {
    return await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(developerAnalyticsRuns)
        .values({
          status: "running",
          dataThrough,
          minVisitors: MIN_VISITORS,
          rulesVersion: RULES_VERSION,
        })
        .returning({ id: developerAnalyticsRuns.id });

      const listed = await tx
        .select({
          propertyId: properties.id,
          developerId: properties.developerId,
          city: properties.city,
          locality: properties.locality,
        })
        .from(properties)
        .where(isListed)
        // Held until the run commits, so a property deleted meanwhile cannot
        // break its figures' foreign keys; ordinary edits are not blocked.
        .for("key share");

      let figures = 0;
      let released = 0;
      for (const window of reportWindows(dataThrough)) {
        const candidates = await candidatesFor(tx, window, listed);
        const rows = figuresFor(window, listed, candidates);
        figures += rows.length;
        released += rows.filter((row) => row.released).length;
        for (let start = 0; start < rows.length; start += 500) {
          await tx.insert(developerAnalyticsReleased).values(
            rows.slice(start, start + 500).map((row) => ({
              runId: run.id,
              window: row.window.key,
              windowStart: row.window.start,
              windowEnd: row.window.end,
              developerId: row.developerId,
              propertyId: row.propertyId,
              metric: row.metric,
              dimension: row.dimension,
              dimensionValue: row.dimensionValue,
              released: row.released,
              value: row.value === null ? null : String(row.value),
            })),
          );
        }

        const span = { windowStart: window.start, windowEnd: window.end };
        const developerOf = new Map(
          listed.map((p) => [p.propertyId, p.developerId]),
        );
        const pairs = releasePairings(
          await pairCandidatesFor(tx, window, listed),
        );
        if (pairs.length > 0) {
          await tx.insert(developerAnalyticsPairings).values(
            pairs.map((pair) => ({
              runId: run.id,
              window: window.key,
              ...span,
              developerId: developerOf.get(pair.propertyId) as string,
              propertyId: pair.propertyId,
              rivalPropertyId: pair.rivalPropertyId,
              visitors: pair.visitors,
            })),
          );
        }
        const benchmarks = benchmarksFor(listed, candidates);
        if (benchmarks.length > 0) {
          await tx.insert(developerAnalyticsBenchmarks).values(
            benchmarks.map((row) => ({
              runId: run.id,
              window: window.key,
              ...span,
              developerId: row.developerId,
              propertyId: row.propertyId,
              metric: row.metric,
              cohort: row.cohort,
              cohortProperties: row.cohortProperties,
              cohortDevelopers: row.cohortDevelopers,
              median: String(row.median),
            })),
          );
        }
      }

      const [{ since }] = await tx.execute<{ since: string | null }>(sql`
        select least(
          (select min(occurred_at) from analytics_events),
          (select min(month)::timestamptz from analytics_event_monthly)
        ) as since`);
      await tx
        .update(developerAnalyticsRuns)
        .set({
          status: "succeeded",
          finishedAt: sql`now()`,
          trackingSince: since === null ? null : new Date(since),
        })
        .where(eq(developerAnalyticsRuns.id, run.id));

      // Keep the latest successful runs; their figures go with them.
      await tx.execute(sql`
        delete from developer_analytics_runs
        where status = 'succeeded'
          and id not in (
            select id from developer_analytics_runs
            where status = 'succeeded'
            order by finished_at desc
            limit ${KEPT_RUNS}
          )`);
      await tx.execute(sql`
        delete from developer_analytics_runs
        where status = 'failed' and started_at < now() - interval '30 days'`);

      return { runId: run.id, dataThrough, figures, released };
    });
  } catch (error) {
    await db.insert(developerAnalyticsRuns).values({
      status: "failed",
      finishedAt: sql`now()`,
      dataThrough,
      minVisitors: MIN_VISITORS,
      rulesVersion: RULES_VERSION,
      errorCode: "release_failed",
    });
    throw error;
  }
};
