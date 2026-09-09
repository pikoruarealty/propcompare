import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EMPTY_FILTER_OPTIONS } from "@/lib/properties/filter-options";
import { IntakeScreen } from "./intake-screen";

/**
 * The `/intake` screen: the buyer shell, the standing explanation, and the
 * flow inside it.
 *
 * The behaviour of the questions themselves lives in `intake-flow.test.tsx`;
 * what is asserted here is that the route the header has linked to since step 3
 * now lands somewhere, inside the same frame as every other buyer screen.
 */

describe("IntakeScreen", () => {
  it("sits inside the buyer page frame", () => {
    const { container } = render(
      <IntakeScreen options={EMPTY_FILTER_OPTIONS} />,
    );

    expect(container.querySelector("header")).toBeInTheDocument();
    expect(container.querySelector("main#main-content")).toBeInTheDocument();
    expect(container.querySelector("footer")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="intake-flow"]'),
    ).toBeInTheDocument();
  });

  it("gives the page one first-level heading", () => {
    render(<IntakeScreen options={EMPTY_FILTER_OPTIONS} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("says up front that nothing is saved or sent", () => {
    render(<IntakeScreen options={EMPTY_FILTER_OPTIONS} />);

    // A buyer asked for a financial range is owed this before the question, not
    // in a footnote after it.
    expect(
      screen.getByText(/Nothing you enter is saved or sent anywhere/),
    ).toBeVisible();
  });

  it("renders no price anywhere on the screen", () => {
    const { container } = render(
      <IntakeScreen options={EMPTY_FILTER_OPTIONS} />,
    );

    expect(container.textContent).not.toMatch(
      /price of|costs? ₹|per sq\.? ?ft/i,
    );
  });
});
