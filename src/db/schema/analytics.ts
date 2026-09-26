import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { properties } from "./catalog";

/**
 * First-party analytics (schema v20, `docs/schema/schema.v20.md`; owner answers
 * 2026-09-25, `DECISIONS.md`).
 *
 * A visitor is a random id held in a cookie on their own browser, the same before
 * and after sign-in; `signed_in` says which side of the gate an event happened on,
 * never who. There is no user id, name, phone, email or IP here and no join to a
 * person anywhere. No price and no typed budget figure: only a coarse public band
 * of the stated ceiling (`budget_band`).
 *
 * Append-only for the application role apart from the retention job, which may
 * clear the two ids and stamp `anonymised_at` and nothing else (schema v21): the
 * events themselves are kept, identified for 13 months and anonymous after. The
 * monthly counts below keep the distinct-visitor figures the cleared ids would
 * otherwise take with them.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /**
     * The browser's random id. Null for an anonymous event (a browser that sends a
     * privacy signal is recorded with no id and no cookie) and, once a row is
     * older than the retention window, for every event (`anonymised_at`).
     */
    visitorId: uuid("visitor_id"),
    /** A visit: ends after 30 minutes without an event. Null as `visitor_id`. */
    sessionId: uuid("session_id"),
    /** When the retention job rolled the row's month up and cleared its ids (schema v21). */
    anonymisedAt: timestamp("anonymised_at", { withTimezone: true }),
    event: text("event").notNull(),
    signedIn: boolean("signed_in").notNull(),
    /** The property the event is about, when there is one. */
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    /** The properties being compared at the time, in column order. */
    comparedIds: uuid("compared_ids").array(),
    /** Visible, in-front-of-the-buyer time, for `page_engaged`. */
    engagedMs: integer("engaged_ms"),
    /** Small, event-specific and checked per event: never a price or free text. */
    detail: jsonb("detail"),
    device: text("device").notNull(),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    referrerDomain: text("referrer_domain"),
    budgetBand: text("budget_band"),
  },
  (table) => [
    index("analytics_events_occurred_at_idx").on(table.occurredAt),
    index("analytics_events_event_occurred_idx").on(
      table.event,
      table.occurredAt,
    ),
    index("analytics_events_property_idx").on(table.propertyId),
    check(
      "analytics_events_engaged_ms_range",
      sql`${table.engagedMs} is null or (${table.engagedMs} >= 0 and ${table.engagedMs} <= 1800000)`,
    ),
  ],
);

/** Counts per month, event and property, written as each month's ids are cleared (they keep the distinct-visitor figure). */
export const analyticsEventMonthly = pgTable(
  "analytics_event_monthly",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    month: date("month").notNull(),
    event: text("event").notNull(),
    /** Null for events about no property; the unique index treats nulls as equal. */
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "cascade",
    }),
    events: integer("events").notNull(),
    visitors: integer("visitors").notNull(),
    engagedMs: bigint("engaged_ms", { mode: "number" }).notNull(),
  },
  (table) => [
    unique("analytics_event_monthly_unique")
      .on(table.month, table.event, table.propertyId)
      .nullsNotDistinct(),
  ],
);

/** Which two properties were compared together, per month (the pair is ordered by id). */
export const analyticsPairMonthly = pgTable(
  "analytics_pair_monthly",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    month: date("month").notNull(),
    propertyA: uuid("property_a")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    propertyB: uuid("property_b")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    comparisons: integer("comparisons").notNull(),
    visitors: integer("visitors").notNull(),
  },
  (table) => [
    uniqueIndex("analytics_pair_monthly_unique").on(
      table.month,
      table.propertyA,
      table.propertyB,
    ),
    check(
      "analytics_pair_monthly_ordered",
      sql`${table.propertyA} < ${table.propertyB}`,
    ),
  ],
);
