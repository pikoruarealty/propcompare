import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FilterOptions } from "@/lib/properties/filter-options";
import {
  DEFAULT_SORT,
  type ListPropertiesParams,
} from "@/lib/properties/types";
import { ActiveFilterChips, BrowseFilters } from "./browse-filters";

/**
 * The filter form is a plain `GET` form with no client state, so what it
 * submits *is* its behaviour. These tests assert the submitted query rather
 * than any internal state: the controls reflect the URL that produced them,
 * and applying a filter starts a new search rather than carrying a stale
 * offset into a result set that no longer exists.
 */

const options: FilterOptions = {
  cities: ["Ahmedabad", "Surat"],
  localities: ["Bodakdev", "Vastrapur"],
  propertyTypes: [
    { key: "apartment", label: "Apartment" },
    { key: "villa", label: "Villa" },
  ],
  bhkTypes: [
    { key: "2bhk", label: "2 BHK" },
    { key: "3bhk", label: "3 BHK" },
  ],
  amenities: [
    { key: "clubhouse", label: "Clubhouse" },
    { key: "gym", label: "Gym" },
  ],
};

const baseParams: ListPropertiesParams = {
  page: 1,
  pageSize: 20,
  sort: DEFAULT_SORT,
};

const renderFilters = (params: ListPropertiesParams) => {
  const view = render(<BrowseFilters params={params} options={options} />);
  const form = view.container.querySelector<HTMLFormElement>(
    '[data-slot="browse-filters"]',
  );
  if (form === null) throw new Error("BrowseFilters rendered nothing");
  return { ...view, form };
};

describe("BrowseFilters — the form itself", () => {
  it("submits to the browse route as a GET, so a filtered view has an address", () => {
    const { form } = renderFilters(baseParams);

    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/properties");
  });

  it("carries no page field, so applying a filter starts at page 1", () => {
    const { form } = renderFilters({ ...baseParams, page: 6 });

    expect(form.querySelector('[name="page"]')).toBeNull();
  });

  it("preserves a non-default page size without asking the buyer about it", () => {
    const { form } = renderFilters({ ...baseParams, pageSize: 50 });
    const field = form.querySelector<HTMLInputElement>('[name="pageSize"]');

    expect(field?.type).toBe("hidden");
    expect(field?.value).toBe("50");
  });

  it("does not carry a page size that only restates the default", () => {
    const { form } = renderFilters(baseParams);

    expect(form.querySelector('[name="pageSize"]')).toBeNull();
  });
});

describe("BrowseFilters — options and current state", () => {
  it("offers only vocabularies drawn from published data", () => {
    renderFilters(baseParams);
    const city = screen.getByLabelText<HTMLSelectElement>("City");

    expect([...city.options].map((option) => option.value)).toEqual([
      "",
      "Ahmedabad",
      "Surat",
    ]);
  });

  it("offers a lookup's label while submitting its key", () => {
    renderFilters(baseParams);
    const bhk = screen.getByLabelText<HTMLSelectElement>("Configuration");
    const option = [...bhk.options].find((entry) => entry.value === "2bhk");

    expect(option?.textContent).toBe("2 BHK");
  });

  it("shows the filters the URL actually applied", () => {
    renderFilters({
      ...baseParams,
      city: "Surat",
      propertyType: "villa",
      possessionStatus: "ready_to_move",
      sort: "name",
    });

    expect(screen.getByLabelText<HTMLSelectElement>("City").value).toBe(
      "Surat",
    );
    expect(
      screen.getByLabelText<HTMLSelectElement>("Property type").value,
    ).toBe("villa");
    expect(screen.getByLabelText<HTMLSelectElement>("Possession").value).toBe(
      "ready_to_move",
    );
    expect(screen.getByLabelText<HTMLSelectElement>("Sort by").value).toBe(
      "name",
    );
  });

  it("shows an unset filter as the any option rather than a guess", () => {
    renderFilters(baseParams);

    expect(screen.getByLabelText<HTMLSelectElement>("City").value).toBe("");
    expect(screen.getByLabelText<HTMLSelectElement>("Locality").value).toBe("");
  });

  it("checks the amenities already applied and no others", () => {
    renderFilters({ ...baseParams, amenity: ["gym"] });

    expect(screen.getByLabelText<HTMLInputElement>("Gym").checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("Clubhouse").checked).toBe(
      false,
    );
  });

  it("says that selecting several amenities narrows rather than widens", () => {
    // The filter is AND. A control that reads as OR misreports how small the
    // result set is about to become.
    const { form } = renderFilters(baseParams);

    expect(form).toHaveTextContent("all of them");
  });

  it("omits the amenity control entirely when nothing publishes one", () => {
    const view = render(
      <BrowseFilters
        params={baseParams}
        options={{ ...options, amenities: [] }}
      />,
    );

    expect(view.container.querySelector("fieldset")).toBeNull();
  });
});

describe("ActiveFilterChips", () => {
  const filtered: ListPropertiesParams = {
    ...baseParams,
    page: 3,
    city: "Ahmedabad",
    bhk: "3bhk",
    amenity: ["clubhouse", "gym"],
  };

  const renderChips = (params: ListPropertiesParams) => {
    const view = render(
      <ActiveFilterChips params={params} options={options} />,
    );
    return {
      ...view,
      chips: [
        ...view.container.querySelectorAll<HTMLAnchorElement>(
          '[data-slot="active-filter"]',
        ),
      ],
    };
  };

  it("renders nothing when no filter is applied", () => {
    const { container } = renderChips(baseParams);

    expect(container).toBeEmptyDOMElement();
  });

  it("names each applied filter in the buyer's language, not in lookup keys", () => {
    const { chips } = renderChips(filtered);

    expect(chips.map((chip) => chip.textContent)).toEqual([
      "City:AhmedabadRemove this filter",
      "Configuration:3 BHKRemove this filter",
      "Amenity:ClubhouseRemove this filter",
      "Amenity:GymRemove this filter",
    ]);
  });

  it("shows a key the vocabulary does not know rather than hiding the filter", () => {
    // A filter narrowing the results while being invisible would leave the
    // buyer unable to explain, or undo, a short result set.
    const { chips } = renderChips({ ...baseParams, bhk: "9bhk" });

    expect(chips[0]).toHaveTextContent("9bhk");
  });

  it("lifts exactly one filter per chip and returns to page 1", () => {
    const { chips } = renderChips(filtered);
    const query = new URL(chips[1]!.getAttribute("href")!, "http://localhost")
      .searchParams;

    expect(query.has("bhk")).toBe(false);
    expect(query.get("city")).toBe("Ahmedabad");
    expect(query.getAll("amenity")).toEqual(["clubhouse", "gym"]);
    expect(query.has("page")).toBe(false);
  });

  it("removes only the amenity named on the chip", () => {
    const { chips } = renderChips(filtered);
    const query = new URL(chips[2]!.getAttribute("href")!, "http://localhost")
      .searchParams;

    expect(query.getAll("amenity")).toEqual(["gym"]);
  });

  it("offers a way out of every filter at once", () => {
    const { container } = renderChips(filtered);
    const clear = container.querySelector('[data-slot="clear-filters"]');

    expect(clear).toHaveAttribute("href", "/properties");
  });
});
