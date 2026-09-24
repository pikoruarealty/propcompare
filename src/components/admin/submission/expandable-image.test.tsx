import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExpandableImage } from "./expandable-image";

describe("ExpandableImage", () => {
  it("opens the picture full size, from the larger source when there is one", async () => {
    render(
      <ExpandableImage
        src="/thumb.webp"
        fullSrc="/full.webp"
        alt="A floor plan"
        title="Block A floor plan"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Open full size: Block A floor plan",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Block A floor plan");
    expect(dialog.querySelector("img")).toHaveAttribute("src", "/full.webp");
  });

  it("falls back to the card's own picture, and closes", async () => {
    render(<ExpandableImage src="/only.webp" alt="x" title="Photo" />);
    await userEvent.click(
      screen.getByRole("button", { name: /open full size/i }),
    );
    expect(
      (await screen.findByRole("dialog")).querySelector("img"),
    ).toHaveAttribute("src", "/only.webp");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
