import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { lockDossier } from "@/lib/properties/lock";
import type { PropertyDossier } from "@/lib/properties/types";
import { DossierScreen } from "./dossier-screen";

/**
 * The dossier as a signed-out visitor sees it (`DECISIONS.md` 2026-09-24) and the
 * way a printed list of specifications is drawn. The screen is given what the
 * server sent: the locked dossier, with the withheld values already gone.
 */

const withPhotos = (count: number): PropertyDossier => ({
  ...richDossierFixture,
  media: [
    ...Array.from({ length: count }, (_, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      mediaType: "photo" as const,
      gcsPath: `properties/x/photo-${i + 1}.jpg`,
      caption: null,
      unitVariantId: null,
      isPrimary: i === 0,
      attribution: null,
    })),
    ...richDossierFixture.media.filter((m) => m.mediaType === "floor_plan"),
  ],
});

const renderLocked = () =>
  render(<DossierScreen dossier={lockDossier(withPhotos(6))} />);

describe("DossierScreen, signed out", () => {
  it("keeps the section headings and says how to unlock them", () => {
    const { container } = renderLocked();

    for (const title of ["Configurations", "Amenities", "Specifications"]) {
      expect(
        screen.getByRole("heading", { level: 2, name: title }),
      ).toBeInTheDocument();
    }
    const prompt = container.querySelector('[data-slot="dossier-unlock"]');
    expect(prompt).not.toBeNull();
    expect(prompt).toHaveTextContent("Sign in to see the full record");
  });

  it("draws the withheld values as shimmering placeholders, not as 'Not stated'", () => {
    const { container } = renderLocked();
    const configurations = container.querySelector(
      '[data-slot="locked-configurations"]',
    ) as HTMLElement;
    const amenities = container.querySelector(
      '[data-slot="locked-amenities"]',
    ) as HTMLElement;

    expect(configurations.querySelectorAll(".lock-bar").length).toBeGreaterThan(
      5,
    );
    expect(amenities.querySelectorAll(".lock-bar").length).toBeGreaterThan(0);
    expect(configurations).not.toHaveTextContent("Not stated");
    expect(amenities).not.toHaveTextContent("Not stated");
    expect(amenities).not.toHaveTextContent("Not recorded");
  });

  it("still names each unit type, but states no measurement or answer", () => {
    const { container } = renderLocked();
    const configurations = container.querySelector(
      '[data-slot="locked-configurations"]',
    ) as HTMLElement;

    expect(configurations).toHaveTextContent(
      richDossierFixture.unitVariants[0].variantName,
    );
    expect(configurations).not.toHaveTextContent(/sq ft/);
    expect(container.querySelector('[data-slot="unit-variant"]')).toBeNull();
    expect(
      container.querySelector(
        '[data-slot="dossier-amenities"] [data-slot="catalog-item"]',
      ),
    ).toBeNull();
  });

  it("shows a preview of the photos, counts the rest, and shows no floor plan", () => {
    const { container } = renderLocked();
    const media = container.querySelector(
      '[data-slot="dossier-media"]',
    ) as HTMLElement;

    expect(media.querySelectorAll("img").length).toBeLessThanOrEqual(3);
    expect(within(media).getByText(/3 more photos/)).toBeInTheDocument();
    expect(media).toHaveTextContent(/1 floor plan/);
    expect(container.innerHTML).not.toContain(
      "ffffffff-1111-4111-8111-ffffffffffff",
    );
  });

  it("replaces the 'facts stated' count with a way to sign in", () => {
    const { container } = renderLocked();

    expect(
      container.querySelector('[data-slot="dossier-completeness"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="dossier-locked-note"]'),
    ).not.toBeNull();
  });

  it("does not put the withheld amenity answers in the page at all", () => {
    const { container } = renderLocked();

    for (const amenity of richDossierFixture.amenities) {
      expect(
        container.querySelector(
          `[data-slot="dossier-amenities"] [data-status="${amenity.status}"]`,
        ),
      ).toBeNull();
    }
  });

  it("leaves a signed-in dossier as it was", () => {
    const { container } = render(
      <DossierScreen dossier={richDossierFixture} />,
    );

    expect(container.querySelector('[data-slot="dossier-unlock"]')).toBeNull();
    expect(
      container.querySelector('[data-slot="unit-variant"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="dossier-completeness"]'),
    ).not.toBeNull();
  });
});

describe("DossierScreen, printed lists", () => {
  const withSpecs = (
    specifications: PropertyDossier["specifications"],
  ): PropertyDossier => ({ ...richDossierFixture, specifications });

  it("draws a semicolon-separated value as a list, one item to a line", () => {
    const { container } = render(
      <DossierScreen
        dossier={withSpecs([
          {
            key: "safety_features",
            label: "Safety features",
            category: "building_operation",
            valueText:
              "24/7 CCTV surveillance and manned security; Access control in lobby; Fire sprinklers in each apartment",
            status: "available",
          },
        ])}
      />,
    );
    const list = container.querySelector(
      '[data-slot="dossier-specifications"] [data-slot="item-list"]',
    ) as HTMLElement;

    expect(
      within(list)
        .getAllByRole("listitem")
        .map((line) => line.textContent),
    ).toEqual([
      "24/7 CCTV surveillance and manned security",
      "Access control in lobby",
      "Fire sprinklers in each apartment",
    ]);
    expect(list).not.toHaveTextContent(";");
  });

  it("keeps a short value beside its label and sets a long sentence on its own line", () => {
    const { container } = render(
      <DossierScreen
        dossier={withSpecs([
          {
            key: "lifts_per_tower",
            label: "Lifts per tower",
            category: "building_operation",
            valueText: "5",
            status: "available",
          },
          {
            key: "doors",
            label: "Doors",
            category: "finish_quality",
            valueText:
              "Main entrance door, 40mm thick flush door with veneer on both sides",
            status: "available",
          },
        ])}
      />,
    );
    const items = container.querySelectorAll(
      '[data-slot="dossier-specifications"] [data-slot="catalog-item"]',
    );

    expect(items).toHaveLength(2);
    expect(items[0].className).toContain("justify-between");
    expect(items[1].className).not.toContain("justify-between");
    expect(items[1]).toHaveTextContent("Main entrance door");
  });
});
