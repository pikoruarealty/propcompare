import { describe, expect, it } from "vitest";
import {
  InvalidBudgetRangeError,
  matchPropertiesByBudgetRange,
  type ServiceDb,
} from "./budget-range";

/**
 * Validation-only tests: no database required. `matchPropertiesByBudgetRange`
 * must reject an invalid range before it ever builds a query, so these assert
 * against a `db` stub that throws if touched.
 */

const unreachableDb = new Proxy(
  {},
  {
    get() {
      throw new Error(
        "matchPropertiesByBudgetRange queried the database on invalid input",
      );
    },
  },
) as ServiceDb;

describe("matchPropertiesByBudgetRange validation", () => {
  it.each([
    ["zero minInr", { minInr: 0, maxInr: 4_000_000 }],
    ["negative minInr", { minInr: -1, maxInr: 4_000_000 }],
    ["zero maxInr", { minInr: 3_000_000, maxInr: 0 }],
    ["negative maxInr", { minInr: 3_000_000, maxInr: -4_000_000 }],
    ["minInr greater than maxInr", { minInr: 4_000_000, maxInr: 3_000_000 }],
    ["non-finite minInr", { minInr: Number.NaN, maxInr: 4_000_000 }],
    [
      "non-finite maxInr",
      { minInr: 3_000_000, maxInr: Number.POSITIVE_INFINITY },
    ],
  ])("rejects %s without querying", async (_label, params) => {
    await expect(
      matchPropertiesByBudgetRange(unreachableDb, params),
    ).rejects.toBeInstanceOf(InvalidBudgetRangeError);
  });

  it("accepts minInr === maxInr as a valid (degenerate) range", async () => {
    await expect(
      matchPropertiesByBudgetRange(unreachableDb, {
        minInr: 3_000_000,
        maxInr: 3_000_000,
      }),
    ).rejects.toThrow(/queried the database/);
  });
});
