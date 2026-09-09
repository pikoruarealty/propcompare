import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  VerifiedBadge,
  reraVerifiedFact,
  type ReraFactSource,
} from "./verified-badge";

/**
 * The trust rule: the Soft Gold badge cannot render without the concrete fact
 * that justifies it.
 *
 * This is asserted from both ends — the derivation refuses to produce a fact
 * from an unevidenced claim, and the component refuses to render anything from
 * a null fact — because either one alone could be bypassed by the other.
 */

const reraSource = (
  overrides: Partial<ReraFactSource> = {},
): ReraFactSource => ({
  registered: true,
  registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABADCITY/AUDA/MAA00000/EX1",
  lastVerifiedAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

describe("reraVerifiedFact", () => {
  it("produces a fact when the registration is both claimed and evidenced", () => {
    expect(reraVerifiedFact(reraSource())).toEqual({
      kind: "rera",
      registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABADCITY/AUDA/MAA00000/EX1",
      lastVerifiedAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("refuses an unregistered property", () => {
    expect(reraVerifiedFact(reraSource({ registered: false }))).toBeNull();
  });

  it("refuses a registration flag with no registration number", () => {
    // The case the rule exists for: `registered: true` is a claim, and a gold
    // badge on a claim with no evidence behind it is the decorative trust
    // signal the design guide rules out.
    expect(
      reraVerifiedFact(reraSource({ registrationNumber: null })),
    ).toBeNull();
    expect(
      reraVerifiedFact(reraSource({ registrationNumber: "   " })),
    ).toBeNull();
  });

  it("refuses an unregistered property even when a number is present", () => {
    expect(reraVerifiedFact(reraSource({ registered: false }))).toBeNull();
  });
});

describe("VerifiedBadge", () => {
  it("renders nothing at all for a null fact", () => {
    const { container } = render(<VerifiedBadge fact={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a property whose registration is unevidenced", () => {
    // End to end: the derivation and the component together, which is how a
    // screen will use them.
    const { container } = render(
      <VerifiedBadge
        fact={reraVerifiedFact(reraSource({ registrationNumber: null }))}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the registration number it is asserting", () => {
    render(<VerifiedBadge fact={reraVerifiedFact(reraSource())} />);

    const badge = screen.getByText(/RERA Verified/);
    expect(badge).toHaveAttribute("data-verified-kind", "rera");
    // The evidence path: the badge names the fact, it does not just assert trust.
    expect(badge).toHaveTextContent(
      "PR/GJ/AHMEDABAD/AHMEDABADCITY/AUDA/MAA00000/EX1",
    );
    expect(badge.getAttribute("title")).toContain("last verified 2026-08-01");
  });

  it("still renders without a verification date, omitting it rather than inventing one", () => {
    render(
      <VerifiedBadge
        fact={reraVerifiedFact(reraSource({ lastVerifiedAt: null }))}
      />,
    );

    const badge = screen.getByText(/RERA Verified/);
    expect(badge.getAttribute("title")).not.toContain("last verified");
  });

  it("uses Soft Gold", () => {
    render(<VerifiedBadge fact={reraVerifiedFact(reraSource())} />);

    expect(screen.getByText(/RERA Verified/).className).toContain(
      "--color-verified-gold",
    );
  });
});
