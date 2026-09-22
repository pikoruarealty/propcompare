import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { CompareScreen } from "./compare-screen";

/**
 * Comparison's depth gate (`DECISIONS.md` 2026-09-22 — supersedes "no sign-in
 * to compare"): the column identity block and the differences-first summary
 * are open to everyone; the row groups beneath them are locked, as skeleton
 * placeholders, until the buyer signs in. Data correctness of the rows
 * themselves is `compare.test.tsx`'s job (always rendered signed in there);
 * this file is only about what is visible in each session state.
 */

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession,
    phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/compare",
}));

const signedOut = () =>
  useSession.mockReturnValue({ data: null, isPending: false });
const signedIn = () =>
  useSession.mockReturnValue({
    data: { user: { id: "u1" } },
    isPending: false,
  });

const two = () => [
  { ...richDossierFixture, slug: "a", name: "Alpha Heights" },
  { ...richDossierFixture, slug: "b", name: "Beta Residency" },
];

describe("CompareScreen — the sign-in gate", () => {
  it("shows the column identity and the summary to a signed-out visitor", () => {
    signedOut();
    render(<CompareScreen dossiers={two()} requested={{}} />);

    expect(screen.getByText("Alpha Heights")).toBeVisible();
    expect(screen.getByText("Beta Residency")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "What changes between these choices",
      }),
    ).toBeVisible();
  });

  it("locks every row group behind a skeleton, with the real cells absent", () => {
    signedOut();
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );

    const groups = container.querySelectorAll('[data-slot="compare-group"]');
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group).toHaveAttribute("data-locked", "true");
    }
    expect(
      container.querySelectorAll('[data-slot="compare-row"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-slot="compare-row-locked"]').length,
    ).toBeGreaterThan(0);
  });

  it("still shows each locked row's label, never its value", () => {
    signedOut();
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );

    const timeline = container.querySelector<HTMLElement>(
      '[data-group="timeline"]',
    );
    if (timeline === null) throw new Error("no timeline group rendered");
    expect(within(timeline).getByText("Possession")).toBeVisible();
    expect(screen.queryByText("Not stated")).not.toBeInTheDocument();
  });

  it("offers exactly one sign-in prompt, not one per locked group", () => {
    signedOut();
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );

    expect(
      container.querySelectorAll('[data-slot="compare-sign-in"]'),
    ).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        name: "Sign in to see the rest of this comparison",
      }),
    ).toBeVisible();
    // The embedded phone-OTP form, the same one used everywhere else.
    expect(screen.getByLabelText(/mobile number/i)).toBeVisible();
  });

  it("unlocks every group and drops the sign-in prompt once signed in", () => {
    signedIn();
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );

    const groups = container.querySelectorAll('[data-slot="compare-group"]');
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group).toHaveAttribute("data-locked", "false");
    }
    expect(
      container.querySelectorAll('[data-slot="compare-row-locked"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-slot="compare-row"]').length,
    ).toBeGreaterThan(0);
    expect(
      container.querySelector('[data-slot="compare-sign-in"]'),
    ).not.toBeInTheDocument();
  });
});
