import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FACT_STATUS_LABEL,
  FactValue,
  type FactValueProps,
} from "./fact-value";

/**
 * The honest-incompleteness rule: a missing fact renders as an explicit state,
 * never as a blank and never as a plausible placeholder, and the two absence
 * states stay distinguishable from each other.
 *
 * Queries go through `data-slot` rather than a test id, so the component does
 * not have to open up its props — the sealed prop surface is part of what keeps
 * it from being talked into rendering something else.
 */
const renderFact = (props: FactValueProps) => {
  const view = render(<FactValue {...props} />);
  const fact = view.container.querySelector<HTMLElement>(
    '[data-slot="fact-value"]',
  );
  if (fact === null) throw new Error("FactValue rendered nothing");
  return { ...view, fact };
};

describe("FactValue — stated facts", () => {
  it("renders a stated value", () => {
    const { fact } = renderFact({
      status: "available",
      value: "Vitrified tiles",
    });

    expect(fact).toHaveTextContent("Vitrified tiles");
    expect(fact).toHaveAttribute("data-fact-status", "available");
  });

  it("affirms an available fact that carries no text of its own", () => {
    // The amenity case: the fact is that the property has the thing, and the
    // label beside it says what the thing is. A blank here would read as
    // missing data.
    const { fact } = renderFact({ status: "available" });

    expect(fact).toHaveTextContent("Available");
  });

  it("treats zero as a value, not as absence", () => {
    // A property with zero of something has stated a fact. Rendering it as
    // "Not stated" would discard a real answer.
    const { fact } = renderFact({ value: 0 });

    expect(fact).toHaveTextContent("0");
    expect(fact).toHaveAttribute("data-fact-status", "available");
  });

  it("applies tabular numerals to a stated value when asked", () => {
    const { fact } = renderFact({ value: "1,450", tabular: true });

    expect(fact.className).toContain("data-tabular");
  });
});

describe("FactValue — absence", () => {
  it("renders an absent value as not stated rather than blank", () => {
    const { fact } = renderFact({ value: null });

    expect(fact).toHaveTextContent("Not stated");
    expect(fact).toHaveAttribute("data-fact-status", "not_stated");
  });

  it.each([undefined, null, "", "   "] as const)(
    "treats %p as not stated",
    (value) => {
      const { fact } = renderFact({ value });
      expect(fact).toHaveAttribute("data-fact-status", "not_stated");
    },
  );

  it("keeps not-stated and not-offered textually distinct", () => {
    // The distinction is the whole point: one is an unanswered question, the
    // other is an answered one. Rendering them the same invents a meaning the
    // catalog does not hold.
    const notStated = renderFact({ status: "not_stated" });
    const notStatedText = notStated.fact.textContent;
    notStated.unmount();

    const notOffered = renderFact({ status: "explicitly_not_offered" });

    expect(notStatedText).toBe("Not stated");
    expect(notOffered.fact.textContent).toBe("Not offered");
    expect(notStatedText).not.toBe(notOffered.fact.textContent);
  });

  it("keeps not-stated and not-offered visually distinct", () => {
    const notStated = renderFact({ status: "not_stated" });
    const notStatedClass = notStated.fact.className;
    notStated.unmount();

    const notOffered = renderFact({ status: "explicitly_not_offered" });

    expect(notOffered.fact.className).not.toBe(notStatedClass);
  });

  it("explains each absence state rather than leaving it bare", () => {
    const notStated = renderFact({ status: "not_stated" });
    expect(notStated.fact.getAttribute("title")).toContain("not been recorded");
    notStated.unmount();

    const notOffered = renderFact({ status: "explicitly_not_offered" });
    expect(notOffered.fact.getAttribute("title")).toContain("not offered");
  });

  it("does not dress absence as a numeric value", () => {
    const { fact } = renderFact({ status: "not_stated", tabular: true });

    expect(fact.className).not.toContain("data-tabular");
  });

  it.each(["not_stated", "explicitly_not_offered"] as const)(
    "never renders %s as something mistakable for data",
    (status) => {
      const { fact } = renderFact({ status });
      const text = (fact.textContent ?? "").trim();

      expect(text).not.toBe("");
      expect([
        "-",
        "—",
        "–",
        "N/A",
        "n/a",
        "0",
        "null",
        "undefined",
      ]).not.toContain(text);
      expect(text).toBe(FACT_STATUS_LABEL[status]);
    },
  );
});

describe("FactValue — precedence", () => {
  it("lets an explicit status win over a stray value", () => {
    // A value sitting beside a `not_stated` status is a data defect. Rendering
    // the value anyway would hide it behind something that looks correct.
    const { fact } = renderFact({
      status: "not_stated",
      value: "Swimming pool",
    });

    expect(fact).toHaveTextContent("Not stated");
    expect(fact).not.toHaveTextContent("Swimming pool");
  });
});
