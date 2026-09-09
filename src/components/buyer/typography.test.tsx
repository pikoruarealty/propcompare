import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BodyText, DisplayHeading, Eyebrow, TabularValue } from "./typography";

/**
 * The typeface roles from `docs/design/design-tokens.md`: Cormorant Garamond
 * carries display text, Plus Jakarta Sans carries UI and data, and numeric
 * data opts into tabular numerals.
 *
 * jsdom applies no stylesheet, so these assert the binding — the class that
 * selects the face — rather than a computed font. The CSS behind the class is
 * locked separately in `src/app/design-tokens.test.ts`.
 */

describe("DisplayHeading", () => {
  it("renders the serif display face", () => {
    render(<DisplayHeading level={1}>Riverside Residency</DisplayHeading>);

    const heading = screen.getByRole("heading", {
      name: "Riverside Residency",
      level: 1,
    });
    expect(heading.className).toContain("font-display");
    expect(heading).toHaveAttribute("data-typography", "display");
  });

  it.each([1, 2, 3] as const)(
    "renders level %i as its own heading tag",
    (level) => {
      render(<DisplayHeading level={level}>Section</DisplayHeading>);

      expect(
        screen.getByRole("heading", { name: "Section", level }),
      ).toBeInTheDocument();
    },
  );

  it("defaults to a level 2 heading", () => {
    render(<DisplayHeading>Unit variants</DisplayHeading>);

    expect(
      screen.getByRole("heading", { name: "Unit variants", level: 2 }),
    ).toBeInTheDocument();
  });
});

describe("BodyText and Eyebrow", () => {
  it("renders body copy as a paragraph", () => {
    render(<BodyText>Reviewed before publication.</BodyText>);

    const paragraph = screen.getByText("Reviewed before publication.");
    expect(paragraph.tagName).toBe("P");
    expect(paragraph).toHaveAttribute("data-typography", "body");
  });

  it("renders an eyebrow label", () => {
    render(<Eyebrow>Possession</Eyebrow>);

    expect(screen.getByText("Possession")).toHaveAttribute(
      "data-typography",
      "eyebrow",
    );
  });
});

describe("TabularValue", () => {
  it("opts numeric data into tabular numerals", () => {
    // Areas only line up in a column if every one of them carries this.
    render(<TabularValue>1,450</TabularValue>);

    expect(screen.getByText("1,450").className).toContain("data-tabular");
  });

  it("keeps caller classes alongside the tabular treatment", () => {
    render(<TabularValue className="text-muted-foreground">12</TabularValue>);

    const value = screen.getByText("12");
    expect(value.className).toContain("data-tabular");
    expect(value.className).toContain("text-muted-foreground");
  });
});
