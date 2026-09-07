import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

  it("renders every unit variant", () => {
    const { container } = renderDossier(richDossierFixture);
    const variants = container.querySelectorAll('[data-slot="unit-variant"]');

    expect(variants).toHaveLength(2);
    expect(variants[0]).toHaveTextContent("Tower A — 2 BHK");
    expect(variants[1]).toHaveTextContent("Tower B — 3 BHK");
  });

  it("renders readable room dimensions and omits unreadable ones", () => {
    const { container } = renderDossier(richDossierFixture);
    const variants = container.querySelectorAll('[data-slot="unit-variant"]');

    expect(
      within(variants[0] as HTMLElement).getByText("16.5 × 12 ft"),
    ).toBeInTheDocument();
    // The second variant published no dimensions at all.
    expect(
      (variants[1] as HTMLElement).querySelector(
        '[data-slot="variant-dimensions"]',
      ),
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

describe("DossierScreen — area bases", () => {
  it("lists every basis a variant published", () => {
    const { container } = renderDossier(richDossierFixture);
    const first = container.querySelectorAll('[data-slot="unit-variant"]')[0]!;
    const areas = first.querySelector('[data-slot="variant-areas"]')!;

    expect(areas).toHaveTextContent("985 sq ft");
    expect(areas).toHaveTextContent("1,180 sq ft");
    expect(areas).toHaveTextContent("1,425 sq ft");
  });

  it("states an unpublished basis rather than deriving it", () => {
    // The second variant published carpet area only. Built-up and super
    // built-up must say so — a ratio-derived number would be indistinguishable
    // from a published fact.
    const { container } = renderDossier(richDossierFixture);
    const second = container.querySelectorAll('[data-slot="unit-variant"]')[1]!;
    const areas = second.querySelector<HTMLElement>(
      '[data-slot="variant-areas"]',
    )!;

    expect(areas).toHaveTextContent("1,310 sq ft");

    const stated = areas.querySelectorAll('[data-fact-status="available"]');
    const unstated = areas.querySelectorAll('[data-fact-status="not_stated"]');
    expect(stated).toHaveLength(1);
    expect(unstated).toHaveLength(2);
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
    expect(badge).toHaveTextContent(
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

  it("fetches no media file, since delivery is not decided yet", () => {
    const { container } = renderDossier(richDossierFixture);

    expect(container.querySelector("img")).toBeNull();
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
