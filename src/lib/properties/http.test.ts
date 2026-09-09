import { describe, expect, it } from "vitest";
import {
  DOSSIER_CACHE_CONTROL,
  ERROR_CACHE_CONTROL,
  LIST_CACHE_CONTROL,
  buyerJsonResponse,
  errorResponse,
  parseListParams,
  type ApiErrorBody,
} from "./http";
import { propertyListFixture, richDossierFixture } from "./fixtures";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./types";

/**
 * The parameter contract and the response envelope, tested without a database.
 * The database-backed wire behaviour of the two routes themselves lives in
 * `src/app/api/v1/properties/routes.integration.test.ts`.
 */

const parse = (query: string) => parseListParams(new URLSearchParams(query));

const expectFailure = (query: string) => {
  const result = parse(query);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected a parse failure");
  return result;
};

const expectParams = (query: string) => {
  const result = parse(query);
  if (!result.ok) {
    throw new Error(`expected a parse success, got: ${result.message}`);
  }
  return result.params;
};

describe("parseListParams — defaults", () => {
  it("applies the documented defaults when no parameters are given", () => {
    expect(expectParams("")).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      sort: "newest",
    });
  });

  it("omits absent filters rather than passing undefined keys through", () => {
    const params = expectParams("");
    expect(Object.keys(params).sort()).toEqual(["page", "pageSize", "sort"]);
  });
});

describe("parseListParams — accepted values", () => {
  it("coerces and carries the full filter set", () => {
    expect(
      expectParams(
        "page=3&pageSize=10&city=Ahmedabad&locality=Bodakdev" +
          "&propertyType=apartment&bhk=2bhk&possessionStatus=ready_to_move" +
          "&amenity=clubhouse&amenity=gym&sort=name",
      ),
    ).toEqual({
      page: 3,
      pageSize: 10,
      city: "Ahmedabad",
      locality: "Bodakdev",
      propertyType: "apartment",
      bhk: "2bhk",
      possessionStatus: "ready_to_move",
      amenity: ["clubhouse", "gym"],
      sort: "name",
    });
  });

  it("accepts every possession status the enum defines", () => {
    for (const status of [
      "under_construction",
      "ready_to_move",
      "nearing_possession",
    ]) {
      expect(expectParams(`possessionStatus=${status}`).possessionStatus).toBe(
        status,
      );
    }
  });

  it("accepts the maximum page size at the boundary", () => {
    expect(expectParams(`pageSize=${MAX_PAGE_SIZE}`).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
  });

  it("collapses a repeated amenity, since repeating it narrows nothing", () => {
    expect(expectParams("amenity=gym&amenity=gym").amenity).toEqual(["gym"]);
  });

  it("passes an unknown lookup key through — it is a valid query with no matches", () => {
    // The contract's central distinction: an unknown `propertyType`, `bhk`, or
    // `amenity` key is answered with an empty result set, not a 422.
    expect(expectParams("propertyType=nonsense").propertyType).toBe("nonsense");
    expect(expectParams("bhk=99bhk").bhk).toBe("99bhk");
    expect(expectParams("amenity=helipad").amenity).toEqual(["helipad"]);
  });
});

describe("parseListParams — rejected values", () => {
  it("rejects an unknown query parameter", () => {
    const failure = expectFailure("minPrice=5000000");
    expect(failure.code).toBe("unknown_query_parameter");
    expect(failure.message).toContain("minPrice");
  });

  it("rejects a non-repeatable parameter given more than once", () => {
    const failure = expectFailure("city=Ahmedabad&city=Surat");
    expect(failure.code).toBe("invalid_query_parameter");
    expect(failure.message).toContain("city");
  });

  it.each([
    "page=0",
    "page=abc",
    "page=-1",
    "page=1.5",
    "page=1e2",
    "page=%201",
  ])("rejects a malformed page (%s)", (query) => {
    const failure = expectFailure(query);
    expect(failure.code).toBe("invalid_query_parameter");
    expect(failure.message).toContain("page");
  });

  it("rejects a page size above the maximum rather than clamping it", () => {
    const failure = expectFailure("pageSize=999");
    expect(failure.code).toBe("invalid_query_parameter");
    expect(failure.message).toContain("pageSize");
    // The point of the assertion: no successful parse ever silently caps.
    expect(failure.message).toContain(String(MAX_PAGE_SIZE));
  });

  it("rejects a zero page size", () => {
    expect(expectFailure("pageSize=0").code).toBe("invalid_query_parameter");
  });

  it("rejects an undefined possession status", () => {
    const failure = expectFailure("possessionStatus=foo");
    expect(failure.code).toBe("invalid_query_parameter");
    expect(failure.message).toContain("possessionStatus");
  });

  it("rejects a sort the contract does not define, including a price sort", () => {
    expect(expectFailure("sort=price").message).toContain("sort");
    expect(expectFailure("sort=relevance").code).toBe(
      "invalid_query_parameter",
    );
  });

  it.each(["city=", "locality=", "propertyType=", "bhk=", "amenity="])(
    "rejects an empty value (%s) instead of treating it as absent",
    (query) => {
      expect(expectFailure(query).code).toBe("invalid_query_parameter");
    },
  );

  it("truncates an absurdly long value rather than echoing it whole", () => {
    const failure = expectFailure(`page=${"9".repeat(500)}`);
    expect(failure.message.length).toBeLessThan(200);
    expect(failure.message).toContain("…");
  });
});

describe("response builders", () => {
  it("serves a listing with the shared-cache policy and the contract envelope", async () => {
    const response = buyerJsonResponse(propertyListFixture, LIST_CACHE_CONTROL);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(LIST_CACHE_CONTROL);
    expect(await response.json()).toEqual(propertyListFixture);
  });

  it("serves a dossier with the longer shared-cache window", () => {
    const response = buyerJsonResponse(
      richDossierFixture,
      DOSSIER_CACHE_CONTROL,
    );
    expect(response.headers.get("Cache-Control")).toBe(DOSSIER_CACHE_CONTROL);
  });

  it("refuses to serve a body carrying excluded data", () => {
    // A guard that cannot fail proves nothing, so the leak is planted rather
    // than assumed absent: this is the last point at which a price introduced
    // by a careless `select()` could still be stopped.
    const leaked = {
      ...richDossierFixture,
      unitVariants: richDossierFixture.unitVariants.map((variant) => ({
        ...variant,
        priceInr: "9500000",
      })),
    };
    expect(() => buyerJsonResponse(leaked, DOSSIER_CACHE_CONTROL)).toThrow(
      /priceInr/,
    );
  });

  it("never caches an error, so a 404 cannot outlive the publish that fixes it", async () => {
    const response = errorResponse(
      404,
      "property_not_found",
      "No published property matches that slug.",
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);
    expect(await response.json()).toEqual({
      error: {
        code: "property_not_found",
        message: "No published property matches that slug.",
      },
    } satisfies ApiErrorBody);
  });
});
