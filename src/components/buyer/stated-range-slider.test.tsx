import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RANGE_MAX_LAKH,
  RANGE_MIN_LAKH,
  RANGE_STEP_LAKH,
  type StatedRange,
} from "@/lib/properties/intake";
import { StatedRangeSlider } from "./stated-range-slider";

/**
 * The two-handle control for the range a buyer states.
 *
 * The assertions here are as much about what the control says as what it does:
 * a slider on a property site reads as a price control unless it is built not
 * to, and this catalog has no price a buyer can ever see.
 */

const value: StatedRange = { fromLakh: 50, toLakh: 150 };

const renderSlider = (range: StatedRange = value) => {
  const onChange = vi.fn();
  render(<StatedRangeSlider value={range} onChange={onChange} />);
  return {
    onChange,
    lower: screen.getByLabelText("Lower end of the range you are working with"),
    upper: screen.getByLabelText("Upper end of the range you are working with"),
  };
};

describe("StatedRangeSlider", () => {
  it("gives each handle its own labelled, keyboard-operable control", () => {
    const { lower, upper } = renderSlider();

    for (const handle of [lower, upper]) {
      expect(handle).toHaveAttribute("type", "range");
      expect(handle).toHaveAttribute("min", String(RANGE_MIN_LAKH));
      expect(handle).toHaveAttribute("max", String(RANGE_MAX_LAKH));
      // A coarse step is what keeps a slider from implying that an exact rupee
      // figure means anything here.
      expect(handle).toHaveAttribute("step", String(RANGE_STEP_LAKH));
    }
  });

  it("reads each handle out in the buyer's own units", () => {
    const { lower, upper } = renderSlider();

    expect(lower).toHaveAttribute("aria-valuetext", "₹50 lakh");
    expect(upper).toHaveAttribute("aria-valuetext", "₹1.5 crore");
    expect(screen.getByText(/₹50 lakh to ₹1\.5 crore/)).toBeInTheDocument();
  });

  it("says the top of the scale is open-ended", () => {
    const { upper } = renderSlider({ fromLakh: 100, toLakh: RANGE_MAX_LAKH });

    expect(upper).toHaveAttribute("aria-valuetext", "₹5 crore or more");
    expect(
      screen.getByText(/₹1 crore to ₹5 crore or more/),
    ).toBeInTheDocument();
  });

  it("reports a moved handle back to its owner", () => {
    const { lower, onChange } = renderSlider();
    fireEvent.change(lower, { target: { value: "80" } });

    expect(onChange).toHaveBeenCalledWith({ fromLakh: 80, toLakh: 150 });
  });

  it("clamps a handle dragged past the other", () => {
    const { lower, onChange } = renderSlider();
    fireEvent.change(lower, { target: { value: "400" } });

    expect(onChange).toHaveBeenCalledWith({ fromLakh: 150, toLakh: 150 });
  });

  it("never labels the range as a price or a cost", () => {
    const { container } = render(
      <StatedRangeSlider value={value} onChange={vi.fn()} />,
    );

    expect(container.textContent).not.toMatch(/price|cost|budget|worth/i);
    // "You said" is the whole stance: this figure is the buyer's statement, not
    // anything the catalog is asserting about a property.
    expect(container.textContent).toContain("You said");
  });
});
