import {
  date,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { unitVariants } from "./catalog";
import { users } from "./auth";

const privateSchema = pgSchema("private");

export const priceSource = privateSchema.enum("price_source", [
  "developer_submission",
  "admin_manual",
  "rera_extract",
]);

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
