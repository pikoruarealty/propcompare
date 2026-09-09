import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GridRow, PageContainer, PageFrame, PageSection } from "./page-frame";
import { BUYER_NAV } from "./site-header";

/**
 * The shell and the grid.
 *
 * The layout assertions check that the primitives read the documented
 * `--layout-*` variables rather than restating 48px and 24px as literals — the
 * variables are the single place those numbers live, and a component that
 * hard-codes them is free to drift from the token spec.
 */

describe("PageFrame", () => {
  it("frames the page with a header, a main landmark, and a footer", () => {
    render(
      <PageFrame>
        <p>Dossier</p>
      </PageFrame>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText("Dossier")).toBeInTheDocument();
  });

  it("offers a skip link into the main landmark", () => {
    render(
      <PageFrame>
        <p>Dossier</p>
      </PageFrame>,
    );

    expect(
      screen.getByRole("link", { name: "Skip to content" }),
    ).toHaveAttribute("href", "#main-content");
  });

  it("links the primary navigation to the shared destinations", () => {
    // One nav definition, so the landing page and the browse grid cannot drift
    // into linking somewhere else.
    render(
      <PageFrame>
        <p>Dossier</p>
      </PageFrame>,
    );

    const nav = screen.getByRole("navigation", { name: "Primary" });
    for (const item of BUYER_NAV) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute(
        "href",
        item.href,
      );
    }
    expect(nav).toBeInTheDocument();
  });

  it("states the price-restraint stance rather than leaving prices unexplained", () => {
    render(
      <PageFrame>
        <p>Dossier</p>
      </PageFrame>,
    );

    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      /does not publish prices/i,
    );
  });
});

describe("layout primitives", () => {
  it("applies the documented page margins from the layout tokens", () => {
    const { container } = render(<PageContainer>Content</PageContainer>);
    const frame = container.querySelector<HTMLElement>(
      '[data-slot="page-container"]',
    );

    expect(frame?.className).toContain("px-[var(--layout-margin-mobile)]");
    expect(frame?.className).toContain("md:px-[var(--layout-margin-desktop)]");
    expect(frame?.className).toContain("max-w-[var(--layout-max-width)]");
  });

  it("lays out twelve columns on desktop with the documented gutter", () => {
    const { container } = render(<GridRow>Cells</GridRow>);
    const row = container.querySelector<HTMLElement>('[data-slot="grid-row"]');

    expect(row?.className).toContain("md:grid-cols-12");
    expect(row?.className).toContain("gap-[var(--layout-gutter)]");
  });

  it("collapses to a single column below the desktop breakpoint", () => {
    // The design guide rejects compressing twelve columns into a phone.
    const { container } = render(<GridRow>Cells</GridRow>);
    const row = container.querySelector<HTMLElement>('[data-slot="grid-row"]');

    expect(row?.className).toContain("grid-cols-1");
  });

  it("gives a section vertical rhythm in multiples of eight", () => {
    const { container } = render(<PageSection>Body</PageSection>);
    const section = container.querySelector<HTMLElement>(
      '[data-slot="page-section"]',
    );

    // py-8 = 32px, md:py-16 = 64px — both on the 8px rhythm.
    expect(section?.className).toContain("py-8");
    expect(section?.className).toContain("md:py-16");
  });
});
