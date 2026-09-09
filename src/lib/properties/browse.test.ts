import { describe, expect, it } from "vitest";
import {
  BROWSE_PATH,
  activeFilters,
  browseHref,
  canonicalSearch,
  formatPossessionDate,
  hrefForPage,
  hrefForParams,
  hrefForSort,
  hrefWithoutFilter,
  hrefWithoutFilters,
  propertyDossierHref,
  toSearchParams,
} from "./browse";
import { parseListParams } from "./http";
import { DEFAULT_SORT, type ListPropertiesParams } from "./types";

/**
 * The browse screen navigates entirely by URL: its filter form writes one, and
 * every chip, sort control, and pagination link is one. So these are the tests
 * that keep the screen's controls honest — a link that drops a filter, keeps a
 * stale page number, or emits a query the API would reject is a bug the user
 * meets as a wrong result set rather than as an error.
 */

const baseParams: ListPropertiesParams = {
  page: 1,
  pageSize: 20,
  sort: DEFAULT_SORT,
};

const queryOf = (href: string): URLSearchParams =>
  new URL(href, "http://localhost").searchParams;

describe("formatPossessionDate", () => {
  it("renders a published date exactly as published", () => {
    expect(formatPossessionDate("2027-06-30")).toBe("30 June 2027");
  });

  it("does not shift the date across a time zone", () => {
    // `new Date("2027-01-01")` is UTC midnight, which is 31 December 2026 for
    // any reader west of Greenwich. A possession date is a plain calendar date
    // and must render as the day the catalog recorded, everywhere.
    expect(formatPossessionDate("2027-01-01")).toBe("1 January 2027");
    expect(formatPossessionDate("2026-12-31")).toBe("31 December 2026");
  });

  it("returns null for an absent date rather than inventing one", () => {
    expect(formatPossessionDate(null)).toBeNull();
  });

  it.each(["", "2027-6-30", "30-06-2027", "2027-13-01", "2027-06-00", "soon"])(
    "returns null for the unparseable value %p",
    (value) => {
      expect(formatPossessionDate(value)).toBeNull();
    },
  );
});

describe("toSearchParams", () => {
  it("expands a repeated parameter into repeats", () => {
    const search = toSearchParams({ amenity: ["clubhouse", "gym"] });
    expect(search.getAll("amenity")).toEqual(["clubhouse", "gym"]);
  });

  it("keeps a repeated non-repeatable parameter so validation still sees it", () => {
    // The page must be no more permissive than the API. Collapsing this to one
    // value would silently accept a request the route rejects with 422.
    const search = toSearchParams({ city: ["Ahmedabad", "Surat"] });
    const parsed = parseListParams(search);

    expect(parsed.ok).toBe(false);
  });

  it("skips absent parameters", () => {
    const search = toSearchParams({ city: undefined });
    expect(search.has("city")).toBe(false);
  });
});

describe("canonicalSearch", () => {
  it("drops the empty values a GET form emits for an unset select", () => {
    // `<option value="">Any city</option>` submits `?city=`, which the API
    // contract rejects. On the form it means "no filter".
    const search = canonicalSearch(
      new URLSearchParams("city=&locality=&propertyType=&bhk="),
    );

    expect(search.toString()).toBe("");
  });

  it("drops values that only restate a default", () => {
    const search = canonicalSearch(
      new URLSearchParams("page=1&pageSize=20&sort=newest"),
    );

    expect(search.toString()).toBe("");
  });

  it("keeps a non-default page, page size, and sort", () => {
    const search = canonicalSearch(
      new URLSearchParams("page=3&pageSize=50&sort=name"),
    );

    expect(search.get("page")).toBe("3");
    expect(search.get("pageSize")).toBe("50");
    expect(search.get("sort")).toBe("name");
  });

  it("orders parameters by the contract rather than by arrival", () => {
    const search = canonicalSearch(
      new URLSearchParams("sort=name&bhk=2bhk&city=Ahmedabad"),
    );

    expect(search.toString()).toBe("city=Ahmedabad&bhk=2bhk&sort=name");
  });

  it("keeps every amenity, because repeating one narrows the search", () => {
    const search = canonicalSearch(
      new URLSearchParams("amenity=clubhouse&amenity=gym"),
    );

    expect(search.getAll("amenity")).toEqual(["clubhouse", "gym"]);
  });

  it("does not launder a malformed value into a valid one", () => {
    // Canonicalising exists to drop what a form could not help sending. It must
    // not become a way for a broken request to slip past validation.
    const search = canonicalSearch(
      new URLSearchParams("possessionStatus=foo&page=nonsense"),
    );

    expect(search.get("possessionStatus")).toBe("foo");
    expect(search.get("page")).toBe("nonsense");
    expect(parseListParams(search).ok).toBe(false);
  });

  it("preserves an unknown parameter so it is still rejected as unknown", () => {
    const search = canonicalSearch(new URLSearchParams("minPrice=5000000"));

    expect(search.get("minPrice")).toBe("5000000");
    expect(parseListParams(search).ok).toBe(false);
  });

  it("is idempotent, so the page cannot redirect in a loop", () => {
    const once = canonicalSearch(
      new URLSearchParams("city=&sort=newest&page=2&amenity=gym"),
    );
    const twice = canonicalSearch(once);

    expect(twice.toString()).toBe(once.toString());
  });
});

describe("browseHref", () => {
  it("omits the question mark when there is no query", () => {
    expect(browseHref(new URLSearchParams())).toBe(BROWSE_PATH);
  });
});

describe("hrefForParams", () => {
  it("renders the unfiltered default view as the bare path", () => {
    expect(hrefForParams(baseParams)).toBe(BROWSE_PATH);
  });

  it("round-trips through the API's own validator", () => {
    // The strongest guarantee available here: every URL this screen can build
    // is a query the listing contract accepts, and parses back to the same
    // parameters it was built from.
    const params: ListPropertiesParams = {
      page: 3,
      pageSize: 50,
      city: "Ahmedabad",
      locality: "Vastrapur",
      propertyType: "apartment",
      bhk: "3bhk",
      possessionStatus: "ready_to_move",
      amenity: ["clubhouse", "gym"],
      sort: "name",
    };

    const parsed = parseListParams(queryOf(hrefForParams(params)));

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.params).toEqual(params);
  });

  it("round-trips a bare default view too", () => {
    const parsed = parseListParams(queryOf(hrefForParams(baseParams)));

    expect(parsed.ok && parsed.params).toEqual(baseParams);
  });
});

describe("pagination and sort links", () => {
  it("moves to another page and keeps every filter", () => {
    const href = hrefForPage(
      { ...baseParams, city: "Ahmedabad", amenity: ["gym"] },
      4,
    );
    const query = queryOf(href);

    expect(query.get("page")).toBe("4");
    expect(query.get("city")).toBe("Ahmedabad");
    expect(query.getAll("amenity")).toEqual(["gym"]);
  });

  it("returns to page 1 when the sort changes", () => {
    // Page 7 of one ordering is not page 7 of another; holding the offset lands
    // the buyer somewhere they had no reason to expect.
    const href = hrefForSort({ ...baseParams, page: 7 }, "name");
    const query = queryOf(href);

    expect(query.get("sort")).toBe("name");
    expect(query.has("page")).toBe(false);
  });
});

describe("activeFilters", () => {
  it("lists nothing when nothing is filtered", () => {
    expect(activeFilters(baseParams)).toEqual([]);
  });

  it("lists every applied filter, one entry per amenity", () => {
    expect(
      activeFilters({
        ...baseParams,
        city: "Ahmedabad",
        possessionStatus: "ready_to_move",
        amenity: ["clubhouse", "gym"],
      }),
    ).toEqual([
      { name: "city", value: "Ahmedabad" },
      { name: "possessionStatus", value: "ready_to_move" },
      { name: "amenity", value: "clubhouse" },
      { name: "amenity", value: "gym" },
    ]);
  });
});

describe("hrefWithoutFilter", () => {
  const filtered: ListPropertiesParams = {
    ...baseParams,
    page: 5,
    city: "Ahmedabad",
    bhk: "3bhk",
    amenity: ["clubhouse", "gym"],
  };

  it("removes one filter and leaves the rest applied", () => {
    const query = queryOf(
      hrefWithoutFilter(filtered, { name: "bhk", value: "3bhk" }),
    );

    expect(query.has("bhk")).toBe(false);
    expect(query.get("city")).toBe("Ahmedabad");
    expect(query.getAll("amenity")).toEqual(["clubhouse", "gym"]);
  });

  it("removes only the named amenity, not every amenity", () => {
    const query = queryOf(
      hrefWithoutFilter(filtered, { name: "amenity", value: "clubhouse" }),
    );

    expect(query.getAll("amenity")).toEqual(["gym"]);
  });

  it("returns to page 1, because the result set is now larger", () => {
    const query = queryOf(
      hrefWithoutFilter(filtered, { name: "city", value: "Ahmedabad" }),
    );

    expect(query.has("page")).toBe(false);
  });
});

describe("hrefWithoutFilters", () => {
  it("clears every filter but keeps how the buyer wants results ordered", () => {
    const query = queryOf(
      hrefWithoutFilters({
        page: 4,
        pageSize: 50,
        city: "Ahmedabad",
        bhk: "3bhk",
        amenity: ["gym"],
        sort: "name",
      }),
    );

    expect(query.has("city")).toBe(false);
    expect(query.has("bhk")).toBe(false);
    expect(query.has("amenity")).toBe(false);
    expect(query.has("page")).toBe(false);
    expect(query.get("pageSize")).toBe("50");
    expect(query.get("sort")).toBe("name");
  });
});

describe("propertyDossierHref", () => {
  it("points at the property's dossier route", () => {
    expect(propertyDossierHref("riverfront-heights")).toBe(
      "/properties/riverfront-heights",
    );
  });

  it("escapes a slug rather than letting it alter the path", () => {
    expect(propertyDossierHref("a/b")).toBe("/properties/a%2Fb");
  });
});
