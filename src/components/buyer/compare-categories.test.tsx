import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { lockComparison } from "@/lib/compare/lock";
import { buildComparison } from "@/lib/compare/model";
import type { PropertyDossier } from "@/lib/properties/types";
import { CompareScreen } from "./compare-screen";

/**
 * Amenities and specifications are headed by their catalog category
 * (`docs/tasklists/2026-09-23-comparison-derived-metrics.md`): structure only, so
 * every amenity is still shown, under its heading, signed in or locked.
 */

const amenity = (
  key: string,
  category: string,
  status: "available" | "not_stated" | "explicitly_not_offered" = "available",
) => ({ key, label: key.toUpperCase(), category, status });

const two = (): PropertyDossier[] =>
  ["a", "b"].map((slug) => ({
    ...richDossierFixture,
    slug,
    name: `Tower ${slug}`,
    amenities: [
      amenity("gym", "lifestyle"),
      amenity("pool", "lifestyle", slug === "a" ? "available" : "not_stated"),
      amenity("cctv", "safety_and_security"),
    ],
  }));

const openAmenities = async () => {
  const user = userEvent.setup();
  const section = screen.getByRole("button", { name: "Amenities section" });
  if (section.getAttribute("aria-expanded") !== "true") {
    await user.click(section);
  }
};

const headings = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-slot="compare-category"]')].map(
    (el) => el.textContent,
  );

describe("category headings in the comparison", () => {
  it("head each run of amenities, humanised, without hiding any", async () => {
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );
    await openAmenities();

    const group = container.querySelector(
      '[data-group="amenities"]',
    ) as HTMLElement;
    const inGroup = [
      ...group.querySelectorAll(
        '[data-slot="compare-category"], [data-slot="compare-row"]',
      ),
    ].map((el) =>
      el.getAttribute("data-slot") === "compare-category"
        ? `# ${el.textContent}`
        : (el.textContent ?? "")
            .replace(/(Available|Not stated).*$/, "")
            .trim(),
    );

    expect(headings(group)).toEqual(["Lifestyle", "Safety and security"]);
    expect(inGroup).toEqual([
      "# Lifestyle",
      "GYM",
      "POOL",
      "# Safety and security",
      "CCTV",
    ]);
  });

  it("head the locked rows too, and still send no value", async () => {
    const locked = lockComparison(buildComparison(two(), {}));
    const { container } = render(
      <CompareScreen locked={locked} requested={{}} />,
    );
    await openAmenities();

    const group = container.querySelector(
      '[data-group="amenities"]',
    ) as HTMLElement;
    expect(headings(group)).toEqual(["Lifestyle", "Safety and security"]);
    expect(
      group.querySelectorAll('[data-slot="compare-row-locked"]'),
    ).toHaveLength(3);
    expect(group).not.toHaveTextContent("Available");
  });
});
