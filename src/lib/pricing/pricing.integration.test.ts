import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { serviceDb, serviceDbClient } from "@/db/service";
import {
  developers,
  properties,
  propertyRevisions,
  propertySubmissionFields,
  propertySubmissions,
  unitVariants,
} from "@/db/schema/catalog";
import { users } from "@/db/schema/auth";
import {
  reraPriceRanges,
  stagedUnitPrices,
  unitPriceHistory,
} from "@/db/schema/private";
import { matchPropertiesByBudgetRange } from "@/lib/matching/budget-range";
import type { RegulatorAdapter } from "@/lib/rera/types";
import { publishSubmission } from "@/lib/submissions/publisher";
import { applyStagedPrices } from "./apply";
import {
  getPricesState,
  retryApplyPrices,
  stagePrice,
  unstagePrice,
} from "./panel";
import {
  readReraPriceRange,
  saveReraPriceRange,
  syncReraPriceRange,
} from "./ranges";
import {
  clearStagedPrice,
  listCurrentPrices,
  listStagedPrices,
  setStagedPrice,
} from "./staged";

/**
 * Private prices against the real database (`DECISIONS.md` 2026-09-24, "price
 * data"): staging an admin's price, applying it after publish, the RERA range, and
 * how the budget matcher uses them. Every property is created through the real
 * `publishSubmission`; prices only ever go through the pricing module.
 */

const testUserId = `pricing-user-${randomUUID()}`;
let developerId: string;
const createdSubmissionIds: string[] = [];
const createdPropertyIds: string[] = [];
const createdNumbers: string[] = [];

const newSubmission = async (): Promise<string> => {
  const [submission] = await db
    .insert(propertySubmissions)
    .values({
      developerId,
      submittedBy: testUserId,
      reviewedBy: testUserId,
      source: "manual_form",
      status: "approved",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  createdSubmissionIds.push(submission.id);
  return submission.id;
};

const fill = async (
  submissionId: string,
  fields: Record<string, unknown>,
): Promise<void> => {
  await db.insert(propertySubmissionFields).values(
    Object.entries(fields).map(([fieldKey, value]) => ({
      submissionId,
      fieldKey,
      value,
      reviewStatus: "confirmed" as const,
    })),
  );
};

const propertyFields = (registrationNumber?: string) => ({
  "property.name": `Pricing Test ${randomUUID()}`,
  "property.type": "apartment",
  "property.city": "Ahmedabad",
  "property.locality": "Test Locality",
  ...(registrationNumber
    ? { "property.rera_registration_number": registrationNumber }
    : {}),
  unit_variants: [
    {
      variantName: "Type A",
      bhkTypeKey: "2bhk",
      areas: [{ basis: "carpet", areaSqft: 900 }],
    },
    {
      variantName: "Type B",
      bhkTypeKey: "3bhk",
      areas: [{ basis: "carpet", areaSqft: 1400 }],
    },
  ],
});

const publish = async (
  submissionId: string,
): Promise<Awaited<ReturnType<typeof publishSubmission>>> => {
  const result = await publishSubmission({
    submissionId,
    actorUserId: testUserId,
    actorRole: "owner",
  });
  createdPropertyIds.push(result.propertyId);
  return result;
};

const publishProperty = async (registrationNumber?: string) => {
  const submissionId = await newSubmission();
  await fill(submissionId, propertyFields(registrationNumber));
  const result = await publish(submissionId);
  const variants = await db
    .select({ id: unitVariants.id, name: unitVariants.variantName })
    .from(unitVariants)
    .where(eq(unitVariants.propertyId, result.propertyId));
  const idOf = (name: string) => variants.find((v) => v.name === name)!.id;
  return {
    submissionId,
    propertyId: result.propertyId,
    typeA: idOf("Type A"),
    typeB: idOf("Type B"),
  };
};

const uniqueNumber = () => {
  const number = `PR/GJ/PRICING-TEST/${randomUUID().slice(0, 8).toUpperCase()}`;
  createdNumbers.push(number);
  return number;
};

const currentRows = (unitVariantId: string) =>
  serviceDb
    .select()
    .from(unitPriceHistory)
    .where(
      and(
        eq(unitPriceHistory.unitVariantId, unitVariantId),
        isNull(unitPriceHistory.effectiveTo),
      ),
    );

beforeAll(async () => {
  await db.insert(users).values({
    id: testUserId,
    name: "Pricing Test User",
    email: `${testUserId}@example.test`,
  });
  const [developer] = await db
    .insert(developers)
    .values({ name: `Pricing Test Developer ${randomUUID()}` })
    .returning({ id: developers.id });
  developerId = developer.id;
});

afterAll(async () => {
  await serviceDb
    .delete(stagedUnitPrices)
    .where(eq(stagedUnitPrices.enteredBy, testUserId));
  await serviceDb
    .delete(unitPriceHistory)
    .where(eq(unitPriceHistory.createdBy, testUserId));
  if (createdNumbers.length > 0) {
    await serviceDb
      .delete(reraPriceRanges)
      .where(inArray(reraPriceRanges.registrationNumber, createdNumbers));
  }
  await db
    .delete(propertyRevisions)
    .where(inArray(propertyRevisions.submissionId, createdSubmissionIds));
  await db
    .delete(propertySubmissions)
    .where(inArray(propertySubmissions.id, createdSubmissionIds));
  await db.delete(properties).where(inArray(properties.id, createdPropertyIds));
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(users).where(eq(users.id, testUserId));
  await serviceDbClient.end({ timeout: 5 });
});

describe("staged prices", () => {
  it("are kept per submission and unit type, replaced in place, and cleared", async () => {
    const submissionId = await newSubmission();
    const enteredBy = testUserId;

    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "  Type   A ",
      priceInr: "25000000",
      enteredBy,
    });
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "26000000",
      enteredBy,
    });

    const staged = await listStagedPrices(serviceDb, submissionId);
    expect(staged).toHaveLength(1);
    expect(staged[0]).toMatchObject({
      unitVariantName: "Type A",
      priceInr: "26000000",
      appliedAt: null,
    });

    await clearStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
    });
    expect(await listStagedPrices(serviceDb, submissionId)).toEqual([]);
  });

  it("go when their submission is deleted", async () => {
    const submissionId = await newSubmission();
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "1",
      enteredBy: testUserId,
    });

    await db
      .delete(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));

    expect(await listStagedPrices(serviceDb, submissionId)).toEqual([]);
  });

  it("cannot be read or written by the normal application connection", async () => {
    await expect(
      db.execute("select count(*) from private.staged_unit_prices"),
    ).rejects.toThrow();
    await expect(
      db.execute("select count(*) from private.rera_price_ranges"),
    ).rejects.toThrow();
  });
});

describe("applyStagedPrices", () => {
  it("writes an admin_manual current price for each named unit type", async () => {
    const { submissionId, propertyId, typeA, typeB } = await publishProperty();
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "type a",
      priceInr: "25000000",
      enteredBy: testUserId,
    });
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type B",
      priceInr: "38000000",
      enteredBy: testUserId,
    });

    const result = await applyStagedPrices(serviceDb, {
      submissionId,
      propertyId,
    });

    expect(result.applied.sort()).toEqual(["Type B", "type a"]);
    const [a] = await currentRows(typeA);
    expect(a).toMatchObject({
      priceInr: "25000000",
      source: "admin_manual",
      createdBy: testUserId,
    });
    expect((await currentRows(typeB))[0].priceInr).toBe("38000000");
    expect(
      (await listStagedPrices(serviceDb, submissionId)).every(
        (s) => s.appliedAt,
      ),
    ).toBe(true);
  });

  it("is safe to run again, and an unchanged price writes nothing new", async () => {
    const { submissionId, propertyId, typeA } = await publishProperty();
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "25000000",
      enteredBy: testUserId,
    });
    await applyStagedPrices(serviceDb, { submissionId, propertyId });

    const again = await applyStagedPrices(serviceDb, {
      submissionId,
      propertyId,
    });
    expect(again).toEqual({ applied: [], unchanged: [], unknown: [] });

    // Restaging the same number is reported as unchanged and adds no row.
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "25000000.00",
      enteredBy: testUserId,
    });
    const same = await applyStagedPrices(serviceDb, {
      submissionId,
      propertyId,
    });
    expect(same.unchanged).toEqual(["Type A"]);
    const all = await serviceDb
      .select()
      .from(unitPriceHistory)
      .where(eq(unitPriceHistory.unitVariantId, typeA));
    expect(all).toHaveLength(1);
  });

  it("ends the old price and starts the new one, so there is always one current price", async () => {
    const { submissionId, propertyId, typeA } = await publishProperty();
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "25000000",
      enteredBy: testUserId,
    });
    await applyStagedPrices(serviceDb, { submissionId, propertyId });
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "27000000",
      enteredBy: testUserId,
    });

    const result = await applyStagedPrices(serviceDb, {
      submissionId,
      propertyId,
    });

    expect(result.applied).toEqual(["Type A"]);
    const current = await currentRows(typeA);
    expect(current).toHaveLength(1);
    expect(current[0].priceInr).toBe("27000000");
    const history = await serviceDb
      .select()
      .from(unitPriceHistory)
      .where(eq(unitPriceHistory.unitVariantId, typeA));
    expect(history).toHaveLength(2);
    expect(history.filter((row) => row.effectiveTo !== null)).toHaveLength(1);
  });

  it("leaves a name no live unit type carries staged, and says so", async () => {
    const { submissionId, propertyId } = await publishProperty();
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Penthouse",
      priceInr: "90000000",
      enteredBy: testUserId,
    });

    const result = await applyStagedPrices(serviceDb, {
      submissionId,
      propertyId,
    });

    expect(result.unknown).toEqual(["Penthouse"]);
    const [row] = await listStagedPrices(serviceDb, submissionId);
    expect(row.appliedAt).toBeNull();
  });

  it("lists the current price of each live unit type for the panel", async () => {
    const { submissionId, propertyId } = await publishProperty();
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "25000000",
      enteredBy: testUserId,
    });
    await applyStagedPrices(serviceDb, { submissionId, propertyId });

    expect(await listCurrentPrices(serviceDb, propertyId)).toEqual([
      { unitVariantName: "Type A", priceInr: "25000000" },
    ]);
  });
});

describe("publishing applies staged prices", () => {
  it("writes them right after the publish transaction commits, and says what it did", async () => {
    const submissionId = await newSubmission();
    await fill(submissionId, propertyFields());
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type B",
      priceInr: "41000000",
      enteredBy: testUserId,
    });

    const result = await publish(submissionId);

    expect(result.prices).toMatchObject({
      applied: ["Type B"],
      unchanged: [],
      unknown: [],
      failed: false,
    });
    const [variant] = await db
      .select({ id: unitVariants.id })
      .from(unitVariants)
      .where(
        and(
          eq(unitVariants.propertyId, result.propertyId),
          eq(unitVariants.variantName, "Type B"),
        ),
      );
    expect((await currentRows(variant.id))[0].priceInr).toBe("41000000");
  });

  it("leaves a publish with nothing staged untouched", async () => {
    const { propertyId } = await publishProperty();
    const [row] = await db
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.id, propertyId));
    expect(row.id).toBe(propertyId);
  });
});

describe("the RERA price range", () => {
  const adapter = (
    range: { minInr: number; maxInr: number } | null,
  ): RegulatorAdapter => ({
    code: "gujrera",
    label: "GujRERA",
    ownsRegistrationNumber: () => true,
    lookupByRegistrationNumber: async () => {
      throw new Error("not used");
    },
    lookupPriceRange: async () => range,
  });

  it("is kept under the number as the regulator prints it, and replaced on the next check", async () => {
    const number = uniqueNumber();
    await saveReraPriceRange(serviceDb, {
      registrationNumber: number.toLowerCase(),
      regulatorCode: "gujrera",
      minInr: 22_573_000,
      maxInr: 66_319_200,
      fetchedAt: new Date("2026-09-24T00:00:00Z"),
    });
    await saveReraPriceRange(serviceDb, {
      registrationNumber: `  ${number} `,
      regulatorCode: "gujrera",
      minInr: 23_000_000,
      maxInr: 67_000_000,
      fetchedAt: new Date("2026-09-25T00:00:00Z"),
    });

    const stored = await readReraPriceRange(serviceDb, number);
    expect(stored).toMatchObject({ minInr: "23000000", maxInr: "67000000" });
  });

  it("is saved after a check, and a check that finds none keeps the last one", async () => {
    const number = uniqueNumber();
    expect(
      await syncReraPriceRange({
        adapter: adapter({ minInr: 1_000_000, maxInr: 2_000_000 }),
        registrationNumber: number,
        db: serviceDb,
      }),
    ).toBe("saved");
    expect(
      await syncReraPriceRange({
        adapter: adapter(null),
        registrationNumber: number,
        db: serviceDb,
      }),
    ).toBe("none");

    expect(await readReraPriceRange(serviceDb, number)).toMatchObject({
      minInr: "1000000",
      maxInr: "2000000",
    });
  });

  it("never throws: an adapter without ranges, no connection, or a failing lookup each just say so", async () => {
    const number = uniqueNumber();
    const bare: RegulatorAdapter = { ...adapter(null) };
    delete bare.lookupPriceRange;

    expect(
      await syncReraPriceRange({
        adapter: bare,
        registrationNumber: number,
        db: serviceDb,
      }),
    ).toBe("unsupported");
    expect(
      await syncReraPriceRange({
        adapter: adapter({ minInr: 1, maxInr: 2 }),
        registrationNumber: number,
        db: null,
      }),
    ).toBe("unavailable");
    expect(
      await syncReraPriceRange({
        adapter: {
          ...adapter(null),
          lookupPriceRange: async () => {
            throw new Error("site down");
          },
        },
        registrationNumber: number,
        db: serviceDb,
      }),
    ).toBe("unavailable");
  });
});

describe("budget matching with the RERA range and admin prices", () => {
  // The buyer's band is 30 to 40 lakh-crore style figures: 3 to 4 crore, so the
  // ±20% match band is 2.4 to 4.8 crore.
  const band = { minInr: 30_000_000, maxInr: 40_000_000 };

  const withRange = async (minInr: number, maxInr: number) => {
    const number = uniqueNumber();
    const property = await publishProperty(number);
    await saveReraPriceRange(serviceDb, {
      registrationNumber: number,
      regulatorCode: "gujrera",
      minInr,
      maxInr,
      fetchedAt: new Date(),
    });
    return property;
  };

  it("matches every unit type of an unpriced property whose RERA range overlaps the band", async () => {
    const { propertyId, typeA, typeB } = await withRange(
      20_000_000,
      60_000_000,
    );

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    expect(matches).toContainEqual({ propertyId, unitVariantId: typeA });
    expect(matches).toContainEqual({ propertyId, unitVariantId: typeB });
  });

  it("does not match a range that lies wholly outside the band", async () => {
    const above = await withRange(100_000_000, 200_000_000);
    const below = await withRange(5_000_000, 20_000_000);

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    expect(matches.map((m) => m.propertyId)).not.toContain(above.propertyId);
    expect(matches.map((m) => m.propertyId)).not.toContain(below.propertyId);
  });

  it("includes the band edges: a range ending at 2.4 crore or starting at 4.8 crore still matches", async () => {
    const low = await withRange(10_000_000, 24_000_000);
    const high = await withRange(48_000_000, 90_000_000);

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    expect(matches.map((m) => m.propertyId)).toContain(low.propertyId);
    expect(matches.map((m) => m.propertyId)).toContain(high.propertyId);
  });

  it("prefers a typed price for its own unit type, and falls back to RERA's range for an unpriced one", async () => {
    const { submissionId, propertyId, typeA, typeB } = await withRange(
      20_000_000,
      60_000_000,
    );
    // Only Type A is priced, and its price is far outside the buyer's band.
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "10000000",
      enteredBy: testUserId,
    });
    await applyStagedPrices(serviceDb, { submissionId, propertyId });

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    // Type A's typed price wins (too cheap for the band); Type B has no typed
    // price, so RERA's range stands in for it (owner direction, 2026-09-25).
    expect(matches).not.toContainEqual({ propertyId, unitVariantId: typeA });
    expect(matches).toContainEqual({ propertyId, unitVariantId: typeB });

    const cheap = await matchPropertiesByBudgetRange(serviceDb, {
      minInr: 9_000_000,
      maxInr: 11_000_000,
    });
    expect(cheap).toContainEqual({ propertyId, unitVariantId: typeA });
    expect(cheap).not.toContainEqual({ propertyId, unitVariantId: typeB });
  });

  it("uses the admin's price rather than RERA's when they differ", async () => {
    // RERA says 2 to 6 crore, so the range alone would match a 3 to 4 crore buyer.
    const { submissionId, propertyId, typeA, typeB } = await withRange(
      20_000_000,
      60_000_000,
    );
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "70000000",
      enteredBy: testUserId,
    });
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Type B",
      priceInr: "72000000",
      enteredBy: testUserId,
    });
    await applyStagedPrices(serviceDb, { submissionId, propertyId });

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    expect(matches.map((m) => m.propertyId)).not.toContain(propertyId);
    const dear = await matchPropertiesByBudgetRange(serviceDb, {
      minInr: 70_000_000,
      maxInr: 75_000_000,
    });
    expect(dear).toContainEqual({ propertyId, unitVariantId: typeA });
    expect(dear).toContainEqual({ propertyId, unitVariantId: typeB });
  });

  it("matches on the range when the buyer states no upper limit", async () => {
    const { propertyId, typeA } = await withRange(90_000_000, 120_000_000);

    const matches = await matchPropertiesByBudgetRange(serviceDb, {
      minInr: 100_000_000,
      maxUnbounded: true,
    });

    expect(matches).toContainEqual({ propertyId, unitVariantId: typeA });
  });

  it("never matches a property with no RERA number or range and no price", async () => {
    const { propertyId } = await publishProperty();

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    expect(matches.map((m) => m.propertyId)).not.toContain(propertyId);
  });

  it("does not match a removed unit type on the range", async () => {
    const { propertyId, typeB } = await withRange(20_000_000, 60_000_000);
    await db
      .update(unitVariants)
      .set({ removedAt: new Date() })
      .where(eq(unitVariants.id, typeB));

    const matches = await matchPropertiesByBudgetRange(serviceDb, band);

    expect(matches).not.toContainEqual({ propertyId, unitVariantId: typeB });
  });
});

describe("the Prices tab's state and rules", () => {
  it("lists the submission's unit types with what is typed, what is live, and RERA's range", async () => {
    const number = uniqueNumber();
    const submissionId = await newSubmission();
    await fill(submissionId, propertyFields(number));
    await saveReraPriceRange(serviceDb, {
      registrationNumber: number,
      regulatorCode: "gujrera",
      minInr: 22_573_000,
      maxInr: 66_319_200,
      fetchedAt: new Date("2026-09-24T00:00:00Z"),
    });
    await stagePrice(db, serviceDb, {
      submissionId,
      unitVariantName: "type b",
      priceInr: "3,80,00,000",
      enteredBy: testUserId,
    });

    const state = await getPricesState(db, serviceDb, submissionId);

    expect(state.editable).toBe(true);
    expect(state.unavailable).toBe(false);
    expect(state.unitTypes).toEqual([
      { name: "Type A", staged: null, stagedApplied: false, current: null },
      {
        name: "Type B",
        staged: "38000000",
        stagedApplied: false,
        current: null,
      },
    ]);
    expect(state.registrationNumber).toBe(number);
    expect(state.rera).toMatchObject({
      minInr: "22573000",
      maxInr: "66319200",
    });
  });

  it("refuses a price that is not whole rupees, and a unit type the submission does not list", async () => {
    const submissionId = await newSubmission();
    await fill(submissionId, propertyFields());

    for (const priceInr of ["2.5", "0", "abc", "", "-1"]) {
      await expect(
        stagePrice(db, serviceDb, {
          submissionId,
          unitVariantName: "Type A",
          priceInr,
          enteredBy: testUserId,
        }),
      ).rejects.toMatchObject({ code: "invalid_price" });
    }
    await expect(
      stagePrice(db, serviceDb, {
        submissionId,
        unitVariantName: "Penthouse",
        priceInr: "1000",
        enteredBy: testUserId,
      }),
    ).rejects.toMatchObject({ code: "unknown_unit_type" });
    expect(await listStagedPrices(serviceDb, submissionId)).toEqual([]);
  });

  it("applies a price typed on a published property at once, never removes a live one, and reports orphaned ones", async () => {
    const { submissionId, propertyId } = await publishProperty();

    // Owner direction 2026-09-25: a published property's prices can still be
    // typed, and take effect straight away.
    await stagePrice(db, serviceDb, {
      submissionId,
      unitVariantName: "Type A",
      priceInr: "31000000",
      enteredBy: testUserId,
    });
    expect(await listCurrentPrices(serviceDb, propertyId)).toContainEqual({
      unitVariantName: "Type A",
      priceInr: "31000000",
    });
    await expect(
      unstagePrice(db, serviceDb, {
        submissionId,
        unitVariantName: "Type A",
      }),
    ).rejects.toMatchObject({ code: "invalid_state" });

    // Staged after the fact (as an old row would be), a name no unit type carries shows up.
    await setStagedPrice(serviceDb, {
      submissionId,
      unitVariantName: "Removed type",
      priceInr: "5",
      enteredBy: testUserId,
    });
    const state = await getPricesState(db, serviceDb, submissionId);
    expect(state.editable).toBe(true);
    expect(state.orphanedStaged).toEqual(["Removed type"]);
    // The retry applies what it can and reports the rest.
    const retried = await retryApplyPrices(db, serviceDb, submissionId);
    expect(retried.unknown).toEqual(["Removed type"]);
  });

  it("does not offer a retry for a submission that is not published", async () => {
    const submissionId = await newSubmission();

    await expect(
      retryApplyPrices(db, serviceDb, submissionId),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("answers as unavailable, with no prices, when there is no private connection", async () => {
    const submissionId = await newSubmission();
    await fill(submissionId, propertyFields());

    const state = await getPricesState(db, null, submissionId);

    expect(state.unavailable).toBe(true);
    expect(state.editable).toBe(false);
    expect(state.unitTypes.map((row) => row.name)).toEqual([
      "Type A",
      "Type B",
    ]);
    expect(state.rera).toBeNull();
  });

  it("says a submission does not exist", async () => {
    await expect(
      getPricesState(db, serviceDb, randomUUID()),
    ).rejects.toMatchObject({ code: "submission_not_found" });
    await expect(
      getPricesState(db, serviceDb, "not-a-uuid"),
    ).rejects.toMatchObject({ code: "submission_not_found" });
  });
});
