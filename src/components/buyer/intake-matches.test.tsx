import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyPropertyListFixture,
  propertyListFixture,
} from "@/lib/properties/fixtures";
import { RANGE_MAX_LAKH, type StatedRange } from "@/lib/properties/intake";
import { findForbiddenKeys } from "@/lib/properties/no-price";
import type { PropertyListResult } from "@/lib/properties/types";
import { IntakeMatchResults, type MatchViewState } from "./intake-matches";

/**
 * The matched-results panel, driven entirely from fixtures.
 *
 * The states that matter most are the two that are easy to conflate: nothing
 * matched, and the search did not run. The catalog being empty is a claim about
 * the world, and a failed request is not evidence for it.
 */

const range: StatedRange = { fromLakh: 50, toLakh: 150 };

const renderPanel = (
  state: MatchViewState,
  statedRange: StatedRange = range,
) => {
  const onPage = vi.fn();
  render(
    <IntakeMatchResults state={state} range={statedRange} onPage={onPage} />,
  );
  return onPage;
};

const ready = (result: PropertyListResult): MatchViewState => ({
  status: "ready",
  result,
});

describe("IntakeMatchResults — states", () => {
  it("renders nothing before the buyer has asked for matches", () => {
    const { container } = render(
      <IntakeMatchResults
        state={{ status: "idle" }}
        range={range}
        onPage={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("announces that it is working rather than showing an empty grid", () => {
    renderPanel({ status: "loading" });

    expect(screen.getByRole("status")).toHaveTextContent(
      /Finding what matches/,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders a card for every matched property", () => {
    renderPanel(ready(propertyListFixture));

    expect(screen.getAllByRole("listitem")).toHaveLength(
      propertyListFixture.data.length,
    );
    expect(
      screen.getByRole("heading", { name: propertyListFixture.data[0].name }),
    ).toBeVisible();
  });

  it("distinguishes nothing matching from the search failing", () => {
    renderPanel(ready(emptyPropertyListFixture));

    expect(
      screen.getByText(/Nothing published matches that yet/),
    ).toBeVisible();
    // The brief is retained and nothing is substituted — the buyer flow's
    // "No matching inventory" exception path.
    expect(
      screen.getByText(/nothing has been substituted for it/),
    ).toBeVisible();
    expect(screen.queryByText(/did not run/)).not.toBeInTheDocument();
  });

  it("says a failed search failed, never that the catalog is empty", () => {
    renderPanel({ status: "failed", message: "Try again." });

    expect(screen.getByText("That search did not run")).toBeVisible();
    expect(
      screen.queryByText(/Nothing published matches/),
    ).not.toBeInTheDocument();
  });

  it("offers the whole catalog as a way out of both dead ends", () => {
    renderPanel(ready(emptyPropertyListFixture));
    expect(
      screen.getByRole("link", { name: "Browse the whole catalog" }),
    ).toHaveAttribute("href", "/properties");
  });
});

describe("IntakeMatchResults — what it tells the buyer about the search", () => {
  it("restates the stated range and discloses the ±20% expansion", () => {
    renderPanel(ready(propertyListFixture));

    // Without this, a result the buyer reads as dearer than their stated figure
    // looks like a broken filter rather than a deliberate product rule.
    expect(screen.getByText(/You said ₹50 lakh to ₹1.5 crore/)).toBeVisible();
    expect(screen.getByText(/₹40 lakh to ₹1.8 crore/)).toBeVisible();
  });

  it("discloses the ceiling when the buyer left the top end open", () => {
    renderPanel(ready(propertyListFixture), {
      fromLakh: 100,
      toLakh: RANGE_MAX_LAKH,
    });

    // The slider says "or more"; `maxInr` is a required finite number. The gap
    // is disclosed rather than allowed to truncate silently, and the ceiling it
    // names is the same one the searched span above it reports.
    const disclosure = screen.getByText(/You left the top end open/);
    expect(disclosure).toBeVisible();
    expect(disclosure).toHaveTextContent("₹6 crore");
    expect(screen.getByText(/₹80 lakh to ₹6 crore/)).toBeVisible();
  });

  it("makes no ceiling claim when the top end is not open", () => {
    renderPanel(ready(propertyListFixture));

    expect(
      screen.queryByText(/You left the top end open/),
    ).not.toBeInTheDocument();
  });

  it("counts the results honestly", () => {
    renderPanel(ready(propertyListFixture));
    expect(screen.getByText(/Showing/)).toHaveTextContent(
      "Showing 1–2 of 2 properties",
    );
  });

  it("gives the empty case the explanation rather than a bare zero", () => {
    // "No properties" would be true and useless. The empty state says what is
    // still applied and what the buyer can do about it.
    renderPanel(ready(emptyPropertyListFixture));

    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nothing published matches that yet/),
    ).toBeVisible();
  });
});

describe("IntakeMatchResults — paging", () => {
  const paged: PropertyListResult = {
    data: propertyListFixture.data,
    pagination: { page: 2, pageSize: 2, total: 6, totalPages: 3 },
  };

  it("asks for the next and previous page by number", async () => {
    const user = userEvent.setup();
    const onPage = renderPanel(ready(paged));

    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPage).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole("button", { name: /Previous/ }));
    expect(onPage).toHaveBeenCalledWith(1);
  });

  it("offers no pagination for a single page", () => {
    renderPanel(ready(propertyListFixture));
    expect(
      screen.queryByRole("navigation", { name: "Match pagination" }),
    ).not.toBeInTheDocument();
  });

  it("renders an unavailable direction as inert rather than as a control", () => {
    renderPanel(
      ready({
        data: propertyListFixture.data,
        pagination: { page: 1, pageSize: 2, total: 4, totalPages: 2 },
      }),
    );

    // There is no page 0; a control offering one would be a control that lies.
    expect(
      screen.queryByRole("button", { name: /Previous/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Previous")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("IntakeMatchResults — price restraint", () => {
  it("renders no price, bound, or bucket value from the result", () => {
    renderPanel(ready(propertyListFixture));

    // The guard that protects the API response, applied to what the screen was
    // given: a summary carrying a price must never have reached this component.
    expect(findForbiddenKeys(propertyListFixture)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/per sq|bucket/i);
  });
});
