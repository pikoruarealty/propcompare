import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { budgetBuckets } from "@/db/schema/private";

if (!process.env.DATABASE_SERVICE_URL) {
  throw new Error(
    "DATABASE_SERVICE_URL is required for private lookup seeding",
  );
}

if (process.env.DATABASE_SERVICE_URL === process.env.DATABASE_URL) {
  throw new Error("DATABASE_SERVICE_URL must not use the restricted app role");
}

const dbClient = postgres(process.env.DATABASE_SERVICE_URL);
const db = drizzle(dbClient);

const fixedBudgetBuckets = [
  { label: "₹0–50 lakh", minInr: "0", maxInr: "5000000", displayOrder: 1 },
  {
    label: "₹50–75 lakh",
    minInr: "5000000",
    maxInr: "7500000",
    displayOrder: 2,
  },
  {
    label: "₹75 lakh–1 crore",
    minInr: "7500000",
    maxInr: "10000000",
    displayOrder: 3,
  },
  {
    label: "₹1–1.5 crore",
    minInr: "10000000",
    maxInr: "15000000",
    displayOrder: 4,
  },
  {
    label: "₹1.5–2 crore",
    minInr: "15000000",
    maxInr: "20000000",
    displayOrder: 5,
  },
  {
    label: "₹2–3 crore",
    minInr: "20000000",
    maxInr: "30000000",
    displayOrder: 6,
  },
  {
    label: "₹3–4 crore",
    minInr: "30000000",
    maxInr: "40000000",
    displayOrder: 7,
  },
  {
    label: "₹4–5 crore",
    minInr: "40000000",
    maxInr: "50000000",
    displayOrder: 8,
  },
  {
    label: "₹5–7.5 crore",
    minInr: "50000000",
    maxInr: "75000000",
    displayOrder: 9,
  },
  {
    label: "₹7.5–10 crore",
    minInr: "75000000",
    maxInr: "100000000",
    displayOrder: 10,
  },
  {
    label: "₹10–15 crore",
    minInr: "100000000",
    maxInr: "150000000",
    displayOrder: 11,
  },
  {
    label: "₹15–20 crore",
    minInr: "150000000",
    maxInr: "200000000",
    displayOrder: 12,
  },
  {
    label: "₹20–30 crore",
    minInr: "200000000",
    maxInr: "300000000",
    displayOrder: 13,
  },
  {
    label: "₹30–50 crore",
    minInr: "300000000",
    maxInr: "500000000",
    displayOrder: 14,
  },
  {
    label: "₹50–100 crore",
    minInr: "500000000",
    maxInr: "1000000000",
    displayOrder: 15,
  },
  {
    label: "₹100 crore+",
    minInr: "1000000000",
    maxInr: "10000000000000",
    displayOrder: 16,
  },
];

try {
  await db
    .insert(budgetBuckets)
    .values(fixedBudgetBuckets)
    .onConflictDoUpdate({
      target: budgetBuckets.displayOrder,
      set: {
        label: sql`excluded.label`,
        minInr: sql`excluded.min_inr`,
        maxInr: sql`excluded.max_inr`,
      },
    });
  console.info("Seeded 16 fixed internal budget buckets.");
} finally {
  await dbClient.end({ timeout: 5 });
}
