import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComparisonResult } from "@/lib/buyer/types";
import {
  richSummaryFixture,
  sparseSummaryFixture,
} from "@/lib/properties/fixtures";
import { SavedScreen, savedComparisonAddress } from "./saved-screen";

const comparison: ComparisonResult = {
  id: "c1",
  createdAt: "2026-09-21T10:00:00.000Z",
  items: [
    {
      propertyId: richSummaryFixture.id,
      unitVariantId: "11111111-1111-4111-8111-111111111111",
      displayOrder: 0,
      property: richSummaryFixture,
    },
    {
      propertyId: sparseSummaryFixture.id,
      unitVariantId: null,
      displayOrder: 1,
      property: sparseSummaryFixture,
    },
  ],
};

describe("savedComparisonAddress", () => {
  it("reopens the properties in order with the saved unit types", () => {
    expect(savedComparisonAddress(comparison)).toBe(
      `/compare?p=${richSummaryFixture.slug},${sparseSummaryFixture.slug}&v=${richSummaryFixture.slug}~11111111-1111-4111-8111-111111111111`,
    );
  });
});

describe("SavedScreen", () => {
  it("says nothing is saved yet and points to browse", () => {
    render(<SavedScreen properties={[]} comparisons={[]} />);
    expect(document.querySelector('[data-slot="saved-empty"]')).not.toBeNull();
    const empty = document.querySelector(
      '[data-slot="saved-empty"]',
    ) as HTMLElement;
    expect(
      within(empty).getByRole("link", { name: "Browse properties" }),
    ).toHaveAttribute("href", "/properties");
  });

  it("lists saved comparisons as links and saved properties as cards", () => {
    render(
      <SavedScreen
        properties={[
          { savedAt: "2026-09-20T10:00:00.000Z", property: richSummaryFixture },
        ]}
        comparisons={[comparison]}
      />,
    );
    const list = document.querySelector('[data-slot="saved-comparisons"]');
    expect(
      within(list as HTMLElement).getByRole("link", {
        name: `${richSummaryFixture.name} against ${sparseSummaryFixture.name}`,
      }),
    ).toHaveAttribute("href", expect.stringContaining("/compare?p="));
    expect(
      document.querySelectorAll('[data-slot="property-card"]'),
    ).toHaveLength(1);
    expect(document.querySelector('[data-slot="saved-empty"]')).toBeNull();
  });

  it("shows no price", () => {
    const { container } = render(
      <SavedScreen
        properties={[
          { savedAt: "2026-09-20T10:00:00.000Z", property: richSummaryFixture },
        ]}
        comparisons={[comparison]}
      />,
    );
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ["₹", "crore", "lakh", "per sq ft", "onwards"]) {
      expect(text).not.toContain(word);
    }
  });
});
