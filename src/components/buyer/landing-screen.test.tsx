import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { propertyListFixture } from "@/lib/properties/fixtures";
import { INTAKE_PATH } from "@/lib/properties/intake";
import type { PropertySummary } from "@/lib/properties/types";
import { LandingScreen } from "./landing-screen";
import { BUYER_NAV } from "./site-header";

/**
 * The landing page's job is to lead a visitor into guided intake — the site's
 * front door (owner direction, `DECISIONS.md` 2026-09-22; intake is
 * deliberately not a `BUYER_NAV` entry any more) — while still offering a
 * direct path to the whole catalog for a visitor who does not want it. These
 * tests cover both: that the calls to action go where they should, and that
 * the page makes no claim the catalog cannot support.
 *
 * Most of them render an empty catalog, which is both the honest default and
 * the state the page shipped in for the whole of step 7. The recent-properties
 * strip added in step 9 has its own block at the bottom.
 */

const renderLanding = (recent: PropertySummary[] = []) => {
  const view = render(<LandingScreen recent={recent} />);
  const main = view.container.querySelector<HTMLElement>("main");
  if (main === null) throw new Error("LandingScreen rendered no main");
  return { ...view, main };
};

const [BROWSE_NAV] = BUYER_NAV;

describe("LandingScreen — calls to action", () => {
  it("leads with guided intake as the front door", () => {
    const { main } = renderLanding();
    const links = within(main).getAllByRole("link", {
      name: /tell us what you.re looking for/i,
    });

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", INTAKE_PATH);
    }
  });

  it("still offers a direct path to the whole catalog", () => {
    const { main } = renderLanding();
    const links = within(main).getAllByRole("link", {
      name: /browse everything instead|see what is published/i,
    });

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", BROWSE_NAV.href);
    }
  });

  it("sends the browse links to the destination the header already names", () => {
    // The landing page and the header take the browse href from one
    // `BUYER_NAV`, so a route that moves cannot leave one of them pointing at
    // the old path. Intake is deliberately not in `BUYER_NAV` any more, so it
    // is not part of this guarantee.
    const { main } = renderLanding();
    const hrefs = new Set(
      within(main)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    );

    expect(hrefs).toContain(BROWSE_NAV.href);
  });
});

describe("LandingScreen — structure", () => {
  it("sits inside the buyer shell", () => {
    renderLanding();

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("leads with exactly one page heading", () => {
    renderLanding();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("explains how the catalog treats facts", () => {
    const { container } = renderLanding();

    expect(
      container.querySelectorAll('[data-slot="landing-principle"]'),
    ).toHaveLength(4);
  });
});

describe("LandingScreen — claims it is allowed to make", () => {
  it("explains the absence of prices rather than leaving it to be discovered", () => {
    // A buyer who cannot find a price will assume the data is broken unless
    // told it is a deliberate stance.
    const { container } = renderLanding();
    const stance = container.querySelector(
      '[data-slot="landing-price-stance"]',
    );

    expect(stance).not.toBeNull();
    expect(stance).toHaveTextContent("never what any of them costs");
  });

  it("shows no price value while explaining why there is none", () => {
    const { container } = renderLanding();
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
  });

  it("promises no shortlist or saved properties, which do not exist yet", () => {
    // Matching, saves, and comparison are Phase 3. A landing page that
    // advertised them would be describing a product that is not there.
    const { main } = renderLanding();
    const text = (main.textContent ?? "").toLowerCase();

    for (const forbidden of ["shortlist", "saved properties"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("claims no blanket verification", () => {
    // RERA registration is a cross-check, never a general quality guarantee.
    const { main } = renderLanding();

    expect(main).toHaveTextContent("not a general statement about quality");
  });

  it("states the catalog's real geographic scope", () => {
    const { main } = renderLanding();

    expect(main).toHaveTextContent("Gujarat");
  });
});

describe("LandingScreen — recently published", () => {
  it("shows nothing at all when the catalog is empty", () => {
    const { container } = renderLanding([]);

    // Not an empty shelf: a heading over no cards reads as a broken page, and
    // the catalog's emptiness is browse's statement to make, not this page's.
    expect(
      container.querySelector('[data-slot="landing-recent"]'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Recently published")).not.toBeInTheDocument();
  });

  it("shows one card per published property, in the order it was given", () => {
    const { container } = renderLanding(propertyListFixture.data);
    const section = container.querySelector<HTMLElement>(
      '[data-slot="landing-recent"]',
    );
    if (section === null) throw new Error("no recent section rendered");

    const cards = section.querySelectorAll('[data-slot="property-card"]');
    expect(cards).toHaveLength(propertyListFixture.data.length);

    const names = within(section)
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "");
    propertyListFixture.data.forEach((property, index) => {
      expect(names[index]).toContain(property.name);
    });
  });

  it("calls the strip recent, never featured or best", () => {
    const { container } = renderLanding(propertyListFixture.data);
    const section = container.querySelector<HTMLElement>(
      '[data-slot="landing-recent"]',
    );

    // "Recent" is a fact the data carries. "Featured", "top" or "best" would be
    // an assessment nothing in this catalog supports.
    expect(section?.textContent).toContain("Recently published");
    expect(section?.textContent).not.toMatch(/featured|top |best|recommended/i);
  });

  it("offers the whole catalog beside the strip", () => {
    const { container } = renderLanding(propertyListFixture.data);
    const section = container.querySelector<HTMLElement>(
      '[data-slot="landing-recent"]',
    );
    if (section === null) throw new Error("no recent section rendered");

    expect(
      within(section).getByRole("link", { name: "See the whole catalog" }),
    ).toHaveAttribute("href", "/properties");
  });

  it("renders no price value on any card", () => {
    const { container } = renderLanding(propertyListFixture.data);
    const section = container.querySelector<HTMLElement>(
      '[data-slot="landing-recent"]',
    );
    const text = (section?.textContent ?? "").toLowerCase();

    // Scoped to the strip, and matching on price *values* rather than the word
    // itself: the page elsewhere explains at length why there are no prices,
    // and must be allowed to say so.
    expect(text.length).toBeGreaterThan(0);
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
  });
});
