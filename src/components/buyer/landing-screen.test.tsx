import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingScreen } from "./landing-screen";
import { BUYER_NAV } from "./site-header";

/**
 * The landing page's job is to route a visitor into browse or guided intake,
 * and to say enough about the catalog that its deliberate gaps do not read as
 * defects. These tests cover both: that the calls to action go where they
 * should, and that the page makes no claim the catalog cannot support.
 */

const renderLanding = () => {
  const view = render(<LandingScreen />);
  const main = view.container.querySelector<HTMLElement>("main");
  if (main === null) throw new Error("LandingScreen rendered no main");
  return { ...view, main };
};

const [BROWSE_NAV, INTAKE_NAV] = BUYER_NAV;

describe("LandingScreen — calls to action", () => {
  it("routes to the browse catalog", () => {
    const { main } = renderLanding();
    const links = within(main).getAllByRole("link", {
      name: /browse properties|see what is published/i,
    });

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/properties");
    }
  });

  it("routes to guided intake", () => {
    const { main } = renderLanding();
    const links = within(main).getAllByRole("link", { name: /guided start/i });

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/intake");
    }
  });

  it("sends visitors to the destinations the header already names", () => {
    // The landing page and the header take their hrefs from one `BUYER_NAV`,
    // so a route that moves cannot leave one of them pointing at the old path.
    const { main } = renderLanding();
    const hrefs = new Set(
      within(main)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    );

    expect(hrefs).toContain(BROWSE_NAV.href);
    expect(hrefs).toContain(INTAKE_NAV.href);
  });

  it("offers both paths, since intake is optional", () => {
    // The buyer flow is explicit that a visitor may browse immediately and that
    // intake is optional. A landing that funnelled everyone through intake
    // would contradict it.
    const { main } = renderLanding();

    expect(
      within(main).getAllByRole("link", { name: /browse/i }).length,
    ).toBeGreaterThan(0);
    expect(main).toHaveTextContent("Intake is optional");
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

  it("promises no matching or shortlist, which do not exist yet", () => {
    // Matching, saves, and comparison are Phase 3. A landing page that
    // advertised them would be describing a product that is not there.
    const { main } = renderLanding();
    const text = (main.textContent ?? "").toLowerCase();

    for (const forbidden of ["shortlist", "compare side by side", "saved"]) {
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
