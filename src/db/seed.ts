import { db, dbClient } from "@/db";
import { sql } from "drizzle-orm";
import { bhkTypes, layoutTypes, propertyTypes } from "@/db/schema/catalog";

const corePropertyTypes = [
  { key: "apartment", label: "Apartment" },
  { key: "bungalow", label: "Bungalow" },
  { key: "plot", label: "Plot" },
];

const coreBhkTypes = [
  { key: "studio", label: "Studio", bedroomCount: null },
  { key: "1bhk", label: "1 BHK", bedroomCount: 1 },
  { key: "2bhk", label: "2 BHK", bedroomCount: 2 },
  { key: "3bhk", label: "3 BHK", bedroomCount: 3 },
  { key: "4bhk", label: "4 BHK", bedroomCount: 4 },
  { key: "5bhk_plus", label: "5 BHK+", bedroomCount: 5 },
];

const coreLayoutTypes = [
  { key: "simplex", label: "Simplex" },
  { key: "duplex", label: "Duplex" },
  { key: "penthouse", label: "Penthouse" },
];

async function seed() {
  await db
    .insert(propertyTypes)
    .values(corePropertyTypes)
    .onConflictDoUpdate({
      target: propertyTypes.key,
      set: { label: sql`excluded.label` },
    });
  await db
    .insert(bhkTypes)
    .values(coreBhkTypes)
    .onConflictDoUpdate({
      target: bhkTypes.key,
      set: {
        label: sql`excluded.label`,
        bedroomCount: sql`excluded.bedroom_count`,
      },
    });
  await db
    .insert(layoutTypes)
    .values(coreLayoutTypes)
    .onConflictDoUpdate({
      target: layoutTypes.key,
      set: { label: sql`excluded.label` },
    });

  console.info("Seeded canonical property, BHK, and layout lookup values.");
  console.info(
    "Amenity/specification catalogs, budget buckets, and OCR field definitions require their separately approved source data before they can be seeded.",
  );
}

try {
  await seed();
} finally {
  await dbClient.end({ timeout: 5 });
}
