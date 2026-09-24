import { eq } from "drizzle-orm";
import { reraPriceRanges } from "@/db/schema/private";
import type { ServiceDb } from "@/lib/matching/budget-range";
import type { RegulatorAdapter } from "@/lib/rera/types";
import { getPricingDb } from "./db";

/** The key a range is stored under: the number as the regulator prints it. */
export const rangeKey = (registrationNumber: string): string =>
  registrationNumber.trim().replace(/\s+/g, " ").toUpperCase();

export interface StoredPriceRange {
  minInr: string;
  maxInr: string;
  fetchedAt: Date;
}

export const saveReraPriceRange = async (
  db: ServiceDb,
  input: {
    registrationNumber: string;
    regulatorCode: string;
    minInr: number;
    maxInr: number;
    fetchedAt: Date;
  },
): Promise<void> => {
  const values = {
    regulatorCode: input.regulatorCode,
    minInr: String(input.minInr),
    maxInr: String(input.maxInr),
    fetchedAt: input.fetchedAt,
  };
  await db
    .insert(reraPriceRanges)
    .values({
      registrationNumber: rangeKey(input.registrationNumber),
      ...values,
    })
    .onConflictDoUpdate({
      target: reraPriceRanges.registrationNumber,
      set: { ...values, updatedAt: new Date() },
    });
};

export const readReraPriceRange = async (
  db: ServiceDb,
  registrationNumber: string,
): Promise<StoredPriceRange | null> => {
  const [row] = await db
    .select({
      minInr: reraPriceRanges.minInr,
      maxInr: reraPriceRanges.maxInr,
      fetchedAt: reraPriceRanges.fetchedAt,
    })
    .from(reraPriceRanges)
    .where(
      eq(reraPriceRanges.registrationNumber, rangeKey(registrationNumber)),
    );
  return row ?? null;
};

export type SyncOutcome = "saved" | "none" | "unsupported" | "unavailable";

/**
 * Best effort, after a successful RERA check: asks the adapter for the project's
 * stated price range and keeps it in `private`. It never throws and never blocks
 * the check it follows: a regulator that states no range, an adapter that cannot
 * give one, an unset service connection or a failed request each just say so, and
 * an existing stored range is left as it was.
 */
export const syncReraPriceRange = async (input: {
  adapter: RegulatorAdapter;
  registrationNumber: string;
  db?: ServiceDb | null;
  now?: () => Date;
}): Promise<SyncOutcome> => {
  if (!input.adapter.lookupPriceRange) return "unsupported";
  try {
    const db = input.db === undefined ? await getPricingDb() : input.db;
    if (!db) return "unavailable";
    const range = await input.adapter.lookupPriceRange(
      input.registrationNumber,
    );
    if (!range) return "none";
    await saveReraPriceRange(db, {
      registrationNumber: input.registrationNumber,
      regulatorCode: input.adapter.code,
      minInr: range.minInr,
      maxInr: range.maxInr,
      fetchedAt: (input.now ?? (() => new Date()))(),
    });
    return "saved";
  } catch {
    return "unavailable";
  }
};
