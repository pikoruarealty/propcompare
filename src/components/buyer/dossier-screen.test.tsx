import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  richDossierFixture,
  sparseDossierFixture,
} from "@/lib/properties/fixtures";
import type { PropertyDossier } from "@/lib/properties/types";
import { DossierScreen } from "./dossier-screen";

/**
 * The dossier against both fixtures. `sparseDossierFixture` is the one that
 * earns its keep: no description, no RERA facts, no media, no coordinates, and
 * a variant with a single area basis. A screen that renders it without a blank
 * gap or a fabricated value is rendering absence correctly.
 */

const renderDossier = (dossier: PropertyDossier) => {
  const view = render(<DossierScreen dossier={dossier} />);
  const main = view.container.querySelector<HTMLElement>("main");
  if (main === null) throw new Error("DossierScreen rendered no main");
  return { ...view, main };
};

/** The unit type currently open in the configurations card. */
const openVariant = (container: HTMLElement): HTMLElement => {
  const open = container.querySelectorAll<HTMLElement>(
    '[data-slot="unit-variant"]',
  );
  expect(open).toHaveLength(1);
  return open[0];
};

const sectionOf = (container: HTMLElement, slot: string): HTMLElement => {
  const section = container.querySelector<HTMLElement>(`[data-slot="${slot}"]`);
  if (section === null) throw new Error(`no section ${slot}`);
  return section;
};

describe("DossierScreen — the full property", () => {
  it("leads with identity, developer, and location", () => {
    const { main } = renderDossier(richDossierFixture);

    expect(
      screen.getByRole("heading", { level: 1, name: "Riverfront Heights" }),
    ).toBeInTheDocument();
    expect(main).toHaveTextContent("Sabarmati Estates");
    expect(main).toHaveTextContent("Vastrapur, Ahmedabad");
    expect(main).toHaveTextContent("Apartment");
  });

  it("shows the published description", () => {
    const { main } = renderDossier(richDossierFixture);

    expect(main).toHaveTextContent("two towers with a shared podium garden");
  });

  it("summarises possession and scale up front", () => {
    const { container } = renderDossier(richDossierFixture);
    const facts = sectionOf(container, "key-facts");

    expect(facts).toHaveTextContent("Under construction");
    expect(facts).toHaveTextContent("30 June 2027");
    expect(facts).toHaveTextContent("15 January 2024");
    expect(facts).toHaveTextContent("184");
  });

  it("shows the unit types as one card with a tab for each, not a stack of cards", async () => {
    const user = userEvent.setup();
    const { container } = renderDossier(richDossierFixture);

    expect(
      container.querySelectorAll('[data-slot="variants-card"]'),
    ).toHaveLength(1);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Tower A — 2 BHK",
      "Tower B — 3 BHK",
    ]);
    // The first is open, and only it is on the page.
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(openVariant(container)).toHaveTextContent("Tower A — 2 BHK");

    await user.click(tabs[1]);
    expect(openVariant(container)).toHaveTextContent("Tower B — 3 BHK");
  });

  it("needs no tabs for a single unit type", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      unitVariants: richDossierFixture.unitVariants.slice(0, 1),
    });

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(openVariant(container)).toHaveTextContent("Tower A — 2 BHK");
  });

  it("renders readable room dimensions and omits unreadable ones", async () => {
    const user = userEvent.setup();
    const { container } = renderDossier(richDossierFixture);

    expect(
      within(openVariant(container)).getByText("16.5 × 12 ft, 200 sq ft"),
    ).toBeInTheDocument();
    // The second variant published no dimensions at all.
    await user.click(screen.getAllByRole("tab")[1]);
    expect(
      openVariant(container).querySelector('[data-slot="variant-dimensions"]'),
    ).toBeNull();
  });

  it("links the developer's site without passing on our reputation", () => {
    renderDossier(richDossierFixture);
    const link = screen.getByRole("link", {
      name: "https://example.invalid/sabarmati-estates",
    });

    expect(link).toHaveAttribute("rel", expect.stringContaining("nofollow"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("does not print raw coordinates at the reader", () => {
    // Latitude and longitude are modelled for map and locality search later,
    // not as buyer-facing text. Printing them is the database dump this screen
    // exists to avoid.
    const { main } = renderDossier(richDossierFixture);

    expect(main.textContent).not.toContain("23.036900");
    expect(main.textContent).not.toContain("72.529700");
  });
});

describe("DossierScreen — units per floor", () => {
  it("states what a whole-floor plan says, saying where it came from, never a division", () => {
    // The fixture's towers each have one unit type stating 4 a floor.
    const { main } = renderDossier(richDossierFixture);
    expect(main).toHaveTextContent("4 in A and B (floor plans)");
    expect(main).not.toHaveTextContent("about 6.6");
  });

  it("says not stated when no plan covers a whole floor and RERA has not counted it", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      unitVariants: richDossierFixture.unitVariants.map((variant) => ({
        ...variant,
        unitsPerFloor: null,
      })),
    });
    const fact = [...container.querySelectorAll("dt")].find(
      (term) => term.textContent === "Units per floor",
    )?.parentElement;
    expect(fact).toHaveTextContent("Not stated");
  });
});

describe("DossierScreen — a unit type's private amenities", () => {
  it("lists what the open unit type states, with 'not offered' kept apart", () => {
    const { container } = renderDossier(richDossierFixture);
    const amenities = openVariant(container).querySelector<HTMLElement>(
      '[data-slot="variant-amenities"]',
    )!;

    expect(amenities).toHaveTextContent("Private amenities");
    const jacuzzi = within(amenities)
      .getByText("Jacuzzi")
      .closest('[data-slot="catalog-item"]')!;
    const sauna = within(amenities)
      .getByText("Sauna")
      .closest('[data-slot="catalog-item"]')!;
    expect(jacuzzi).toHaveAttribute("data-status", "available");
    expect(sauna).toHaveAttribute("data-status", "explicitly_not_offered");
  });

  it("says 'Not stated' for a unit type with none, rather than showing nothing", async () => {
    const user = userEvent.setup();
    const { container } = renderDossier(richDossierFixture);
    await user.click(screen.getAllByRole("tab")[1]);
    const amenities = openVariant(container).querySelector<HTMLElement>(
      '[data-slot="variant-amenities"]',
    )!;

    expect(amenities).toHaveTextContent("Not stated");
    expect(amenities.querySelector('[data-slot="catalog-item"]')).toBeNull();
  });
});

describe("DossierScreen — area bases", () => {
  it("lists every basis a variant published", () => {
    const { container } = renderDossier(richDossierFixture);
    const areas = openVariant(container).querySelector(
      '[data-slot="variant-areas"]',
    )!;

    expect(areas).toHaveTextContent("985 sq ft");
    expect(areas).toHaveTextContent("1,180 sq ft");
    expect(areas).toHaveTextContent("1,425 sq ft");
  });

  it("states an unpublished basis rather than deriving it", async () => {
    // The second variant published carpet area only. Built-up and super
    // built-up must say so — a ratio-derived number would be indistinguishable
    // from a published fact.
    const user = userEvent.setup();
    const { container } = renderDossier(richDossierFixture);
    await user.click(screen.getAllByRole("tab")[1]);
    const areas = openVariant(container).querySelector<HTMLElement>(
      '[data-slot="variant-areas"]',
    )!;

    expect(areas).toHaveTextContent("1,310 sq ft");

    const stated = areas.querySelectorAll('[data-fact-status="available"]');
    const unstated = areas.querySelectorAll('[data-fact-status="not_stated"]');
    expect(stated).toHaveLength(1);
    expect(unstated).toHaveLength(2);
  });
});

describe("DossierScreen — repeated room names", () => {
  it("lists every room even when a floor plan repeats a name", () => {
    // Real floor plans repeat names (two bedrooms, several ducts). Keying on the
    // name alone made React warn and could drop or duplicate rows.
    const dossier: PropertyDossier = {
      ...richDossierFixture,
      unitVariants: richDossierFixture.unitVariants.map((variant, index) =>
        index === 0
          ? {
              ...variant,
              dimensions: {
                rooms: [
                  { name: "Bedroom", lengthFt: 12, widthFt: 10 },
                  { name: "Bedroom", lengthFt: 11, widthFt: 10 },
                  { name: "Duct", lengthFt: 3, widthFt: 2 },
                  { name: "Duct", lengthFt: 3, widthFt: 2 },
                ],
              },
            }
          : variant,
      ),
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { container } = renderDossier(dossier);
      const first = container.querySelectorAll(
        '[data-slot="unit-variant"]',
      )[0]!;
      const dimensions = first.querySelector(
        '[data-slot="variant-dimensions"]',
      )!;

      expect(dimensions.querySelectorAll("dt")).toHaveLength(4);
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});

describe("DossierScreen — honest incompleteness", () => {
  it("renders the sparse property without a blank or a placeholder", () => {
    const { main } = renderDossier(sparseDossierFixture);

    expect(main).toHaveTextContent("Anand Niketan Residency");
    expect(main).toHaveTextContent("Not stated");
  });

  it("keeps a refused amenity distinct from an unrecorded one", () => {
    const { container } = renderDossier(sparseDossierFixture);
    const amenities = sectionOf(container, "dossier-amenities");
    const items = amenities.querySelectorAll('[data-slot="catalog-item"]');

    const statuses = [...items].map((item) => item.getAttribute("data-status"));
    expect(statuses).toContain("not_stated");
    expect(statuses).toContain("explicitly_not_offered");
    expect(amenities).toHaveTextContent("Not offered");
  });

  it("shows amenities of every status, never a pre-filtered list", () => {
    const { container } = renderDossier(richDossierFixture);
    const items = sectionOf(container, "dossier-amenities").querySelectorAll(
      '[data-slot="catalog-item"]',
    );

    expect(items).toHaveLength(richDossierFixture.amenities.length);
  });

  it("leads with stated facts and puts unrecorded ones behind a disclosure", () => {
    // The catalog has 26 amenities and a typical property states a handful.
    // Listing them flat buries the real answers under a wall of "Not stated" —
    // the table dump the design guide rules out.
    const { container } = renderDossier(richDossierFixture);
    const amenities = sectionOf(container, "dossier-amenities");
    const details = amenities.querySelector<HTMLElement>(
      '[data-slot="unrecorded-details"]',
    );

    expect(details).not.toBeNull();
    expect(details!.querySelector("summary")).toHaveTextContent(
      "1 not recorded for this property",
    );

    // The stated ones are outside the disclosure, where they lead.
    const outside = [
      ...amenities.querySelectorAll('[data-slot="catalog-item"]'),
    ].filter((item) => !details!.contains(item));
    expect(outside.map((item) => item.getAttribute("data-status"))).toEqual([
      "available",
      "explicitly_not_offered",
    ]);
  });

  it("keeps every unrecorded fact in the page, named, not merely counted", () => {
    // Collapsed is not hidden: the count is stated, each label is in the
    // markup, and <details> opens with no JavaScript.
    const { container } = renderDossier(richDossierFixture);
    const details = sectionOf(container, "dossier-amenities").querySelector(
      '[data-slot="unrecorded-details"]',
    )!;

    expect(details).toHaveTextContent("EV charging");
  });

  it("offers no empty disclosure when everything was recorded", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      amenities: richDossierFixture.amenities.filter(
        (amenity) => amenity.status !== "not_stated",
      ),
    });

    expect(
      sectionOf(container, "dossier-amenities").querySelector(
        '[data-slot="unrecorded-details"]',
      ),
    ).toBeNull();
  });

  it("does not claim a property is unregistered when nothing was recorded", () => {
    // `registered: false` is the column default and no code path sets it, so it
    // means "no registration recorded", not "this project is not registered".
    // Asserting the latter about a real project would be a fabricated fact.
    const { container } = renderDossier(sparseDossierFixture);
    const rera = sectionOf(container, "dossier-rera");

    expect(rera.textContent).not.toContain("Not registered");
    expect(rera).toHaveTextContent("Not stated");
  });
});

describe("DossierScreen — the verified badge", () => {
  it("wears the badge when a registration number backs it", () => {
    // The dossier is the first surface where the badge is reachable at all:
    // it is the only shape carrying the registration number that is its
    // evidence.
    const { container } = renderDossier(richDossierFixture);
    const badge = container.querySelector('[data-slot="verified-badge"]');

    expect(badge).not.toBeNull();
    // The badge says "RERA Verified" alone; the number is in its tooltip and in
    // the RERA section below.
    expect(badge?.textContent?.trim()).toBe("RERA Verified");
    expect(badge?.getAttribute("title")).toContain(
      richDossierFixture.rera.registrationNumber!,
    );
  });

  it("does not wear it without one", () => {
    const { container } = renderDossier(sparseDossierFixture);

    expect(container.querySelector('[data-slot="verified-badge"]')).toBeNull();
  });

  it("does not wear it on a registration flag with no number behind it", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      rera: { ...richDossierFixture.rera, registrationNumber: null },
    });

    expect(container.querySelector('[data-slot="verified-badge"]')).toBeNull();
  });
});

describe("DossierScreen — media, with delivery deferred", () => {
  it("says plainly when a property has no media", () => {
    const { container } = renderDossier(sparseDossierFixture);

    expect(sectionOf(container, "dossier-media")).toHaveTextContent(
      "No photos, floor plans, or other media have been published",
    );
  });

  it("lists media the catalog holds instead of pretending there is none", () => {
    // "This property has no media" and "this property has media you cannot see
    // here yet" are different statements. Collapsing them would say something
    // false about the property.
    const { container } = renderDossier(richDossierFixture);
    const media = sectionOf(container, "dossier-media");

    expect(media.querySelectorAll('[data-slot="media-item"]')).toHaveLength(2);
    expect(media).toHaveTextContent("East elevation");
    expect(media).toHaveTextContent("Floor plan");
    expect(media.textContent).not.toContain(
      "No photos, floor plans, or other media",
    );
  });

  it("shows pictures through the media route with their credit, never by storage path", () => {
    const { container } = renderDossier(richDossierFixture);
    const heroImage = container.querySelector('[data-slot="dossier-hero"] img');
    const images = [...container.querySelectorAll("img")].filter(
      (img) => img !== heroImage,
    );

    // The opening plate shows the primary photograph in full; the gallery shows
    // every picture as a thumbnail.
    const primary = richDossierFixture.media.find(
      (item) => item.mediaType === "photo" && item.isPrimary,
    );
    expect(heroImage).toHaveAttribute("src", `/api/v1/media/${primary?.id}`);
    expect(images.map((img) => img.getAttribute("src"))).toEqual(
      richDossierFixture.media.map(
        (item) => `/api/v1/media/${item.id}?size=thumb`,
      ),
    );
    expect(container).toHaveTextContent(
      "Credit: Image from the Riverfront Developers brochure",
    );
    expect(container.querySelector("video")).toBeNull();
    for (const media of richDossierFixture.media) {
      expect(container.innerHTML).not.toContain(media.gcsPath);
    }
  });
});

describe("DossierScreen — price restraint", () => {
  it("renders no price value anywhere on the page", () => {
    for (const dossier of [richDossierFixture, sparseDossierFixture]) {
      const { container, unmount } = renderDossier(dossier);
      const text = (container.textContent ?? "").toLowerCase();

      for (const forbidden of [
        "₹",
        "inr",
        "crore",
        "lakh",
        "per sq ft",
        "psf",
        "onwards",
        "starting at",
      ]) {
        expect(text).not.toContain(forbidden);
      }
      unmount();
    }
  });

  it("never says the word price in the property's own content", () => {
    // The shared footer does say it, in the sentence explaining that
    // PropCompare publishes none. The dossier body must not — there is no
    // price field on `PropertyDossier` to render, captioned or otherwise.
    for (const dossier of [richDossierFixture, sparseDossierFixture]) {
      const { main, unmount } = renderDossier(dossier);

      expect((main.textContent ?? "").toLowerCase()).not.toContain("price");
      unmount();
    }
  });

  it("carries no price into the structured data either", () => {
    const { container } = renderDossier(richDossierFixture);
    const jsonLd = container.querySelector('[data-slot="dossier-json-ld"]');

    expect(jsonLd).not.toBeNull();
    const parsed = JSON.parse(jsonLd!.textContent ?? "{}");
    expect(parsed["@type"]).toBe("ApartmentComplex");
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain("price");
    expect(JSON.stringify(parsed).toLowerCase()).not.toContain("offer");
  });
});

describe("DossierScreen — navigation", () => {
  it("offers a way back to the catalog", () => {
    renderDossier(richDossierFixture);

    for (const link of screen.getAllByRole("link", {
      name: "Back to all properties",
    })) {
      expect(link).toHaveAttribute("href", "/properties");
    }
  });
});

describe("DossierScreen — crediting the regulator", () => {
  const notes = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-slot="rera-source"]'));

  it("credits GujRERA, with the check date, on exactly the facts the record stated", () => {
    const { container } = renderDossier(richDossierFixture);

    expect(
      notes(container).map((note) => note.getAttribute("data-fact")),
    ).toEqual(["registration_number", "construction_progress"]);
    expect(notes(container)[0]).toHaveTextContent(
      "Source: GujRERA, checked 20 Sep 2026",
    );
    const link = within(notes(container)[0] as HTMLElement).getByRole("link", {
      name: "GujRERA",
    });
    expect(link).toHaveAttribute("href", "https://gujrera.gujarat.gov.in/");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("credits a possession date and unit count only when the record stated them", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      rera: {
        ...richDossierFixture.rera,
        sourcedFacts: ["possession_date", "total_units"],
      },
    });
    const keyFacts = sectionOf(container, "key-facts");
    expect(keyFacts.querySelectorAll('[data-slot="rera-source"]')).toHaveLength(
      2,
    );
    expect(
      sectionOf(container, "dossier-rera").querySelector(
        '[data-slot="rera-source"]',
      ),
    ).toBeNull();
  });

  it("never credits the derived possession status", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      rera: {
        ...richDossierFixture.rera,
        sourcedFacts: [
          "registration_number",
          "construction_progress",
          "possession_date",
          "total_units",
        ],
      },
    });
    const status = Array.from(
      sectionOf(container, "key-facts").querySelectorAll("div"),
    ).find(
      (fact) =>
        fact.textContent?.startsWith("Possession") &&
        !fact.textContent.startsWith("Possession date"),
    );
    expect(status).toBeDefined();
    expect(status?.querySelector('[data-slot="rera-source"]')).toBeNull();
  });

  it("says nothing when the record was never checked or stated none of the published values", () => {
    expect(notes(renderDossier(sparseDossierFixture).container)).toHaveLength(
      0,
    );
    expect(
      notes(
        renderDossier({
          ...richDossierFixture,
          rera: { ...richDossierFixture.rera, lastCheckedAt: null },
        }).container,
      ),
    ).toHaveLength(0);
    expect(
      notes(
        renderDossier({
          ...richDossierFixture,
          rera: { ...richDossierFixture.rera, sourcedFacts: [] },
        }).container,
      ),
    ).toHaveLength(0);
  });

  it("shows the location with a map, a link to Google Maps, and what is nearby as plain lists", () => {
    const { main } = renderDossier(richDossierFixture);
    const location = sectionOf(main, "dossier-location");

    const frame = location.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute("src")).toContain("output=embed");
    expect(frame?.getAttribute("src")).toContain("23.0369");
    expect(
      within(location).getByRole("link", { name: "Open in Google Maps" }),
    ).toHaveAttribute("href", richDossierFixture.location.mapUrl);

    expect(
      within(location).getByRole("heading", { name: "Connectivity" }),
    ).toBeVisible();
    expect(within(location).getByText("Airport 16.2 Km")).toBeVisible();
    expect(
      within(location).getByText("Apex Heart Institute 650 Mtr"),
    ).toBeVisible();
  });

  it("draws no map for a short share link, but still offers the link; and says plainly when nothing nearby is stated", () => {
    const { main } = renderDossier({
      ...sparseDossierFixture,
      location: {
        ...sparseDossierFixture.location,
        mapUrl: "https://maps.app.goo.gl/AbCdEf123",
      },
    });
    const location = sectionOf(main, "dossier-location");
    expect(location.querySelector("iframe")).toBeNull();
    expect(
      within(location).getByRole("link", { name: "Open in Google Maps" }),
    ).toBeVisible();
    expect(
      within(location).getByText(
        "Nearby connectivity, hospitals and schools are not stated.",
      ),
    ).toBeVisible();
  });

  it("shows no map and no link when none is set", () => {
    const { main } = renderDossier(sparseDossierFixture);
    const location = sectionOf(main, "dossier-location");
    expect(location.querySelector("iframe")).toBeNull();
    expect(
      within(location).queryByRole("link", { name: "Open in Google Maps" }),
    ).toBeNull();
  });
});

describe("DossierScreen — density", () => {
  it("states the calculated density in the RERA section, in place of the retired specification", () => {
    const { main } = renderDossier({
      ...richDossierFixture,
      plotAreaSqft: null,
      totalUnits: 100,
      rera: { ...richDossierFixture.rera, projectLandAreaSqft: "87120.00" },
    });

    const rera = within(sectionOf(main, "dossier-rera"));
    expect(rera.getByText("Density")).toBeInTheDocument();
    expect(
      rera.getByText("50 units per acre (land area per RERA)"),
    ).toBeInTheDocument();
  });

  it("says not stated when the land area is not known", () => {
    const { main } = renderDossier({
      ...richDossierFixture,
      plotAreaSqft: null,
      totalUnits: 100,
      rera: { ...richDossierFixture.rera, projectLandAreaSqft: null },
    });

    const rera = sectionOf(main, "dossier-rera");
    const fact = within(rera).getByText("Density").closest("div");
    expect(fact).toHaveTextContent(/not stated/i);
  });
});

describe("DossierScreen — the verified badge's date", () => {
  it("carries the date of the latest successful RERA check", () => {
    const { container } = renderDossier({
      ...richDossierFixture,
      rera: {
        ...richDossierFixture.rera,
        registered: true,
        lastCheckedAt: "2026-09-20T06:00:00.000Z",
      },
    });

    const badge = container.querySelector('[data-slot="verified-badge"]');
    expect(badge?.getAttribute("title")).toMatch(/last verified 2026-09-20/);
  });
});
