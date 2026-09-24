import {
  date,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { propertySubmissions, unitVariants } from "./catalog";
import { users } from "./auth";

const privateSchema = pgSchema("private");

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const priceSource = privateSchema.enum("price_source", [
  "developer_submission",
  "admin_manual",
  "rera_extract",
]);

export const budgetBuckets = privateSchema.table(
  "budget_buckets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    minInr: numeric("min_inr").notNull(),
    maxInr: numeric("max_inr").notNull(),
    displayOrder: integer("display_order").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("budget_buckets_display_order_unique").on(table.displayOrder),
  ],
);

export const unitPriceHistory = privateSchema.table("unit_price_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  unitVariantId: uuid("unit_variant_id")
    .notNull()
    .references(() => unitVariants.id),
  priceInr: numeric("price_inr").notNull(),
  pricePerSqft: numeric("price_per_sqft"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  source: priceSource("source").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * The project-wide price range a regulator publishes (schema v16, `DECISIONS.md`
 * 2026-09-24 "price data"): the fallback the budget matcher uses for a property that
 * has no admin-entered unit price. Keyed by the registration number as the regulator
 * prints it (upper case, single spaces), so it can be tied to a property without the
 * property existing yet. Written and read only by the pricing module and the matcher,
 * on the service role; never returned to a buyer.
 */
export const reraPriceRanges = privateSchema.table("rera_price_ranges", {
  registrationNumber: text("registration_number").primaryKey(),
  regulatorCode: text("regulator_code").notNull(),
  minInr: numeric("min_inr").notNull(),
  maxInr: numeric("max_inr").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});

/**
 * A price an admin has typed for a unit type, held here (not in the public
 * submission fields, so no price sits in a public table) until the submission is
 * published. The pricing module then copies it into `unit_price_history` and stamps
 * `applied_at`. Keyed by the unit type's name in the submission; a name that no live
 * unit type carries at apply time is skipped and reported.
 */
export const stagedUnitPrices = privateSchema.table(
  "staged_unit_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => propertySubmissions.id, { onDelete: "cascade" }),
    unitVariantName: text("unit_variant_name").notNull(),
    priceInr: numeric("price_inr").notNull(),
    enteredBy: text("entered_by")
      .notNull()
      .references(() => users.id),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("staged_unit_prices_one_per_name_unique").on(
      table.submissionId,
      table.unitVariantName,
    ),
  ],
);
