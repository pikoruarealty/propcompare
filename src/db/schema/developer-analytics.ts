import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { developers, properties } from "./catalog";

/**
 * Released developer analytics (schema v21, `docs/schema/schema.v21.md`;
 * `DECISIONS.md` 2026-09-26).
 *
 * The release job reads the raw v20 events and writes here only the figures a
 * developer may see: at least 5 distinct visitors behind each one. A withheld
 * figure is a row with no number, never a zero. Nothing here holds a visitor id,
 * a visit id, a hidden count, a rival property or free text, and this file is
 * kept apart from `./analytics` so developer code can import it without touching
 * raw events. The read-only `propcompare_developer_reader` role can select these
 * two tables and nothing else.
 */

export const RELEASE_WINDOWS = ["7d", "30d", "qtd", "ytd", "12m"] as const;

export const RELEASE_METRICS = [
  "visitors",
  "viewers",
  "comparers",
  "savers",
  "unlockers",
  "visits",
  "returning_visitors",
  "median_dossier_seconds",
  "median_compare_seconds",
  /**
   * Activity counts, gated the same as every other metric on distinct
   * identified visitors, but the shown value counts every event, including one
   * from a browser with no visitor id (a privacy signal, or older than the raw
   * retention window; `DECISIONS.md` 2026-09-26). `viewers`/`comparers` stay
   * identified-only counts of people; these count what happened.
   */
  "views",
  "comparisons",
] as const;

// No enquiry figure of any kind is released to a developer (Deep, 2026-09-26,
// schema v21 migration 0026): they receive forwarded enquiries, so even a
// portfolio count could be tied to named buyers. The metric check refuses one.

export const RELEASE_DIMENSIONS = [
  "none",
  "budget_band",
  "device",
  "intake_bhk",
  "intake_city",
] as const;

export const RELEASE_DEVICES = ["mobile", "tablet", "desktop"] as const;

/**
 * The budget bands a split may name. The same list as `BUDGET_BANDS` in
 * `src/lib/analytics/events.ts` (a test keeps them equal); spelled out here
 * because schema files do not import application code.
 */
export const RELEASE_BUDGET_BANDS = [
  "Up to ₹50 lakh",
  "₹50–75 lakh",
  "₹75 lakh–1 crore",
  "₹1–1.5 crore",
  "₹1.5–2 crore",
  "₹2–3 crore",
  "₹3–5 crore",
  "₹5 crore or more",
] as const;

const listOf = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));

/** One run of the release job: freshness for every report, and its rules. */
export const developerAnalyticsRuns = pgTable(
  "developer_analytics_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(),
    /** The last whole India-time day the run covers. */
    dataThrough: date("data_through").notNull(),
    /** The earliest raw event kept, so no report implies older history. */
    trackingSince: timestamp("tracking_since", { withTimezone: true }),
    minVisitors: smallint("min_visitors").notNull(),
    rulesVersion: text("rules_version").notNull(),
    /** A short code when a run fails; never a message, stack or data. */
    errorCode: text("error_code"),
  },
  (table) => [
    check(
      "developer_analytics_runs_status",
      sql`${table.status} in ('running', 'succeeded', 'failed')`,
    ),
    check(
      "developer_analytics_runs_finished",
      sql`(${table.status} = 'running') = (${table.finishedAt} is null)`,
    ),
    check(
      "developer_analytics_runs_error",
      sql`(${table.status} = 'failed') = (${table.errorCode} is not null)
        and (${table.errorCode} is null or ${table.errorCode} ~ '^[a-z0-9_]{1,40}$')`,
    ),
    check(
      "developer_analytics_runs_min_visitors",
      sql`${table.minVisitors} >= 1`,
    ),
    check(
      "developer_analytics_runs_rules_version",
      sql`${table.rulesVersion} ~ '^[a-z0-9.-]{1,40}$'`,
    ),
    // One run at a time, so two schedulers cannot interleave their writes.
    uniqueIndex("developer_analytics_runs_one_running")
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
    index("developer_analytics_runs_finished_idx").on(
      table.status,
      table.finishedAt,
    ),
  ],
);

/** One figure a developer may see, or a withheld one with no number. */
export const developerAnalyticsReleased = pgTable(
  "developer_analytics_released",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => developerAnalyticsRuns.id, { onDelete: "cascade" }),
    window: text("window").notNull(),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "cascade" }),
    /** Null for a figure across the developer's whole portfolio. */
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "cascade",
    }),
    metric: text("metric").notNull(),
    dimension: text("dimension").notNull(),
    dimensionValue: text("dimension_value"),
    released: boolean("released").notNull(),
    value: numeric("value"),
  },
  (table) => [
    unique("developer_analytics_released_unique")
      .on(
        table.runId,
        table.window,
        table.developerId,
        table.propertyId,
        table.metric,
        table.dimension,
        table.dimensionValue,
      )
      .nullsNotDistinct(),
    index("developer_analytics_released_developer_idx").on(
      table.developerId,
      table.runId,
    ),
    check(
      "developer_analytics_released_window",
      sql`${table.window} in (${listOf(RELEASE_WINDOWS)})
        and ${table.windowStart} <= ${table.windowEnd}`,
    ),
    check(
      "developer_analytics_released_metric",
      sql`${table.metric} in (${listOf(RELEASE_METRICS)})`,
    ),
    check(
      "developer_analytics_released_dimension",
      sql`(${table.dimension} = 'none' and ${table.dimensionValue} is null)
        or (${table.dimension} = 'device' and ${table.dimensionValue} in (${listOf(RELEASE_DEVICES)}))
        or (${table.dimension} = 'budget_band' and ${table.dimensionValue} in (${listOf(RELEASE_BUDGET_BANDS)}))
        or (${table.dimension} = 'intake_bhk' and ${table.dimensionValue} ~ '^[a-z0-9_]{1,40}$')
        or (${table.dimension} = 'intake_city' and length(${table.dimensionValue}) between 1 and 60
          and ${table.dimensionValue} !~ '[[:cntrl:]]')`,
    ),
    check(
      "developer_analytics_released_value",
      sql`${table.released} = (${table.value} is not null)
        and (${table.value} is null or ${table.value} >= 0)`,
    ),
  ],
);

/**
 * Schema v23 (`docs/schema/schema.v23.md`): what a developer may see beyond their
 * own figures. Both tables hold only figures that passed their gate, so a row is
 * always a released figure and no row means "not enough data"; nothing here is a
 * withheld count or a zero.
 */

export const RELEASE_BENCHMARK_METRICS = [
  "visitors",
  "viewers",
  "comparers",
  "savers",
] as const;

export const RELEASE_BENCHMARK_COHORTS = ["locality", "city"] as const;

/**
 * The listed properties a developer's property is most often compared with,
 * named (owner decision, `DECISIONS.md` 2026-09-26). One row is a pairing and its
 * count of distinct identified visitors who opened a comparison holding both,
 * released only at the visitor gate. It carries no figure of the rival's own, no
 * visitor id and nothing about the comparison's other properties.
 */
export const developerAnalyticsPairings = pgTable(
  "developer_analytics_pairings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => developerAnalyticsRuns.id, { onDelete: "cascade" }),
    window: text("window").notNull(),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "cascade" }),
    /** The developer's own listed property. */
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    /** Another listed property (any developer's, or the same developer's). */
    rivalPropertyId: uuid("rival_property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    visitors: integer("visitors").notNull(),
  },
  (table) => [
    unique("developer_analytics_pairings_unique").on(
      table.runId,
      table.window,
      table.propertyId,
      table.rivalPropertyId,
    ),
    index("developer_analytics_pairings_developer_idx").on(
      table.developerId,
      table.runId,
    ),
    check(
      "developer_analytics_pairings_window",
      sql`${table.window} in (${listOf(RELEASE_WINDOWS)})
        and ${table.windowStart} <= ${table.windowEnd}`,
    ),
    check(
      "developer_analytics_pairings_distinct",
      sql`${table.propertyId} <> ${table.rivalPropertyId}`,
    ),
    check("developer_analytics_pairings_visitors", sql`${table.visitors} >= 1`),
  ],
);

/**
 * One property's figure against the typical listed property near it: the median
 * of the same count across a cohort of other developers' listed properties (the
 * property's locality, else its city). Released only when the cohort is large
 * enough to hide any one property and the median itself meets the visitor gate.
 * The cohort's size is stored so the figure can say what it is a median of.
 */
export const developerAnalyticsBenchmarks = pgTable(
  "developer_analytics_benchmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => developerAnalyticsRuns.id, { onDelete: "cascade" }),
    window: text("window").notNull(),
    windowStart: date("window_start").notNull(),
    windowEnd: date("window_end").notNull(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    cohort: text("cohort").notNull(),
    cohortProperties: smallint("cohort_properties").notNull(),
    cohortDevelopers: smallint("cohort_developers").notNull(),
    median: numeric("median").notNull(),
  },
  (table) => [
    unique("developer_analytics_benchmarks_unique").on(
      table.runId,
      table.window,
      table.propertyId,
      table.metric,
    ),
    index("developer_analytics_benchmarks_developer_idx").on(
      table.developerId,
      table.runId,
    ),
    check(
      "developer_analytics_benchmarks_window",
      sql`${table.window} in (${listOf(RELEASE_WINDOWS)})
        and ${table.windowStart} <= ${table.windowEnd}`,
    ),
    check(
      "developer_analytics_benchmarks_metric",
      sql`${table.metric} in (${listOf(RELEASE_BENCHMARK_METRICS)})`,
    ),
    check(
      "developer_analytics_benchmarks_cohort",
      sql`${table.cohort} in (${listOf(RELEASE_BENCHMARK_COHORTS)})`,
    ),
    check(
      "developer_analytics_benchmarks_size",
      sql`${table.cohortProperties} >= 1
        and ${table.cohortDevelopers} between 1 and ${table.cohortProperties}
        and ${table.median} >= 0`,
    ),
  ],
);
