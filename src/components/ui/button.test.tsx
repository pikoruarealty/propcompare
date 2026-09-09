import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

/**
 * Smoke test for the jsdom Vitest project — proves React components render and
 * Testing Library matchers work. Substantive buyer-component behavior is
 * covered by the components built in later Phase 2B steps.
 */
describe("Button", () => {
  it("renders its children", () => {
    render(<Button>View dossier</Button>);

    expect(
      screen.getByRole("button", { name: "View dossier" }),
    ).toBeInTheDocument();
  });

  it("applies the requested variant", () => {
    render(<Button variant="secondary">Compare</Button>);

    expect(screen.getByRole("button", { name: "Compare" })).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });
});
