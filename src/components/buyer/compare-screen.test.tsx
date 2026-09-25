import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { lockComparison } from "@/lib/compare/lock";
import { buildComparison } from "@/lib/compare/model";
import { CompareScreen } from "./compare-screen";

/**
 * Comparison's depth gate (`DECISIONS.md` 2026-09-22 — supersedes "no sign-in
 * to compare"): the column identity block and the differences-first summary
 * are open to everyone; the row groups beneath them are locked, as skeleton
 * placeholders, until the buyer signs in. The gate is the server's
 * (`src/app/compare/page.tsx`): a signed-out visitor is handed only the locked
 * model, so that is what a signed-out render is given here. Data correctness of
 * the rows themselves is `compare.test.tsx`'s job (always rendered signed in
 * there); this file is only about what is visible in each state.
 */

const { useSession, replace } = vi.hoisted(() => ({
  useSession: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession,
    phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() },
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
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

const locked = () => lockComparison(buildComparison(two(), {}));

describe("CompareScreen — the sign-in gate", () => {
  it("shows the column identity, and the summary only as placeholders, to a signed-out visitor", () => {
    signedOut();
    const { container } = render(
      <CompareScreen locked={locked()} requested={{}} />,
    );

    expect(screen.getByText("Alpha Heights")).toBeVisible();
    expect(screen.getByText("Beta Residency")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "What changes between these choices",
      }),
    ).toBeVisible();
    // No summary line, and no "not enough is stated" either: that too would be a
    // statement about the two properties.
    expect(
      container.querySelector('[data-slot="compare-summary-line"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="compare-summary-locked"]'),
    ).not.toBeNull();
    expect(screen.queryByText(/Not enough is stated/)).toBeNull();
    expect(
      screen.getByRole("link", {
        name: "Sign in to see what changes if you choose one over the other",
      }),
    ).toHaveAttribute("href", "#compare-sign-in");
  });

  it("locks every row group behind a skeleton, with the real cells absent", () => {
    signedOut();
    const { container } = render(
      <CompareScreen locked={locked()} requested={{}} />,
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
      <CompareScreen locked={locked()} requested={{}} />,
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
      <CompareScreen locked={locked()} requested={{}} />,
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

  it("asks the server again for a different unit type, having no dossiers to recompute from", async () => {
    signedOut();
    replace.mockClear();
    const { container } = render(
      <CompareScreen locked={locked()} requested={{}} />,
    );

    const picker = container.querySelector<HTMLElement>(
      '[data-slot="compare-variant-picker"]',
    );
    if (picker === null) throw new Error("no unit type picker rendered");
    const other = within(picker)
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "false");
    if (!other) throw new Error("fixture has one unit type only");
    await userEvent.click(other);

    expect(replace).toHaveBeenCalledWith(
      expect.stringMatching(/^\/compare\?p=a,b&v=a~/),
    );
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

  it("closes a signed-in comparison with each project's photos, and opens one full size", async () => {
    signedIn();
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );

    const strips = container.querySelectorAll(
      '[data-slot="compare-photo-strip"]',
    );
    expect(strips).toHaveLength(2);
    // Photos only: the fixture's floor plan is not in the strip.
    expect(
      container.querySelectorAll('[data-slot="compare-photo-strip"] img'),
    ).toHaveLength(2);

    await userEvent.click(
      screen.getAllByRole("button", { name: /^Open Alpha Heights photo 1/ })[0],
    );
    expect(await screen.findByRole("dialog")).toBeVisible();
  });

  it("does not send a signed-out visitor the photo strip", () => {
    signedOut();
    const { container } = render(
      <CompareScreen locked={locked()} requested={{}} />,
    );
    expect(
      container.querySelector('[data-slot="compare-photos"]'),
    ).not.toBeInTheDocument();
  });

  it("shows a photo of the building, not a floor plan, as each column's plate", () => {
    signedIn();
    const withPlanFirst = two().map((dossier) => ({
      ...dossier,
      media: [
        {
          ...dossier.media[1],
          id: "plan-first",
          isPrimary: false,
        },
        { ...dossier.media[0], isPrimary: false },
      ],
    }));
    const { container } = render(
      <CompareScreen dossiers={withPlanFirst} requested={{}} />,
    );
    const plates = container.querySelectorAll(
      '[data-slot="compare-plates"] img',
    );
    expect(plates).toHaveLength(2);
    for (const plate of plates) {
      expect(plate.getAttribute("src")).toContain(
        "eeeeeeee-1111-4111-8111-eeeeeeeeeeee",
      );
    }
  });
});

describe("CompareScreen, the plate carousel", () => {
  const manyPhotos = () =>
    two().map((dossier, side) => ({
      ...dossier,
      media: [
        ...[1, 2, 3].map((n) => ({
          ...dossier.media[0],
          id: `photo-${side}-${n}`,
          isPrimary: n === 1,
        })),
      ],
    }));

  it("shows one picture with a count and arrows when a project has more photos", async () => {
    signedIn();
    const user = userEvent.setup();
    const { container } = render(
      <CompareScreen dossiers={manyPhotos()} requested={{}} />,
    );
    const plate = container.querySelector(
      '[data-slot="compare-plates"] [data-slot="compare-plate"]',
    ) as HTMLElement;

    expect(plate.querySelectorAll("img")).toHaveLength(1);
    expect(plate.querySelector("img")?.getAttribute("src")).toContain(
      "photo-0-1",
    );
    expect(within(plate).getByText("1 / 3")).toBeInTheDocument();

    await user.click(
      within(plate).getByRole("button", { name: /Next photo of Alpha/ }),
    );
    expect(plate.querySelector("img")?.getAttribute("src")).toContain(
      "photo-0-2",
    );
    expect(within(plate).getByText("2 / 3")).toBeInTheDocument();

    await user.click(
      within(plate).getByRole("button", { name: /Previous photo of Alpha/ }),
    );
    await user.click(
      within(plate).getByRole("button", { name: /Previous photo of Alpha/ }),
    );
    expect(within(plate).getByText("3 / 3")).toBeInTheDocument();
  });

  it("has no arrows on a project with a single picture", () => {
    signedIn();
    const { container } = render(
      <CompareScreen dossiers={two()} requested={{}} />,
    );
    const plate = container.querySelector(
      '[data-slot="compare-plates"] [data-slot="compare-plate"]',
    ) as HTMLElement;

    expect(within(plate).queryByRole("button")).toBeNull();
  });

  it("is a single picture, without arrows, for a signed-out visitor", () => {
    signedOut();
    const { container } = render(
      <CompareScreen locked={locked()} requested={{}} />,
    );

    expect(
      container.querySelector('[data-slot="compare-plates"] button'),
    ).toBeNull();
  });
});

describe("CompareScreen, the locked rows", () => {
  it("draws locked values as shimmering bars", () => {
    signedOut();
    const { container } = render(
      <CompareScreen locked={locked()} requested={{}} />,
    );

    expect(
      container.querySelectorAll('[data-slot="compare-row-locked"] .lock-bar')
        .length,
    ).toBeGreaterThan(0);
  });
});
