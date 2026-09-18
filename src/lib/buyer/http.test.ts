import { describe, expect, it } from "vitest";
import {
  parseComparisonBody,
  parseEnquiryBody,
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
