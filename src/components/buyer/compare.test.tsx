import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { buildComparison } from "@/lib/compare/model";
import { CompareScreen } from "./compare-screen";
import { CompareToggle } from "./compare-toggle";
import { CompareTray } from "./compare-tray";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const two = () => {
  const a = { ...richDossierFixture, slug: "a", name: "Alpha Heights" };
  const b = {
    ...richDossierFixture,
    slug: "b",
    name: "Beta Residency",
    possession: {
      ...richDossierFixture.possession,
      possessionDate: "2029-01-31",
    },
    unitVariants: richDossierFixture.unitVariants.map((v) => ({
      ...v,
      areas: v.areas.map((area) => ({
        ...area,
        areaSqft: String(Number(area.areaSqft) + 300),
      })),
    })),
  };
  return [a, b];
};

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
});

describe("the Compare toggle and the tray", () => {
  it("adds properties to the tray, which opens the comparison at two", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CompareToggle slug="a" name="Alpha Heights" mediaId={null} />
        <CompareToggle slug="b" name="Beta Residency" mediaId="m1" />
        <CompareTray />
      </>,
    );
    expect(screen.queryByRole("complementary")).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "Add Alpha Heights to the comparison",
      }),
    );
    const tray = screen.getByRole("complementary", {
      name: "Properties to compare",
    });
    expect(
      within(tray).getByText("Add one more to compare."),
    ).toBeInTheDocument();
    expect(within(tray).queryByRole("link")).toBeNull();

    await user.click(
      screen.getByRole("button", {
        name: "Add Beta Residency to the comparison",
      }),
    );
    expect(
      within(tray).getByRole("link", { name: "Compare (2)" }),
    ).toHaveAttribute("href", "/compare?p=a,b");
    expect(
      JSON.parse(window.localStorage.getItem("propcompare.compare.v1")!),
    ).toHaveLength(2);
  });

  it("removes a property, and the tray goes away with the last one", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CompareToggle slug="a" name="Alpha Heights" mediaId={null} />
        <CompareTray />
      </>,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Add Alpha Heights to the comparison",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Remove Alpha Heights from the comparison",
      }),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("refuses a fourth property, and says why", async () => {
    const user = userEvent.setup();
    const names = ["One", "Two", "Three", "Four"];
    render(
      <>
        {names.map((name) => (
          <CompareToggle
            key={name}
            slug={name.toLowerCase()}
            name={name}
            mediaId={null}
          />
        ))}
      </>,
    );
    for (const name of names.slice(0, 3)) {
      await user.click(
        screen.getByRole("button", { name: `Add ${name} to the comparison` }),
      );
    }
    const fourth = screen.getByRole("button", {
      name: "Add Four to the comparison",
    });
    expect(fourth).toBeDisabled();
    expect(fourth).toHaveAttribute("title", expect.stringContaining("up to 3"));
  });

  it("copes with storage that holds junk or throws", () => {
    window.localStorage.setItem("propcompare.compare.v1", "{not json");
    render(<CompareTray />);
    expect(screen.queryByRole("complementary")).toBeNull();

    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    act(() => {
      window.dispatchEvent(new Event("propcompare:compare-changed"));
    });
    expect(screen.queryByRole("complementary")).toBeNull();
    spy.mockRestore();
  });
});

describe("the comparison screen", () => {
  it("says what changes first, then only the rows that differ, and how many identical facts are hidden", async () => {
    const user = userEvent.setup();
    const model = buildComparison(two());
    render(<CompareScreen dossiers={two()} requested={{}} />);

    const summary = screen.getByRole("region", {
      name: "What changes between these choices",
    });
    expect(within(summary).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/identical facts? (is|are) hidden/),
    ).toBeInTheDocument();
    const before = document.querySelectorAll(
      '[data-slot="compare-row"]',
    ).length;
    expect(
      document.querySelectorAll(
        '[data-slot="compare-row"][data-status="same"]',
      ),
    ).toHaveLength(0);

    await user.click(screen.getByLabelText("Show only differences"));
    expect(document.querySelectorAll('[data-slot="compare-row"]').length).toBe(
      before + model.identicalRows,
    );
  });

  it("says plainly when a fact is not stated", () => {
    const a = { ...richDossierFixture, slug: "a", name: "Alpha" };
    const b = {
      ...richDossierFixture,
      slug: "b",
      name: "Beta",
      unitVariants: [{ ...richDossierFixture.unitVariants[0], areas: [] }],
    };
    render(<CompareScreen dossiers={[a, b]} requested={{}} />);
    expect(screen.getAllByText("Not stated").length).toBeGreaterThan(0);
  });

  it("switches a property's unit type inside the table at once, and puts it in the address", async () => {
    const user = userEvent.setup();
    const dossiers = two();
    render(<CompareScreen dossiers={dossiers} requested={{}} />);

    const [first, second] = dossiers[1].unitVariants;
    const carpetRow = () =>
      document.querySelector(
        '[data-slot="compare-row"]:has([data-slot="compare-cell"])',
      )!;
    expect(carpetRow()).toBeTruthy();

    const picker = document.querySelectorAll(
      '[data-slot="compare-variant-picker"]',
    )[1] as HTMLElement;
    const chips = within(picker).getAllByRole("button");
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);

    await user.click(chips[1]);

    expect(chips[1]).toHaveAttribute("aria-pressed", "true");
    expect(chips[0]).toHaveAttribute("aria-pressed", "false");
    expect(push).not.toHaveBeenCalled();
    expect(decodeURIComponent(window.location.search)).toBe(
      `?p=a,b&v=b~${second.id}`,
    );
    expect(first.id).not.toBe(second.id);
  });

  it("uses a menu instead of chips when a property has more than three unit types", () => {
    const many = {
      ...richDossierFixture,
      slug: "m",
      name: "Many Types",
      unitVariants: ["A", "B", "C", "D"].map((name, i) => ({
        ...richDossierFixture.unitVariants[0],
        id: `v${i}`,
        variantName: `Type ${name}`,
      })),
    };
    render(
      <CompareScreen
        dossiers={[{ ...richDossierFixture, slug: "a", name: "Alpha" }, many]}
        requested={{}}
      />,
    );
    const pickers = document.querySelectorAll(
      '[data-slot="compare-variant-picker"]',
    );
    expect(
      within(pickers[1] as HTMLElement).getByRole("combobox"),
    ).toBeInTheDocument();
    expect(
      within(pickers[0] as HTMLElement).queryByRole("combobox"),
    ).toBeNull();
  });

  it("drops a property at once when three are compared, and leaves the page for the empty state at fewer than two", async () => {
    const user = userEvent.setup();
    const three = [
      ...two(),
      { ...richDossierFixture, slug: "c", name: "Gamma Court" },
    ];
    const { unmount } = render(
      <CompareScreen dossiers={three} requested={{}} />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Remove Gamma Court from the comparison",
      }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText("Gamma Court")).toBeNull();
    expect(decodeURIComponent(window.location.search)).toBe("?p=a,b");

    await user.click(
      screen.getByRole("button", {
        name: "Remove Alpha Heights from the comparison",
      }),
    );
    expect(push).toHaveBeenLastCalledWith("/compare?p=b");
    unmount();
  });

  it("collapses and expands each section, and all of them", async () => {
    const user = userEvent.setup();
    render(<CompareScreen dossiers={two()} requested={{}} />);

    const first = document.querySelector('[data-slot="compare-group"]')!;
    const header = within(first as HTMLElement).getAllByRole("button")[0];
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(
      first.querySelectorAll('[data-slot="compare-row"]').length,
    ).toBeGreaterThan(0);

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(first.querySelectorAll('[data-slot="compare-row"]')).toHaveLength(0);

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");

    await user.click(
      screen.getByRole("button", { name: "Collapse all sections" }),
    );
    expect(document.querySelectorAll('[data-slot="compare-row"]')).toHaveLength(
      0,
    );
    await user.click(
      screen.getByRole("button", { name: "Expand all sections" }),
    );
    expect(
      document.querySelectorAll('[data-slot="compare-row"]').length,
    ).toBeGreaterThan(0);
  });

  it("offers pickers for which two to show on a phone when three are compared", () => {
    const three = [
      ...two(),
      { ...richDossierFixture, slug: "c", name: "Gamma Court" },
    ];
    render(<CompareScreen dossiers={three} requested={{}} />);
    expect(screen.getByLabelText("First property")).toBeInTheDocument();
    expect(screen.getByLabelText("Second property")).toBeInTheDocument();
  });
});
