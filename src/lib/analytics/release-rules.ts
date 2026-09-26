import { RELEASE_WINDOWS } from "@/db/schema/developer-analytics";

/**
 * The rules for releasing developer analytics (schema v21 proposal,
 * `DECISIONS.md` 2026-09-26): which days each report window covers, and which
 * figures may be shown. Pure, so the release job and its tests share one
 * definition and nothing here can read an event.
 *
 * A figure is released only when at least `MIN_VISITORS` distinct visitors are
 * behind it, whatever the figure counts (visitors, visits, or seconds). A figure
 * that is not released has no number at all, never a zero.
 */

/** The privacy gate: distinct visitors behind a figure (Deep, 2026-09-26). */
export const MIN_VISITORS = 5;

/** Bumped whenever a metric's definition or a rule here changes. */
export const RULES_VERSION = "release-v3";

/** Reports are in India time; its offset has no daylight saving. */
export const REPORTING_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/**
 * Fixed windows only, so a developer cannot compare overlapping custom ranges to
 * isolate one day. Quarter and year are calendar ones (Deep, 2026-09-26). The
 * longest is twelve months because raw events are kept thirteen whole UTC months
 * (`RAW_RETENTION_MONTHS`): a trailing thirteen-month window would reach into
 * days the retention job has already rolled up.
 */
export const REPORT_WINDOWS = RELEASE_WINDOWS;
export type WindowKey = (typeof REPORT_WINDOWS)[number];

export interface ReportWindow {
  key: WindowKey;
  /** First day, inclusive, as `YYYY-MM-DD` in India time. */
  start: string;
  /** Last day, inclusive, as `YYYY-MM-DD` in India time. */
  end: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDay = (day: string): Date => {
  const match = DAY.exec(day);
  if (!match) throw new Error(`Not a YYYY-MM-DD day: ${day}`);
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (date.toISOString().slice(0, 10) !== day) {
    throw new Error(`Not a calendar day: ${day}`);
  }
  return date;
};

const formatDay = (date: Date): string => date.toISOString().slice(0, 10);

const addDays = (day: string, days: number): string => {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
};

/** The same day `months` earlier, or that month's last day when it is shorter. */
const monthsBefore = (day: string, months: number): string => {
  const date = parseDay(day);
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return formatDay(target);
};

const reportingDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORTING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The India-time calendar day an instant falls on. */
export const reportingDayOf = (instant: Date): string =>
  reportingDayFormat.format(instant);

/** The last whole India-time day before `now`: what a run reports through. */
export const lastCompleteDay = (now: Date): string =>
  addDays(reportingDayOf(now), -1);

/** Every report window ending on `end` (a whole day, India time). */
export const reportWindows = (end: string): ReportWindow[] => {
  const date = parseDay(end);
  const year = date.getUTCFullYear();
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  const starts: Record<WindowKey, string> = {
    "7d": addDays(end, -6),
    "30d": addDays(end, -29),
    qtd: formatDay(new Date(Date.UTC(year, quarterMonth, 1))),
    ytd: formatDay(new Date(Date.UTC(year, 0, 1))),
    "12m": addDays(monthsBefore(end, 12), 1),
  };
  return REPORT_WINDOWS.map((key) => ({ key, start: starts[key], end }));
};

/**
 * A window as the instants to query events between: from the start of its first
 * day (inclusive) to the start of the day after its last (exclusive), India time.
 */
export const windowBounds = (
  window: Pick<ReportWindow, "start" | "end">,
): { from: Date; until: Date } => ({
  from: new Date(`${window.start}T00:00:00${IST_OFFSET}`),
  until: new Date(`${addDays(window.end, 1)}T00:00:00${IST_OFFSET}`),
});

/** One computed figure before release, with the distinct visitors behind it. */
export interface CandidateCell {
  /** The split's value (a budget band, a device), or null for an unsplit figure. */
  key: string | null;
  visitors: number;
  value: number;
}

export interface ReleasedCell {
  key: string | null;
  released: boolean;
  /** Null exactly when the figure is not released. */
  value: number | null;
}

const assertCount = (visitors: number): void => {
  if (!Number.isInteger(visitors) || visitors < 0) {
    throw new Error(`A visitor count must be a whole number: ${visitors}`);
  }
};

/** Whether a figure with this many distinct visitors behind it may be shown. */
export const meetsGate = (visitors: number): boolean => {
  assertCount(visitors);
  return visitors >= MIN_VISITORS;
};

/** One unsplit figure: its value if the gate is met, otherwise no number. */
export const releaseCell = (cell: CandidateCell): ReleasedCell =>
  meetsGate(cell.visitors)
    ? { key: cell.key, released: true, value: cell.value }
    : { key: cell.key, released: false, value: null };

/**
 * A group of splits of one figure (the same window, property, metric and
 * dimension). Each split must meet the gate on its own. If exactly one split is
 * withheld, the smallest released one is withheld with it, so the hidden one
 * cannot be worked out by subtracting the others from a total. The smallest is
 * the one with the fewest visitors, then the lowest value, then its key, so a
 * rerun withholds the same split.
 */
export const releaseGroup = (cells: CandidateCell[]): ReleasedCell[] => {
  const keys = cells.map((cell) => cell.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error("A split group has two cells with the same key.");
  }
  const released = cells.map(releaseCell);
  const withheld = released.filter((cell) => !cell.released).length;
  if (withheld !== 1) return released;

  const shown = cells
    .filter((_, index) => released[index].released)
    .sort(
      (a, b) =>
        a.visitors - b.visitors ||
        a.value - b.value ||
        String(a.key).localeCompare(String(b.key)),
    );
  const partner = shown[0];
  if (!partner) return released;
  return released.map((cell) =>
    cell.key === partner.key
      ? { key: cell.key, released: false, value: null }
      : cell,
  );
};

/**
 * Named rival properties (owner decision, `DECISIONS.md` 2026-09-26): a pairing
 * is released only when at least `MIN_VISITORS` distinct identified visitors
 * opened a comparison holding both properties. A developer is shown at most
 * `MAX_RIVALS` of them, the most compared first, so the list stays a summary.
 */
export const MAX_RIVALS = 5;

export interface PairCandidate {
  propertyId: string;
  rivalPropertyId: string;
  /** Distinct identified visitors who opened a comparison holding both. */
  visitors: number;
}

/**
 * The pairings a developer may see: each must meet the gate on its own, then per
 * property the `MAX_RIVALS` most compared, with a fixed tie-break (rival id) so a
 * rerun keeps the same ones. A pairing under the gate is not returned at all, so
 * it is never a zero; and a property is never paired with itself.
 */
export const releasePairings = (rows: PairCandidate[]): PairCandidate[] => {
  const byProperty = new Map<string, PairCandidate[]>();
  for (const row of rows) {
    if (row.propertyId === row.rivalPropertyId) continue;
    if (!meetsGate(row.visitors)) continue;
    const list = byProperty.get(row.propertyId) ?? [];
    list.push(row);
    byProperty.set(row.propertyId, list);
  }
  return [...byProperty.values()].flatMap((list) =>
    list
      .sort(
        (a, b) =>
          b.visitors - a.visitors ||
          a.rivalPropertyId.localeCompare(b.rivalPropertyId),
      )
      .slice(0, MAX_RIVALS),
  );
};

/**
 * Peer benchmarks (owner decision, choice 8). A property's figure is set against
 * the median of the same count across other developers' listed properties in its
 * locality, else its city. The cohort must hold at least `MIN_COHORT_PROPERTIES`
 * properties from at least `MIN_COHORT_DEVELOPERS` developers, none of them the
 * property's own developer, so no single property or developer can be read off
 * the median; and the median itself must meet the visitor gate. The narrowest
 * cohort that is large enough is the one used, and there is no fallback past it.
 */
export const MIN_COHORT_PROPERTIES = 5;
export const MIN_COHORT_DEVELOPERS = 3;

export interface BenchmarkProperty {
  propertyId: string;
  developerId: string;
  city: string;
  locality: string;
  /** This property's count of the metric; zero when nothing was counted. */
  value: number;
}

export interface BenchmarkCell {
  cohort: "locality" | "city";
  properties: number;
  developers: number;
  median: number;
}

const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const medianOf = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(median * 10) / 10;
};

export const releaseBenchmark = (
  subject: BenchmarkProperty,
  everyone: BenchmarkProperty[],
): BenchmarkCell | null => {
  const others = everyone.filter(
    (other) =>
      other.propertyId !== subject.propertyId &&
      other.developerId !== subject.developerId &&
      same(other.city, subject.city),
  );
  const cohorts: [BenchmarkCell["cohort"], BenchmarkProperty[]][] = [
    ["locality", others.filter((o) => same(o.locality, subject.locality))],
    ["city", others],
  ];
  for (const [cohort, members] of cohorts) {
    const developers = new Set(members.map((m) => m.developerId)).size;
    if (
      members.length < MIN_COHORT_PROPERTIES ||
      developers < MIN_COHORT_DEVELOPERS
    ) {
      continue;
    }
    const median = medianOf(members.map((m) => m.value));
    // The median is a count of visitors (a half when two middles differ), so it
    // meets the gate by value; `meetsGate` takes whole counts only.
    return median >= MIN_VISITORS
      ? { cohort, properties: members.length, developers, median }
      : null;
  }
  return null;
};
