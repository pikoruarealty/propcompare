import { sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { fillDays } from "./days";

/**
 * Everything the admin Analytics screen shows, read live from the raw events for a
 * period (schema v20). Admin-only: nothing here reaches a buyer or a developer, and
 * no figure is a score of a property (`DECISIONS.md` 2026-09-23, 2026-09-25). The
 * events hold no personal detail, so neither can anything read from them.
 */

export const DASHBOARD_PERIODS = [7, 30, 90, 365] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export interface DashboardRange {
  from: Date;
  to: Date;
}

export interface Overview {
  /** Events from browsers sent with no visitor id (a privacy signal, or older than 13 months). */
  eventsWithoutVisitor: number;
  visitors: number;
  visits: number;
  signedInVisitors: number;
  propertyViews: number;
  comparisonsOpened: number;
  comparingVisitors: number;
  comparisonsPerComparer: number | null;
  medianCompareSecondsPerVisit: number | null;
  medianDossierSecondsPerView: number | null;
  enquiries: number;
  enquiriesAfterComparing: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  visitors: number;
}

export interface PairRow {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  comparisons: number;
  visitors: number;
  medianSeconds: number | null;
  enquiriesA: number;
  enquiriesB: number;
}

export interface PropertyRow {
  id: string;
  name: string;
  views: number;
  viewers: number;
  medianDossierSeconds: number | null;
  added: number;
  removed: number;
  inComparisons: number;
  topRival: string | null;
  topRivalCount: number;
  saves: number;
  enquiries: number;
  enquiriesAfterComparing: number;
}

export interface CountRow {
  label: string;
  /** The raw value behind the label, for a link to the visitors behind the row. */
  key?: string;
  count: number;
}

export interface BreakdownRow {
  label: string;
  /** The raw value behind the label (the same as the label for these tables). */
  key: string;
  visitors: number;
  comparers: number;
  enquirers: number;
}

export interface DayRow {
  day: string;
  visitors: number;
  comparisons: number;
  enquiries: number;
}

export interface AnalyticsDashboard {
  range: { from: string; to: string };
  overview: Overview;
  funnel: FunnelStep[];
  gate: { reached: number; unlocked: number };
  comparisonSize: CountRow[];
  pairs: PairRow[];
  properties: PropertyRow[];
  groupsOpened: CountRow[];
  focusChosen: CountRow[];
  unitSwitches: CountRow[];
  sources: BreakdownRow[];
  budgetBands: BreakdownRow[];
  devices: BreakdownRow[];
  intakeBedrooms: CountRow[];
  intakePriorities: CountRow[];
  days: DayRow[];
}

type Row = Record<string, unknown>;

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const seconds = (ms: unknown): number | null =>
  ms === null || ms === undefined ? null : Math.round(num(ms) / 1000);

/** A period ending now, of so many days. */
export const periodRange = (
  days: DashboardPeriod,
  now: Date = new Date(),
): DashboardRange => ({
  from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
  to: now,
});

export const GROUP_LABEL: Record<string, string> = {
  timeline: "Possession and timeline",
  unit_type: "The unit type",
  rooms: "Room by room",
  unit_amenities: "Private amenities",
  project: "The project",
  amenities: "Amenities",
  specifications: "Specifications",
  location: "Location and connectivity",
  trust: "RERA",
};
export const FOCUS_LABEL: Record<string, string> = {
  space: "Space",
  timeline: "Timeline",
  amenities: "Amenities",
  build: "Build",
  trust: "Trust",
};

/**
 * The source of the visit an event belongs to: the session's first event's
 * campaign tags, else the site that linked to it, else "Direct". Shared with the
 * visitors list, so a table row and the list it opens cannot define it apart.
 * `alias` names the analytics events row in the caller's query.
 */
export const sourceOfEvent = (alias: string): SQL => {
  const e = sql.raw(alias);
  return sql`coalesce(
    (select coalesce(s.source || coalesce(' / ' || s.medium, ''), s.referrer_domain)
       from analytics_events s where s.session_id = ${e}.session_id
       order by s.occurred_at limit 1),
    'Direct')`;
};

/** The budget band a visitor last stated, whatever event it rode on. */
export const bandOfEvent = (alias: string): SQL => {
  const e = sql.raw(alias);
  return sql`coalesce(
    (select s.budget_band from analytics_events s
       where s.visitor_id = ${e}.visitor_id and s.budget_band is not null
       order by s.occurred_at desc limit 1),
    'Not stated')`;
};

export const loadAnalyticsDashboard = async (
  db: PostgresJsDatabase,
  range: DashboardRange,
): Promise<AnalyticsDashboard> => {
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const within = sql`e.occurred_at >= ${from}::timestamptz and e.occurred_at < ${to}::timestamptz`;
  const rows = async (query: SQL): Promise<Row[]> =>
    Array.from(await db.execute(query)) as Row[];

  const [overviewRow] = await rows(sql`
    with e as (select * from analytics_events e where ${within}),
    compare_time as (
      select session_id, sum(engaged_ms) ms from e
      where event = 'page_engaged' and detail->>'page' = 'compare'
        and session_id is not null group by 1
    ),
    dossier_time as (
      select session_id, sum(engaged_ms) ms from e
      where event = 'page_engaged' and detail->>'page' = 'dossier'
        and session_id is not null group by 1
    )
    select
      count(*) filter (where visitor_id is null) events_without_visitor,
      count(distinct visitor_id) visitors,
      count(distinct session_id) visits,
      count(distinct visitor_id) filter (where signed_in) signed_in_visitors,
      count(*) filter (where event = 'property_viewed') property_views,
      count(*) filter (where event = 'compare_opened') comparisons_opened,
      count(distinct visitor_id) filter (where event = 'compare_opened') comparing_visitors,
      count(*) filter (where event = 'compare_opened' and visitor_id is not null) identified_comparisons_opened,
      count(*) filter (where event = 'enquiry_submitted') enquiries,
      count(*) filter (where event = 'enquiry_submitted'
        and cardinality(compared_ids) >= 2
        and property_id = any(compared_ids)) enquiries_after_comparing,
      (select percentile_cont(0.5) within group (order by ms) from compare_time) median_compare_ms,
      (select percentile_cont(0.5) within group (order by ms) from dossier_time) median_dossier_ms
    from e`);
  const comparers = num(overviewRow.comparing_visitors);
  const overview: Overview = {
    eventsWithoutVisitor: num(overviewRow.events_without_visitor),
    visitors: num(overviewRow.visitors),
    visits: num(overviewRow.visits),
    signedInVisitors: num(overviewRow.signed_in_visitors),
    propertyViews: num(overviewRow.property_views),
    comparisonsOpened: num(overviewRow.comparisons_opened),
    comparingVisitors: comparers,
    comparisonsPerComparer:
      comparers === 0
        ? null
        : Math.round(
            (num(overviewRow.identified_comparisons_opened) / comparers) * 10,
          ) / 10,
    medianCompareSecondsPerVisit: seconds(overviewRow.median_compare_ms),
    medianDossierSecondsPerView: seconds(overviewRow.median_dossier_ms),
    enquiries: num(overviewRow.enquiries),
    enquiriesAfterComparing: num(overviewRow.enquiries_after_comparing),
  };

  const [funnelRow] = await rows(sql`
    with e as (select * from analytics_events e where ${within}),
    viewed as (
      select visitor_id, count(distinct property_id) n from e
      where event = 'property_viewed' and visitor_id is not null group by 1
    )
    select
      count(distinct visitor_id) visited,
      count(distinct visitor_id) filter (where event = 'property_viewed') viewed,
      (select count(*) from viewed where n >= 2) viewed_two,
      count(distinct visitor_id) filter (where event = 'comparison_started') started,
      count(distinct visitor_id) filter (where event = 'compare_opened') opened,
      count(distinct visitor_id) filter (where event = 'compare_opened' and signed_in) unlocked,
      count(distinct visitor_id) filter (where event in ('property_saved', 'comparison_saved')) saved,
      count(distinct visitor_id) filter (where event = 'enquiry_submitted') enquired,
      count(distinct visitor_id) filter (where event = 'compare_opened' and not signed_in) gate_reached,
      count(distinct visitor_id) filter (where event = 'compare_opened' and signed_in
        and visitor_id in (select visitor_id from e where event = 'compare_opened' and not signed_in)) gate_passed
    from e`);
  const funnel: FunnelStep[] = [
    ["visited", "Visited"],
    ["viewed", "Viewed a property"],
    ["viewed_two", "Viewed two or more properties"],
    ["started", "Added a property to compare"],
    ["opened", "Opened a comparison"],
    ["unlocked", "Compared signed in"],
    ["saved", "Saved a property or comparison"],
    ["enquired", "Sent an enquiry"],
  ].map(([key, label]) => ({ key, label, visitors: num(funnelRow[key]) }));

  const comparisonSize = (
    await rows(sql`
      select cardinality(compared_ids) size, count(*) n
      from analytics_events e
      where ${within} and event = 'compare_opened' and compared_ids is not null
      group by 1 order by 1`)
  ).map((row) => ({
    label: `${num(row.size)} properties`,
    count: num(row.n),
  }));

  const pairs = (
    await rows(sql`
      with e as (select * from analytics_events e where ${within}),
      pair as (
        select a.id a_id, b.id b_id, e.visitor_id, e.session_id, e.compared_ids
        from e
        cross join lateral unnest(e.compared_ids) as a(id)
        cross join lateral unnest(e.compared_ids) as b(id)
        where e.event = 'compare_opened' and a.id < b.id
      ),
      time_per_session as (
        select session_id, sum(engaged_ms) ms from e
        where event = 'page_engaged' and detail->>'page' = 'compare'
        and session_id is not null group by 1
      ),
      counted as (
        select a_id, b_id, count(*) comparisons, count(distinct visitor_id) visitors,
          percentile_cont(0.5) within group (order by t.ms) median_ms
        from pair left join time_per_session t using (session_id)
        group by 1, 2
      )
      select c.*, pa.name a_name, pb.name b_name,
        (select count(*) from e where event = 'enquiry_submitted'
          and property_id = c.a_id and c.b_id = any(compared_ids)) enquiries_a,
        (select count(*) from e where event = 'enquiry_submitted'
          and property_id = c.b_id and c.a_id = any(compared_ids)) enquiries_b
      from counted c
      join properties pa on pa.id = c.a_id
      join properties pb on pb.id = c.b_id
      order by c.comparisons desc, c.visitors desc
      limit 25`)
  ).map((row): PairRow => ({
    aId: String(row.a_id),
    aName: String(row.a_name),
    bId: String(row.b_id),
    bName: String(row.b_name),
    comparisons: num(row.comparisons),
    visitors: num(row.visitors),
    medianSeconds: seconds(row.median_ms),
    enquiriesA: num(row.enquiries_a),
    enquiriesB: num(row.enquiries_b),
  }));

  const properties = (
    await rows(sql`
      with e as (select * from analytics_events e where ${within}),
      rival as (
        select a.id pid, b.id other, count(*) n
        from e
        cross join lateral unnest(e.compared_ids) as a(id)
        cross join lateral unnest(e.compared_ids) as b(id)
        where e.event = 'compare_opened' and a.id <> b.id
        group by 1, 2
      ),
      top_rival as (
        select distinct on (pid) pid, other, n from rival order by pid, n desc, other
      ),
      -- Summed per visit (session) before the median, like the overview tile's
      -- own dossier and compare figures: a visitor's three pings on one visit
      -- are one data point, not three (2026-09-26, the two disagreed).
      dossier_time_by_property as (
        select property_id, session_id, sum(engaged_ms) ms from e
        where event = 'page_engaged' and detail->>'page' = 'dossier'
          and session_id is not null
        group by 1, 2
      ),
      per as (
        select p.id, p.name,
          count(*) filter (where e.event = 'property_viewed' and e.property_id = p.id) views,
          count(distinct e.visitor_id) filter (where e.event = 'property_viewed' and e.property_id = p.id) viewers,
          (select percentile_cont(0.5) within group (order by dt.ms)
             from dossier_time_by_property dt where dt.property_id = p.id) median_ms,
          count(*) filter (where e.event = 'comparison_started' and e.property_id = p.id) added,
          count(*) filter (where e.event = 'comparison_removed' and e.property_id = p.id) removed,
          count(*) filter (where e.event = 'compare_opened' and p.id = any(e.compared_ids)) in_comparisons,
          count(*) filter (where e.event = 'property_saved' and e.property_id = p.id) saves,
          count(*) filter (where e.event = 'enquiry_submitted' and e.property_id = p.id) enquiries,
          count(*) filter (where e.event = 'enquiry_submitted' and e.property_id = p.id
            and cardinality(e.compared_ids) >= 2 and p.id = any(e.compared_ids)) enquiries_after_comparing
        from properties p
        left join e on e.property_id = p.id or p.id = any(e.compared_ids)
        group by p.id, p.name
      )
      select per.*, rp.name top_rival, tr.n top_rival_count
      from per
      left join top_rival tr on tr.pid = per.id
      left join properties rp on rp.id = tr.other
      where per.views + per.in_comparisons + per.added + per.enquiries + per.saves > 0
      order by per.in_comparisons desc, per.views desc`)
  ).map((row): PropertyRow => ({
    id: String(row.id),
    name: String(row.name),
    views: num(row.views),
    viewers: num(row.viewers),
    medianDossierSeconds: seconds(row.median_ms),
    added: num(row.added),
    removed: num(row.removed),
    inComparisons: num(row.in_comparisons),
    topRival: row.top_rival === null ? null : String(row.top_rival),
    topRivalCount: num(row.top_rival_count),
    saves: num(row.saves),
    enquiries: num(row.enquiries),
    enquiriesAfterComparing: num(row.enquiries_after_comparing),
  }));

  const groupsOpened = (
    await rows(sql`
      select detail->>'group' k, count(*) n from analytics_events e
      where ${within} and event = 'compare_group_opened'
      group by 1 order by 2 desc`)
  ).map((row) => ({
    label: GROUP_LABEL[String(row.k)] ?? String(row.k),
    key: String(row.k),
    count: num(row.n),
  }));

  const focusChosen = (
    await rows(sql`
      select f k, count(*) n from analytics_events e
      cross join lateral jsonb_array_elements_text(e.detail->'focus') as f
      where ${within} and event = 'compare_focus_set'
      group by 1 order by 2 desc`)
  ).map((row) => ({
    label: FOCUS_LABEL[String(row.k)] ?? String(row.k),
    count: num(row.n),
  }));

  const unitSwitches = (
    await rows(sql`
      select p.name || ': ' || v.variant_name k, count(*) n
      from analytics_events e
      join unit_variants v on v.id = (e.detail->>'unitVariantId')::uuid
      join properties p on p.id = v.property_id
      where ${within} and e.event = 'compare_unit_switched'
      group by 1 order by 2 desc limit 15`)
  ).map((row) => ({ label: String(row.k), count: num(row.n) }));

  const breakdown = async (by: SQL): Promise<BreakdownRow[]> =>
    (
      await rows(sql`
        with e as (select *, ${by} as k from analytics_events e
          where ${within} and visitor_id is not null)
        select k,
          count(distinct visitor_id) visitors,
          count(distinct visitor_id) filter (where event = 'compare_opened') comparers,
          count(distinct visitor_id) filter (where event = 'enquiry_submitted') enquirers
        from e group by k order by visitors desc limit 20`)
    ).map((row) => ({
      label: String(row.k),
      key: String(row.k),
      visitors: num(row.visitors),
      comparers: num(row.comparers),
      enquirers: num(row.enquirers),
    }));

  // A visitor keeps the first source of their visit: the session's earliest event.
  const sources = await breakdown(sourceOfEvent("e"));
  // A visitor belongs to the band they last stated, whatever event it rode on.
  const budgetBands = await breakdown(bandOfEvent("e"));
  const devices = await breakdown(sql`e.device`);

  const intakeBedrooms = (
    await rows(sql`
      select coalesce(b.label, 'Any') k, count(*) n
      from analytics_events e
      left join bhk_types b on b.key = e.detail->>'bhk'
      where ${within} and e.event = 'intake_completed'
      group by 1 order by 2 desc`)
  ).map((row) => ({ label: String(row.k), count: num(row.n) }));
  const intakePriorities = (
    await rows(sql`
      select p k, count(*) n from analytics_events e
      cross join lateral jsonb_array_elements_text(e.detail->'priorities') as p
      where ${within} and e.event = 'intake_completed'
      group by 1 order by 2 desc`)
  ).map((row) => ({
    label: String(row.k).replace(/_/g, " "),
    count: num(row.n),
  }));

  const dayRows = (
    await rows(sql`
      select to_char(date_trunc('day', e.occurred_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD') d,
        count(distinct visitor_id) visitors,
        count(*) filter (where event = 'compare_opened') comparisons,
        count(*) filter (where event = 'enquiry_submitted') enquiries
      from analytics_events e where ${within}
      group by 1 order by 1`)
  ).map((row) => ({
    day: String(row.d),
    visitors: num(row.visitors),
    comparisons: num(row.comparisons),
    enquiries: num(row.enquiries),
  }));
  // Every day of the period, so a quiet day is a short bar and not a missing one.
  const days = fillDays(dayRows, range);

  return {
    range: { from, to },
    overview,
    funnel,
    gate: {
      reached: num(funnelRow.gate_reached),
      unlocked: num(funnelRow.gate_passed),
    },
    comparisonSize,
    pairs,
    properties,
    groupsOpened,
    focusChosen,
    unitSwitches,
    sources,
    budgetBands,
    devices,
    intakeBedrooms,
    intakePriorities,
    days,
  };
};
