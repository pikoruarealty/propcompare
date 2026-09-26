import { sql, type SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { FOCUS_LABEL, GROUP_LABEL, type DashboardRange } from "./dashboard";
import { duration } from "./format";

/**
 * The visitors behind the admin Analytics figures, and what one of them did
 * (`DECISIONS.md` 2026-09-26). A visitor is an anonymous browser id: nothing here
 * names a person, reads an account or joins to a phone number, and only events
 * that still carry an id (the last 13 months, from browsers that sent no privacy
 * signal) can appear.
 */

/** The funnel's steps in order, as the Analytics screen draws them. */
export const FUNNEL_KEYS = [
  "visited",
  "viewed",
  "viewed_two",
  "started",
  "opened",
  "unlocked",
  "saved",
  "enquired",
] as const;
export type FunnelKey = (typeof FUNNEL_KEYS)[number];

export const FUNNEL_LABEL: Record<FunnelKey, string> = {
  visited: "Visited",
  viewed: "Viewed a property",
  viewed_two: "Viewed two or more properties",
  started: "Added a property to compare",
  opened: "Opened a comparison",
  unlocked: "Compared signed in",
  saved: "Saved a property or comparison",
  enquired: "Sent an enquiry",
};

/** Reached the sign-in gate is a step of its own, outside the funnel's order. */
export type ReachedKey = FunnelKey | "gate";

export interface VisitorFilter {
  /** Visitors who got as far as this step. */
  reached?: ReachedKey;
  /** Visitors who got as far as this step and no further. */
  stopped?: FunnelKey;
  /** Visitors who viewed, added or compared this property. */
  propertyId?: string;
  /** Visitors who opened a comparison holding both. */
  pair?: [string, string];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/** A visitor's label: the first six characters of its id, capitalised. */
export const visitorLabel = (visitorId: string): string =>
  `Visitor ${visitorId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

/** The names of properties by id, for describing a filter. */
export const propertyNames = async (
  db: PostgresJsDatabase,
  ids: string[],
): Promise<Map<string, string>> => {
  if (ids.length === 0) return new Map();
  const rows = Array.from(
    await db.execute(sql`select id, name from properties where id in ${ids}`),
  ) as { id: string; name: string }[];
  return new Map(rows.map((row) => [row.id, row.name]));
};

/** A filter from the address's query, or none for anything that does not fit. */
export const readVisitorFilter = (query: {
  reached?: string | null;
  stopped?: string | null;
  property?: string | null;
  pair?: string | null;
}): VisitorFilter => {
  const filter: VisitorFilter = {};
  const funnel = FUNNEL_KEYS as readonly string[];
  if (query.reached === "gate") filter.reached = "gate";
  else if (query.reached && funnel.includes(query.reached)) {
    filter.reached = query.reached as FunnelKey;
  }
  if (query.stopped && funnel.includes(query.stopped)) {
    filter.stopped = query.stopped as FunnelKey;
  }
  if (isUuid(query.property)) filter.propertyId = query.property.toLowerCase();
  if (query.pair) {
    const [a, b] = query.pair.split(",");
    if (isUuid(a) && isUuid(b) && a !== b) {
      filter.pair = [a.toLowerCase(), b.toLowerCase()];
    }
  }
  return filter;
};

export interface VisitorRow {
  visitorId: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  events: number;
  engagedSeconds: number;
  device: string;
  source: string | null;
  signedIn: boolean;
  viewed: string[];
  comparisons: number;
  enquired: boolean;
}

type Row = Record<string, unknown>;

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The condition on a visitor's step flags for a funnel key. */
const flagOf = (key: ReachedKey): SQL => {
  switch (key) {
    case "visited":
      return sql`true`;
    case "viewed":
      return sql`per.viewed`;
    case "viewed_two":
      return sql`per.viewed_count >= 2`;
    case "started":
      return sql`per.started`;
    case "opened":
      return sql`per.opened`;
    case "unlocked":
      return sql`per.unlocked`;
    case "saved":
      return sql`per.saved`;
    case "enquired":
      return sql`per.enquired`;
    case "gate":
      return sql`per.gate`;
  }
};

const MAX_ROWS = 100;

/**
 * Visitors active in the period, most recent first, narrowed by the filter.
 * `total` counts every match; `rows` is the first hundred.
 */
export const listVisitors = async (
  db: PostgresJsDatabase,
  range: DashboardRange,
  filter: VisitorFilter = {},
): Promise<{ rows: VisitorRow[]; total: number }> => {
  const from = range.from.toISOString();
  const to = range.to.toISOString();

  const where: SQL[] = [sql`true`];
  if (filter.reached) where.push(flagOf(filter.reached));
  if (filter.stopped) {
    const next = FUNNEL_KEYS[FUNNEL_KEYS.indexOf(filter.stopped) + 1];
    where.push(flagOf(filter.stopped));
    if (next) where.push(sql`not (${flagOf(next)})`);
  }
  if (filter.propertyId) {
    where.push(sql`exists (
      select 1 from e x where x.visitor_id = per.visitor_id
        and (x.property_id = ${filter.propertyId}::uuid
          or ${filter.propertyId}::uuid = any(x.compared_ids)))`);
  }
  if (filter.pair) {
    where.push(sql`exists (
      select 1 from e x where x.visitor_id = per.visitor_id
        and x.event = 'compare_opened'
        and ${filter.pair[0]}::uuid = any(x.compared_ids)
        and ${filter.pair[1]}::uuid = any(x.compared_ids))`);
  }

  const result = Array.from(
    await db.execute(sql`
      with e as (
        select * from analytics_events
        where occurred_at >= ${from}::timestamptz and occurred_at < ${to}::timestamptz
          and visitor_id is not null
      ),
      per as (
        select visitor_id,
          min(occurred_at) first_seen, max(occurred_at) last_seen,
          count(distinct session_id) visits, count(*) events,
          coalesce(sum(engaged_ms), 0) engaged_ms,
          (array_agg(device order by occurred_at desc))[1] device,
          (array_agg(coalesce(source || coalesce(' / ' || medium, ''), referrer_domain)
            order by occurred_at)
            filter (where source is not null or referrer_domain is not null))[1] source,
          bool_or(signed_in) signed_in,
          bool_or(event = 'property_viewed') viewed,
          count(distinct property_id) filter (where event = 'property_viewed') viewed_count,
          bool_or(event = 'comparison_started') started,
          bool_or(event = 'compare_opened') opened,
          bool_or(event = 'compare_opened' and signed_in) unlocked,
          bool_or(event = 'compare_opened' and not signed_in) gate,
          bool_or(event in ('property_saved', 'comparison_saved')) saved,
          bool_or(event = 'enquiry_submitted') enquired,
          count(*) filter (where event = 'compare_opened') comparisons
        from e group by visitor_id
      ),
      picked as (
        select per.*, count(*) over () total from per
        where ${sql.join(where, sql` and `)}
        order by last_seen desc
        limit ${MAX_ROWS}
      )
      select picked.*,
        (select array_agg(distinct p.name order by p.name)
           from e x join properties p on p.id = x.property_id
           where x.visitor_id = picked.visitor_id and x.event = 'property_viewed') viewed_names
      from picked
      order by last_seen desc`),
  ) as Row[];

  return {
    total: result.length === 0 ? 0 : num(result[0].total),
    rows: result.map((row) => ({
      visitorId: String(row.visitor_id),
      label: visitorLabel(String(row.visitor_id)),
      firstSeen: new Date(String(row.first_seen)).toISOString(),
      lastSeen: new Date(String(row.last_seen)).toISOString(),
      visits: num(row.visits),
      events: num(row.events),
      engagedSeconds: Math.round(num(row.engaged_ms) / 1000),
      device: String(row.device),
      source: row.source === null ? null : String(row.source),
      signedIn: Boolean(row.signed_in),
      viewed: Array.isArray(row.viewed_names)
        ? (row.viewed_names as string[])
        : [],
      comparisons: num(row.comparisons),
      enquired: Boolean(row.enquired),
    })),
  };
};

export interface JourneyEvent {
  at: string;
  /** Plain words, e.g. "Opened a comparison of Anamika and Kimana". */
  text: string;
  /** Where the admin can go for more: the property's page or the enquiry inbox. */
  href: string | null;
}

export interface JourneyVisit {
  sessionId: string;
  startedAt: string;
  events: JourneyEvent[];
}

export interface Journey {
  visitorId: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  device: string;
  signedIn: boolean;
  budgetBand: string | null;
  source: string | null;
  engagedSeconds: number;
  visits: JourneyVisit[];
}

/** What an event says, from the row and the names of what it refers to. */
export interface EventFacts {
  event: string;
  signedIn: boolean;
  engagedMs: number | null;
  detail: Record<string, unknown> | null;
  budgetBand: string | null;
  propertyName: string | null;
  comparedNames: string[];
  unitTypeName: string | null;
}

const list = (names: string[]): string =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** One event in plain words. Unknown events say so rather than being hidden. */
export const describeEvent = (facts: EventFacts): string => {
  const property = facts.propertyName ?? "a property";
  const compared =
    facts.comparedNames.length > 0
      ? list(facts.comparedNames)
      : "the chosen properties";
  const detail = facts.detail ?? {};
  switch (facts.event) {
    case "property_viewed":
      return `Opened ${property}`;
    case "page_engaged": {
      const time = duration(Math.round((facts.engagedMs ?? 0) / 1000));
      return detail.page === "compare"
        ? `Spent ${time} on the comparison of ${compared}`
        : `Spent ${time} on ${property}`;
    }
    case "comparison_started":
      return facts.comparedNames.length > 1
        ? `Added ${property} to a comparison, now ${list(facts.comparedNames)}`
        : `Added ${property} to a comparison`;
    case "comparison_removed":
      return `Dropped ${property} from the comparison${
        detail.where === "tray" ? " tray" : ""
      }`;
    case "compare_opened":
      return `Opened a comparison of ${compared}${
        facts.signedIn ? ", signed in" : ", locked: not signed in"
      }`;
    case "compare_group_opened": {
      const group = String(detail.group);
      return `Opened "${GROUP_LABEL[group] ?? group}" in the comparison`;
    }
    case "compare_unit_switched":
      return facts.unitTypeName
        ? `Switched ${property} to ${facts.unitTypeName}`
        : `Switched ${property} to another unit type`;
    case "compare_focus_set": {
      const focus = Array.isArray(detail.focus)
        ? (detail.focus as string[]).map((key) => FOCUS_LABEL[key] ?? key)
        : [];
      return focus.length > 0
        ? `Chose the focus ${list(focus)}`
        : "Cleared the comparison focus";
    }
    case "comparison_shared":
      return "Copied the comparison link";
    case "comparison_saved":
      return "Saved the comparison";
    case "property_saved":
      return `Saved ${property}`;
    case "dossier_unlocked":
      return `Signed in to unlock ${property}`;
    case "enquiry_submitted":
      return facts.comparedNames.length > 1
        ? `Sent an enquiry about ${property}, while comparing ${list(facts.comparedNames)}`
        : `Sent an enquiry about ${property}`;
    case "intake_completed": {
      const bits = [
        typeof detail.city === "string" ? detail.city : null,
        typeof detail.bhk === "string" ? String(detail.bhk) : null,
        facts.budgetBand,
      ].filter((bit): bit is string => Boolean(bit));
      const priorities = Array.isArray(detail.priorities)
        ? (detail.priorities as string[]).map((key) => key.replace(/_/g, " "))
        : [];
      return `Finished guided intake${bits.length > 0 ? ` (${bits.join(", ")})` : ""}${
        priorities.length > 0 ? `, priorities: ${list(priorities)}` : ""
      }`;
    }
    default:
      return `Recorded ${facts.event.replace(/_/g, " ")}`;
  }
};

/** A raw query returns jsonb as text, so it is read here. */
const detailOf = (raw: unknown): Record<string, unknown> | null => {
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

/** One visitor's events in order, grouped by visit, or null if none has this id. */
export const loadJourney = async (
  db: PostgresJsDatabase,
  visitorId: string,
): Promise<Journey | null> => {
  const events = Array.from(
    await db.execute(sql`
      select e.id, e.occurred_at, e.session_id, e.event, e.signed_in, e.property_id,
        p.name property_name, p.slug property_slug, e.compared_ids, e.engaged_ms,
        e.detail, e.device, e.source, e.medium, e.referrer_domain, e.budget_band
      from analytics_events e
      left join properties p on p.id = e.property_id
      where e.visitor_id = ${visitorId}::uuid
      order by e.occurred_at, e.id`),
  ) as Row[];
  if (events.length === 0) return null;

  const ids = new Set<string>();
  const variantIds = new Set<string>();
  for (const row of events) {
    for (const id of (row.compared_ids as string[] | null) ?? []) ids.add(id);
    const detail = detailOf(row.detail);
    if (typeof detail?.unitVariantId === "string") {
      variantIds.add(detail.unitVariantId);
    }
  }
  const names = new Map<string, string>();
  if (ids.size > 0) {
    const found = Array.from(
      await db.execute(sql`
        select id, name from properties where id in ${[...ids]}`),
    ) as Row[];
    for (const row of found) names.set(String(row.id), String(row.name));
  }
  const unitNames = new Map<string, string>();
  if (variantIds.size > 0) {
    const found = Array.from(
      await db.execute(sql`
        select id, variant_name from unit_variants where id in ${[...variantIds]}`),
    ) as Row[];
    for (const row of found) {
      unitNames.set(String(row.id), String(row.variant_name));
    }
  }

  const visits = new Map<string, JourneyVisit>();
  let engagedMs = 0;
  let signedIn = false;
  let budgetBand: string | null = null;
  let source: string | null = null;
  for (const row of events) {
    const sessionId = String(row.session_id);
    const at = new Date(String(row.occurred_at)).toISOString();
    const detail = detailOf(row.detail);
    const facts: EventFacts = {
      event: String(row.event),
      signedIn: Boolean(row.signed_in),
      engagedMs: row.engaged_ms === null ? null : num(row.engaged_ms),
      detail,
      budgetBand: row.budget_band === null ? null : String(row.budget_band),
      propertyName:
        row.property_name === null ? null : String(row.property_name),
      comparedNames: (((row.compared_ids as string[] | null) ?? []) as string[])
        .map((id) => names.get(id))
        .filter((name): name is string => Boolean(name)),
      unitTypeName:
        typeof detail?.unitVariantId === "string"
          ? (unitNames.get(detail.unitVariantId) ?? null)
          : null,
    };
    const href =
      facts.event === "enquiry_submitted"
        ? "/admin/enquiries"
        : row.property_slug
          ? `/properties/${String(row.property_slug)}`
          : null;
    const visit = visits.get(sessionId) ?? {
      sessionId,
      startedAt: at,
      events: [],
    };
    visit.events.push({ at, text: describeEvent(facts), href });
    visits.set(sessionId, visit);
    engagedMs += num(row.engaged_ms);
    if (facts.signedIn) signedIn = true;
    if (row.budget_band !== null) budgetBand = String(row.budget_band);
    if (source === null) {
      const found =
        row.source !== null
          ? `${String(row.source)}${row.medium ? ` / ${String(row.medium)}` : ""}`
          : row.referrer_domain !== null
            ? String(row.referrer_domain)
            : null;
      source = found;
    }
  }

  return {
    visitorId,
    label: visitorLabel(visitorId),
    firstSeen: new Date(String(events[0].occurred_at)).toISOString(),
    lastSeen: new Date(
      String(events[events.length - 1].occurred_at),
    ).toISOString(),
    device: String(events[events.length - 1].device),
    signedIn,
    budgetBand,
    source,
    engagedSeconds: Math.round(engagedMs / 1000),
    visits: [...visits.values()],
  };
};
