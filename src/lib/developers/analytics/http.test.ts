import { describe, expect, it } from "vitest";
import { developerJsonResponse, parseReportQuery } from "./http";

const query = (qs: string, allowProperty = false) =>
  parseReportQuery(new URLSearchParams(qs), { allowProperty });

const ID = "11111111-1111-1111-1111-111111111111";

describe("developer analytics query", () => {
  it("defaults to the last 30 days", () => {
    expect(query("")).toEqual({
      ok: true,
      query: { window: "30d", property: null },
    });
  });

  it("takes one of the five windows", () => {
    expect(query("window=12m")).toMatchObject({
      ok: true,
      query: { window: "12m" },
    });
  });

  it("refuses an unknown window, so there is no custom range", () => {
    expect(query("window=90d")).toMatchObject({
      ok: false,
      code: "invalid_query_parameter",
    });
    expect(query("from=2026-01-01&to=2026-02-01")).toMatchObject({
      ok: false,
      code: "unknown_query_parameter",
    });
  });

  it("refuses a developer id from the caller", () => {
    expect(query(`developerId=${ID}`)).toMatchObject({
      ok: false,
      code: "unknown_query_parameter",
    });
  });

  it("takes property only where the route allows it, and only as an id", () => {
    expect(query(`property=${ID}`)).toMatchObject({
      ok: false,
      code: "unknown_query_parameter",
    });
    expect(query(`property=${ID}`, true)).toMatchObject({
      ok: true,
      query: { property: ID },
    });
    expect(query("property=not-an-id", true)).toMatchObject({
      ok: false,
      code: "invalid_query_parameter",
    });
  });

  it("answers uncached and private, and refuses a price key", () => {
    const response = developerJsonResponse({
      visitors: { released: true, value: 8 },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(() => developerJsonResponse({ priceInr: 1 })).toThrow();
  });
});
