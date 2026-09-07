import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER_OPTIONS } from "@/lib/properties/filter-options";
import {
  emptyPropertyListFixture,
  propertyListFixture,
  richSummaryFixture,
} from "@/lib/properties/fixtures";
import type { FilterOptions } from "@/lib/properties/filter-options";
import {
  DEFAULT_SORT,
  type ListPropertiesParams,
  type PropertyListResult,
} from "@/lib/properties/types";
import { BrowseScreen } from "./browse-screen";

/**
 * The browse screen as a whole: the grid, both of its empty states, its
 * pagination, and what it does with a query string the contract rejects.
 *
 * The screen is a pure function of its parameters, options, and result, which
 * is what lets all of this run against the step 2 fixtures with no database —
 * including the states a database is least likely to produce on demand, like
 * a filtered search that matches nothing.
 */

const options: FilterOptions = {
  cities: ["Ahmedabad"],
  localities: ["Bodakdev", "Vastrapur"],
  propertyTypes: [{ key: "apartment", label: "Apartment" }],
  bhkTypes: [
    { key: "2bhk", label: "2 BHK" },
    { key: "3bhk", label: "3 BHK" },
  ],
  amenities: [{ key: "clubhouse", label: "Clubhouse" }],
};

const baseParams: ListPropertiesParams = {
  page: 1,
  pageSize: 20,
  sort: DEFAULT_SORT,
};

const paged = (
  page: number,
  totalPages: number,
  total: number,
): PropertyListResult => ({
  data: propertyListFixture.data,
  pagination: { page, pageSize: 20, total, totalPages },
});

const renderScreen = (props: Partial<Parameters<typeof BrowseScreen>[0]>) =>
  render(
    <BrowseScreen
      params={baseParams}
      options={options}
      result={propertyListFixture}
      {...props}
    />,
  );

describe("BrowseScreen — results", () => {
  it("renders one card per published property", () => {
    const { container } = renderScreen({});
    const cards = container.querySelectorAll('[data-slot="property-card"]');

    expect(cards).toHaveLength(propertyListFixture.data.length);
    expect(screen.getByText("Riverfront Heights")).toBeInTheDocument();
    expect(screen.getByText("Anand Niketan Residency")).toBeInTheDocument();
  });

  it("sits inside the buyer shell rather than reinventing page chrome", () => {
    renderScreen({});

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("says how much of the result set is on screen", () => {
    const { container } = renderScreen({ result: paged(2, 3, 42) });

    expect(
      container.querySelector('[data-slot="result-summary"]'),
    ).toHaveTextContent("Showing 21–22 of 42 properties");
  });

  it("counts a single property in the singular", () => {
    const { container } = renderScreen({
      result: {
        data: [richSummaryFixture],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
    });

    expect(
      container.querySelector('[data-slot="result-summary"]'),
    ).toHaveTextContent("of 1 property");
  });

  it("shows no price value anywhere on the screen", () => {
    // The screen does say the word "price", in the sentence explaining that it
    // publishes none — which is the point. What must never appear is a price
    // *value*, so this looks for the markers one would arrive with.
    const { container } = renderScreen({});
    const text = (container.textContent ?? "").toLowerCase();

    for (const forbidden of [
      "₹",
      "inr",
      "rs.",
      "crore",
      "lakh",
      "per sq",
      "psf",
      "onwards",
      "starting at",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("BrowseScreen — nothing to show", () => {
  it("says the catalog is empty when no filter was applied", () => {
    const { container } = renderScreen({ result: emptyPropertyListFixture });
    const empty = container.querySelector('[data-slot="browse-empty"]');

    expect(empty).toHaveAttribute("data-empty-reason", "catalog-empty");
    expect(empty).toHaveTextContent("No properties published yet");
  });

  it("does not tell someone to remove a filter they never applied", () => {
    const { container } = renderScreen({ result: emptyPropertyListFixture });

    expect(
      container.querySelector('[data-slot="browse-empty"]'),
    ).not.toHaveTextContent("Remove one");
  });

  it("retains the filters when a search matches nothing", () => {
    // The buyer flow is explicit: with no matching inventory, retain the
    // filters and offer refinement rather than fabricate a match.
    const params: ListPropertiesParams = {
      ...baseParams,
      city: "Ahmedabad",
      bhk: "3bhk",
    };
    const { container } = renderScreen({
      params,
      result: emptyPropertyListFixture,
    });

    const empty = container.querySelector('[data-slot="browse-empty"]');
    expect(empty).toHaveAttribute("data-empty-reason", "no-match");

    const chips = container.querySelectorAll('[data-slot="active-filter"]');
    expect(
      [...chips].map((chip) => chip.getAttribute("data-filter-name")),
    ).toEqual(["city", "bhk"]);
  });

  it("substitutes nothing for the properties it could not find", () => {
    const { container } = renderScreen({
      params: { ...baseParams, city: "Ahmedabad" },
      result: emptyPropertyListFixture,
    });

    expect(
      container.querySelectorAll('[data-slot="property-card"]'),
    ).toHaveLength(0);
    expect(container.textContent).not.toContain("Similar");
  });

  it("offers a way to start again", () => {
    const { container } = renderScreen({
      params: { ...baseParams, city: "Ahmedabad" },
      result: emptyPropertyListFixture,
    });

    for (const link of container.querySelectorAll(
      '[data-slot="clear-filters"]',
    )) {
      expect(link).toHaveAttribute("href", "/properties");
    }
  });
});

describe("BrowseScreen — pagination", () => {
  it("shows no pagination when everything fits on one page", () => {
    const { container } = renderScreen({});

    expect(
      container.querySelector('[data-slot="browse-pagination"]'),
    ).toBeNull();
  });

  it("reports which page of how many the buyer is on", () => {
    const { container } = renderScreen({ result: paged(2, 3, 42) });

    expect(
      container.querySelector('[data-slot="browse-pagination"]'),
    ).toHaveTextContent("Page 2 of 3");
  });

  it("links forward and back, carrying the filters along", () => {
    const params: ListPropertiesParams = {
      ...baseParams,
      page: 2,
      city: "Ahmedabad",
    };
    renderScreen({ params, result: paged(2, 3, 42) });

    expect(screen.getByRole("link", { name: /previous/i })).toHaveAttribute(
      "href",
      "/properties?city=Ahmedabad",
    );
    expect(screen.getByRole("link", { name: /next/i })).toHaveAttribute(
      "href",
      "/properties?page=3&city=Ahmedabad",
    );
  });

  it("does not offer a page that does not exist", () => {
    // There is no page 0 and no page 4 of 3. An inert control is honest; a link
    // to nowhere is not.
    const { container } = renderScreen({ result: paged(1, 3, 42) });
    const nav = container.querySelector<HTMLElement>(
      '[data-slot="browse-pagination"]',
    )!;

    expect(within(nav).queryByRole("link", { name: /previous/i })).toBeNull();
    expect(nav.querySelector('[aria-disabled="true"]')).toHaveTextContent(
      "Previous",
    );

    const last = renderScreen({ result: paged(3, 3, 42) });
    const lastNav = last.container.querySelectorAll<HTMLElement>(
      '[data-slot="browse-pagination"]',
    )[0]!;
    expect(within(lastNav).queryByRole("link", { name: /next/i })).toBeNull();
  });
});

describe("BrowseScreen — a query the contract rejects", () => {
  const message = 'possessionStatus must be one of …; received "foo".';

  it("explains the rejection instead of failing the page", () => {
    // A buyer following a stale or hand-edited link should land on a browsable
    // catalog with an explanation, not on an error body.
    const { container } = renderScreen({ invalidQueryMessage: message });
    const notice = container.querySelector(
      '[data-slot="invalid-query-notice"]',
    );

    expect(notice).toHaveTextContent("could not be applied");
    expect(notice).toHaveTextContent(message);
  });

  it("says plainly that what is shown is unfiltered", () => {
    const { container } = renderScreen({ invalidQueryMessage: message });

    expect(
      container.querySelector('[data-slot="invalid-query-notice"]'),
    ).toHaveTextContent("every published property is shown instead");
  });

  it("shows no notice when the query was fine", () => {
    const { container } = renderScreen({});

    expect(
      container.querySelector('[data-slot="invalid-query-notice"]'),
    ).toBeNull();
  });
});

describe("BrowseScreen — an empty catalog", () => {
  it("renders with no filter vocabularies at all", () => {
    const { container } = renderScreen({
      options: EMPTY_FILTER_OPTIONS,
      result: emptyPropertyListFixture,
    });

    expect(
      container.querySelector('[data-slot="browse-filters"]'),
    ).not.toBeNull();
    expect(container.querySelector("fieldset")).toBeNull();
  });
});
