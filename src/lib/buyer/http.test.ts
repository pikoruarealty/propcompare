import { describe, expect, it } from "vitest";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import {
  parseComparisonBody,
  parseEnquiryBody,
  parseIntakeHandoffBody,
  parsePropertyIdBody,
  parseSavedPropertiesQuery,
} from "./http";

describe("parsePropertyIdBody", () => {
  it("accepts a propertyId", () => {
    const result = parsePropertyIdBody({ propertyId: "abc" });
    expect(result).toEqual({ ok: true, propertyId: "abc" });
  });

  it.each([
    ["missing propertyId", {}],
    ["empty propertyId", { propertyId: "" }],
    ["non-string propertyId", { propertyId: 5 }],
    ["unknown field", { propertyId: "abc", extra: 1 }],
    ["non-object body", "abc"],
    ["array body", []],
    ["null body", null],
  ])("rejects %s", (_label, body) => {
    const result = parsePropertyIdBody(body);
    expect(result.ok).toBe(false);
  });
});

describe("parseSavedPropertiesQuery", () => {
  const parse = (query: string) =>
    parseSavedPropertiesQuery(new URLSearchParams(query));

  it("defaults page and pageSize", () => {
    const result = parse("");
    expect(result).toEqual({ ok: true, params: { page: 1, pageSize: 20 } });
  });

  it("accepts explicit page and pageSize", () => {
    const result = parse("page=2&pageSize=5");
    expect(result).toEqual({ ok: true, params: { page: 2, pageSize: 5 } });
  });

  it.each([
    ["unknown parameter", "foo=1"],
    ["zero page", "page=0"],
    ["non-integer page", "page=1.5"],
    ["pageSize above max", "pageSize=51"],
    ["pageSize zero", "pageSize=0"],
  ])("rejects %s", (_label, query) => {
    expect(parse(query).ok).toBe(false);
  });
});

describe("parseComparisonBody", () => {
  it("accepts a list of items with and without unitVariantId", () => {
    const result = parseComparisonBody({
      items: [{ propertyId: "p1" }, { propertyId: "p2", unitVariantId: "v1" }],
    });
    expect(result).toEqual({
      ok: true,
      items: [{ propertyId: "p1" }, { propertyId: "p2", unitVariantId: "v1" }],
    });
  });

  it.each([
    ["missing items", {}],
    ["empty items array", { items: [] }],
    ["non-array items", { items: "p1" }],
    [
      "too many items",
      {
        items: Array.from({ length: 11 }, (_, i) => ({ propertyId: `p${i}` })),
      },
    ],
    ["item missing propertyId", { items: [{}] }],
    ["item with unknown field", { items: [{ propertyId: "p1", price: 5 }] }],
    ["unknown top-level field", { items: [{ propertyId: "p1" }], extra: 1 }],
  ])("rejects %s", (_label, body) => {
    expect(parseComparisonBody(body).ok).toBe(false);
  });
});

describe("parseEnquiryBody", () => {
  it("accepts propertyId alone", () => {
    expect(parseEnquiryBody({ propertyId: "p1" })).toEqual({
      ok: true,
      input: { propertyId: "p1" },
    });
  });

  it("accepts propertyId, unitVariantId, and message", () => {
    expect(
      parseEnquiryBody({
        propertyId: "p1",
        unitVariantId: "v1",
        message: "Interested",
      }),
    ).toEqual({
      ok: true,
      input: { propertyId: "p1", unitVariantId: "v1", message: "Interested" },
    });
  });

  it.each([
    ["missing propertyId", {}],
    ["empty message", { propertyId: "p1", message: "" }],
    ["unknown field", { propertyId: "p1", status: "new" }],
  ])("rejects %s", (_label, body) => {
    expect(parseEnquiryBody(body).ok).toBe(false);
  });
});

describe("parseIntakeHandoffBody", () => {
  const EMPTY_BODY = {
    priorities: [],
    bhk: null,
    city: null,
    statedRange: null,
  };

  it("accepts the empty-answers shape", () => {
    expect(parseIntakeHandoffBody(EMPTY_BODY)).toEqual({
      ok: true,
      answers: EMPTY_BODY,
    });
  });

  it("accepts every field stated", () => {
    const body = {
      priorities: ["family_space", "location"],
      bhk: "2bhk",
      city: "Ahmedabad",
      statedRange: { fromLakh: 50, toLakh: 150 },
    };
    expect(parseIntakeHandoffBody(body)).toEqual({ ok: true, answers: body });
  });

  it("never carries a forbidden key, at any nesting level", () => {
    const result = parseIntakeHandoffBody({
      priorities: ["family_space"],
      bhk: "2bhk",
      city: "Ahmedabad",
      statedRange: { fromLakh: 50, toLakh: 150 },
    });
    expect(result.ok).toBe(true);
    expect(findForbiddenKeys(result)).toEqual([]);
  });

  it.each([
    ["missing priorities", { bhk: null, city: null, statedRange: null }],
    ["missing bhk", { priorities: [], city: null, statedRange: null }],
    ["missing city", { priorities: [], bhk: null, statedRange: null }],
    ["missing statedRange", { priorities: [], bhk: null, city: null }],
    ["unknown top-level field", { ...EMPTY_BODY, extra: 1 }],
    [
      "unknown priority key",
      { ...EMPTY_BODY, priorities: ["not_a_real_priority"] },
    ],
    [
      "too many priorities",
      {
        ...EMPTY_BODY,
        priorities: [
          "family_space",
          "location",
          "possession_speed",
          "amenities",
        ],
      },
    ],
    ["empty-string bhk", { ...EMPTY_BODY, bhk: "" }],
    ["non-string bhk", { ...EMPTY_BODY, bhk: 5 }],
    ["empty-string city", { ...EMPTY_BODY, city: "" }],
    [
      "statedRange with an unknown field",
      { ...EMPTY_BODY, statedRange: { fromLakh: 50, toLakh: 150, extra: 1 } },
    ],
    [
      "statedRange below the minimum",
      { ...EMPTY_BODY, statedRange: { fromLakh: 0, toLakh: 150 } },
    ],
    [
      "statedRange above the maximum",
      { ...EMPTY_BODY, statedRange: { fromLakh: 50, toLakh: 5000 } },
    ],
    [
      "statedRange with fromLakh > toLakh",
      { ...EMPTY_BODY, statedRange: { fromLakh: 150, toLakh: 50 } },
    ],
    [
      "statedRange that is not an object",
      { ...EMPTY_BODY, statedRange: "50-150" },
    ],
    ["non-object body", "abc"],
    ["array body", []],
    ["null body", null],
  ])("rejects %s", (_label, body) => {
    expect(parseIntakeHandoffBody(body).ok).toBe(false);
  });
});
