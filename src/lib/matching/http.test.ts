import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/properties/types";
import { parseDiscoveryMatchBody } from "./http";

/**
 * Body-validation contract for `POST /api/v1/discovery/matches`, tested
 * without a database. Wire behaviour lives in `discovery.integration.test.ts`.
 */

const expectFailure = (body: unknown) => {
  const result = parseDiscoveryMatchBody(body);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a parse failure");
  return result;
};

const expectParams = (body: unknown) => {
  const result = parseDiscoveryMatchBody(body);
  if (!result.ok) {
    throw new Error(`expected a parse success, got: ${result.message}`);
  }
  return result.params;
};

describe("parseDiscoveryMatchBody — accepted values", () => {
  it("applies page/pageSize defaults when absent", () => {
    expect(expectParams({ minInr: 30_000_000, maxInr: 40_000_000 })).toEqual({
      minInr: 30_000_000,
      maxInr: 40_000_000,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("carries city, bhk, page, and pageSize through", () => {
    expect(
      expectParams({
        minInr: 30_000_000,
        maxInr: 40_000_000,
        city: "Ahmedabad",
        bhk: "3bhk",
        page: 2,
        pageSize: 10,
      }),
    ).toEqual({
      minInr: 30_000_000,
      maxInr: 40_000_000,
      city: "Ahmedabad",
      bhk: "3bhk",
      page: 2,
      pageSize: 10,
    });
  });

  it("accepts minInr === maxInr", () => {
    expect(
      expectParams({ minInr: 30_000_000, maxInr: 30_000_000 }).minInr,
    ).toBe(30_000_000);
  });

  it("accepts maxUnbounded: true in place of maxInr", () => {
    expect(expectParams({ minInr: 30_000_000, maxUnbounded: true })).toEqual({
      minInr: 30_000_000,
      maxUnbounded: true,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("carries city, bhk, page, and pageSize alongside maxUnbounded", () => {
    expect(
      expectParams({
        minInr: 30_000_000,
        maxUnbounded: true,
        city: "Ahmedabad",
        bhk: "3bhk",
        page: 2,
        pageSize: 10,
      }),
    ).toEqual({
      minInr: 30_000_000,
      maxUnbounded: true,
      city: "Ahmedabad",
      bhk: "3bhk",
      page: 2,
      pageSize: 10,
    });
  });
});

describe("parseDiscoveryMatchBody — rejected values", () => {
  it.each([
    ["a non-object body", "not-an-object"],
    ["null", null],
    ["an array", []],
  ])("rejects %s", (_label, body) => {
    expectFailure(body);
  });

  it("rejects an unknown field", () => {
    expectFailure({ minInr: 1, maxInr: 2, priceInr: 5 });
  });

  it.each([
    ["missing minInr", { maxInr: 4_000_000 }],
    ["missing maxInr", { minInr: 3_000_000 }],
    ["zero minInr", { minInr: 0, maxInr: 4_000_000 }],
    ["negative minInr", { minInr: -1, maxInr: 4_000_000 }],
    ["non-numeric minInr", { minInr: "3000000", maxInr: 4_000_000 }],
    [
      "non-finite maxInr",
      { minInr: 3_000_000, maxInr: Number.POSITIVE_INFINITY },
    ],
    ["minInr greater than maxInr", { minInr: 4_000_000, maxInr: 3_000_000 }],
  ])("rejects %s", (_label, body) => {
    expectFailure(body);
  });

  it("rejects an empty city", () => {
    expectFailure({ minInr: 1, maxInr: 2, city: "" });
  });

  it("rejects a non-string bhk", () => {
    expectFailure({ minInr: 1, maxInr: 2, bhk: 3 });
  });

  it.each([
    ["page 0", { minInr: 1, maxInr: 2, page: 0 }],
    ["non-integer page", { minInr: 1, maxInr: 2, page: 1.5 }],
    [
      "pageSize above the max",
      { minInr: 1, maxInr: 2, pageSize: MAX_PAGE_SIZE + 1 },
    ],
    ["pageSize 0", { minInr: 1, maxInr: 2, pageSize: 0 }],
  ])("rejects %s", (_label, body) => {
    expectFailure(body);
  });

  it("rejects both maxInr and maxUnbounded: true given together", () => {
    expectFailure({ minInr: 1, maxInr: 2, maxUnbounded: true });
  });

  it("rejects a non-boolean maxUnbounded", () => {
    expectFailure({ minInr: 1, maxInr: 2, maxUnbounded: "true" });
  });

  it("rejects maxUnbounded: false with maxInr omitted", () => {
    expectFailure({ minInr: 1, maxUnbounded: false });
  });
});
