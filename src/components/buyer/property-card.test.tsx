import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  richSummaryFixture,
  sparseSummaryFixture,
} from "@/lib/properties/fixtures";
import type { PropertySummary } from "@/lib/properties/types";
import { PropertyCard } from "./property-card";

/**
 * The card is the only place a buyer meets a property before its dossier, so
 * these tests cover the three things it must never get wrong: it shows no
 * price, it shows no unevidenced trust signal, and it renders a sparse
 * property — the common case — without a gap the reader has to interpret.
 *
 * `sparseSummaryFixture` is the one that matters. A property with every field
 * populated is the easy case and the rare one.
 */

const renderCard = (property: PropertySummary) => {
  const view = render(<PropertyCard property={property} />);
  const card = view.container.querySelector<HTMLElement>(
    '[data-slot="property-card"]',
  );
  if (card === null) throw new Error("PropertyCard rendered nothing");
  return { ...view, card };
};

describe("PropertyCard — published facts", () => {
  it("shows the property, its developer, its type, and where it is", () => {
    const { card } = renderCard(richSummaryFixture);

    expect(card).toHaveTextContent("Riverfront Heights");
    expect(card).toHaveTextContent("Sabarmati Estates");
    expect(card).toHaveTextContent("Apartment");
    expect(card).toHaveTextContent("Vastrapur, Ahmedabad");
  });

  it("links the property name to its dossier", () => {
    renderCard(richSummaryFixture);

    expect(
      screen.getByRole("link", { name: "Riverfront Heights" }),
    ).toHaveAttribute("href", "/properties/riverfront-heights");
  });

  it("offers exactly one link, so the card is not read out twice", () => {
    // The name link is stretched across the whole card rather than paired with
    // a separate "view dossier" control pointing at the same place.
    const { card } = renderCard(richSummaryFixture);

    expect(within(card).getAllByRole("link")).toHaveLength(1);
  });

  it("lists every distinct configuration the property offers", () => {
    const { card } = renderCard(richSummaryFixture);
    const chips = card.querySelectorAll('[data-slot="property-card-bhk"]');

    expect([...chips].map((chip) => chip.textContent)).toEqual([
      "2 BHK",
      "3 BHK",
    ]);
  });

  it("renders the possession date as published, not shifted by a time zone", () => {
    const { card } = renderCard(richSummaryFixture);

    expect(card).toHaveTextContent("Under construction");
    expect(card).toHaveTextContent("30 June 2027");
  });
});

describe("PropertyCard — absence", () => {
  it("states that possession is unknown rather than leaving it blank", () => {
    const { card } = renderCard(sparseSummaryFixture);
    const facts = card.querySelectorAll('[data-slot="fact-value"]');

    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact).toHaveAttribute("data-fact-status", "not_stated");
      expect(fact).toHaveTextContent("Not stated");
    }
  });

  it("states that the configuration is unknown when no variant records one", () => {
    const { card } = renderCard({ ...sparseSummaryFixture, bhkTypes: [] });

    expect(
      card.querySelectorAll('[data-slot="property-card-bhk"]'),
    ).toHaveLength(0);
    expect(card).toHaveTextContent("Not stated");
  });

  it("renders a property with no media at all", () => {
    const { card } = renderCard(sparseSummaryFixture);

    expect(card).toHaveTextContent("Anand Niketan Residency");
    expect(card.querySelector("img")).toBeNull();
  });
});

describe("PropertyCard — the two trust rules", () => {
  it("shows no price, at any nesting level of the rendered text", () => {
    // `PropertySummary` has no price field, so this asserts the property the
    // contract already guarantees — and would catch a card that started
    // deriving or captioning one.
    const { card } = renderCard(richSummaryFixture);
    const text = card.textContent ?? "";

    for (const forbidden of [
      "₹",
      "Rs",
      "INR",
      "price",
      "Price",
      "per sq",
      "crore",
      "lakh",
      "budget",
      "Budget",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("shows no verified badge, even for a RERA-registered property", () => {
    // `richSummaryFixture.reraRegistered` is true, and that is deliberately not
    // enough. `VerifiedBadge` asserts a registration number as its evidence,
    // and `PropertySummary` does not carry one — so the badge belongs to the
    // dossier, which does. See DECISIONS.md (2026-09-07).
    expect(richSummaryFixture.reraRegistered).toBe(true);

    const { card } = renderCard(richSummaryFixture);

    expect(card.querySelector('[data-slot="verified-badge"]')).toBeNull();
    expect(card).not.toHaveTextContent("Verified");
  });

  it("shows no save or compare control, since neither exists yet", () => {
    // Phase 3 owns both. A disabled button promising them would be decoration.
    const { card } = renderCard(richSummaryFixture);

    expect(within(card).queryAllByRole("button")).toHaveLength(0);
    expect(card).not.toHaveTextContent("Save");
    expect(card).not.toHaveTextContent("Compare");
  });
});

describe("PropertyCard — the deferred media gate", () => {
  it("renders no image even when the property has primary media", () => {
    // `gcsPath` is a storage path, not a URL. Until media delivery is decided
    // (step 6), rendering it as an `src` would produce a broken image on every
    // card that has media — the failure this reservation exists to prevent.
    expect(richSummaryFixture.primaryMedia).not.toBeNull();

    const { card } = renderCard(richSummaryFixture);

    expect(card.querySelector("img")).toBeNull();
    expect(card.innerHTML).not.toContain(
      richSummaryFixture.primaryMedia?.gcsPath ?? "",
    );
  });

  it("keeps the media frame silent rather than claiming there is no photo", () => {
    // A property may well have a photo this build cannot yet display. Saying
    // "no image" would be a fabricated fact about the property.
    const { card } = renderCard(richSummaryFixture);
    const frame = card.querySelector('[data-slot="property-card-media"]');

    expect(frame).not.toBeNull();
    expect(frame).toHaveAttribute("aria-hidden", "true");
    expect(frame?.textContent).toBe("");
  });
});
