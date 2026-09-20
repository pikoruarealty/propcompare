import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReraState } from "@/lib/rera/submission-fetch";
import type { RegulatorRecord } from "@/lib/rera/types";
import { displayReraValue, ReraPanel } from "./rera-panel";

const record: RegulatorRecord = {
  regulatorCode: "gujrera",
  registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA10879/111122",
  externalProjectId: "17929",
  projectName: "The Kimana Towers",
  promoterName: "SUN VN DEVELOPERS LLP",
  promoterType: "LIMITED LIABILITY PARTNERSHIP FIRM",
  projectType: "Residential/Group Housing",
  registeredFrom: "2022-06-21",
  completionDate: "2027-04-30",
  district: "Ahmedabad",
  address: null,
  totalUnits: 76,
  constructionProgressPercent: 67.71875,
  projectDescription: "Residential Apartments",
  pincode: null,
  landAreaSqm: 7628,
  coveredParkingSlots: 246,
  blocks: [{ name: "A+B", slabs: 24 }],
  declaredAmenityKeys: [],
  carpetGroups: [],
  latestQuarter: {
    name: "Q-14",
    periodEndsOn: "2026-06-30",
    dueOn: "2026-07-07",
    submittedOn: "2026-07-03",
    status: "SUBMITTED",
  },
  sourceUrl: "https://gujrera.gujarat.gov.in/",
  fetchedAt: "2026-09-20T06:00:00.000Z",
  gaps: [],
};

const empty: ReraState = {
  registrationNumber: null,
  lastFetch: null,
  comparison: [],
};

const fetched = (
  comparison: ReraState["comparison"],
  overrides: Partial<RegulatorRecord> = {},
): ReraState => ({
  registrationNumber: record.registrationNumber,
  lastFetch: {
    jobId: "job-1",
    fetchedAt: "2026-09-20T06:00:00.000Z",
    record: { ...record, ...overrides },
  },
  comparison,
});

const item = (
  fieldKey: string,
  label: string,
  reraValue: string | number | null,
  currentValue: string | number | null,
  status: ReraState["comparison"][number]["status"],
) => ({
  fieldKey,
  label,
  reraValue,
  proposedValue: reraValue,
  currentValue,
  status,
});

const renderPanel = (
  rera: ReraState,
  options: {
    editable?: boolean;
    onFetch?: (n: string) => Promise<string | null>;
    onApply?: (id: string) => Promise<string | null>;
  } = {},
) =>
  render(
    <ReraPanel
      rera={rera}
      editable={options.editable ?? true}
      pending={false}
      onFetch={options.onFetch ?? (async () => null)}
      onApply={options.onApply ?? (async () => null)}
    />,
  );

describe("displayReraValue", () => {
  it("reads dates, percentages and gaps as a person would", () => {
    expect(displayReraValue("property.possession_date", "2027-04-30")).toBe(
      "30 Apr 2027",
    );
    expect(
      displayReraValue("property.rera_construction_progress_percent", 67.5),
    ).toBe("67.5%");
    expect(displayReraValue("property.name", null)).toBe("—");
    expect(displayReraValue("property.total_units", 76)).toBe("76");
  });
});

describe("ReraPanel — before a fetch", () => {
  it("asks for a number and fetches exactly what was typed", async () => {
    const onFetch = vi.fn(async () => null);
    renderPanel(empty, { onFetch });

    expect(screen.getByText(/No RERA record fetched yet/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Fetch from RERA" });
    expect(button).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("Registration number"),
      "PR/GJ/TEST/1",
    );
    await userEvent.click(button);

    expect(onFetch).toHaveBeenCalledWith("PR/GJ/TEST/1");
  });

  it("starts from the registration number the submission already holds", () => {
    renderPanel({ ...empty, registrationNumber: "PR/GJ/HELD/9" });

    expect(screen.getByLabelText("Registration number")).toHaveValue(
      "PR/GJ/HELD/9",
    );
  });

  it("shows a fetch failure in words and keeps the number typed", async () => {
    renderPanel(empty, {
      onFetch: async () =>
        "GujRERA has no registered project with that number.",
    });
    await userEvent.type(
      screen.getByLabelText("Registration number"),
      "PR/GJ/X",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Fetch from RERA" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no registered project",
    );
    expect(screen.getByLabelText("Registration number")).toHaveValue("PR/GJ/X");
  });

  it("offers no fetch once the submission can no longer be edited", () => {
    renderPanel(empty, { editable: false });

    expect(screen.queryByLabelText("Registration number")).toBeNull();
    expect(screen.getByText(/No RERA record was fetched/i)).toBeInTheDocument();
  });
});

describe("ReraPanel — a fetched record", () => {
  const comparison = [
    item(
      "property.name",
      "Property name",
      "The Kimana Towers",
      "THE KIMANA TOWERS",
      "differs",
    ),
    item("property.total_units", "Total units", 76, null, "not_held"),
    item(
      "property.possession_date",
      "Possession date",
      "2027-04-30",
      "2027-04-30",
      "same",
    ),
    item(
      "property.rera_construction_progress_percent",
      "Construction progress (%)",
      null,
      50,
      "rera_silent",
    ),
  ];

  it("shows the record and each field beside what we hold", () => {
    renderPanel(fetched(comparison));

    const summary = document.querySelector("dl")!;
    expect(summary).toHaveTextContent("SUN VN DEVELOPERS LLP");
    expect(summary).toHaveTextContent("Completion date30 Apr 2027");
    expect(summary).toHaveTextContent(
      "Q-14, filed 3 Jul 2026 (due 7 Jul 2026)",
    );
    expect(summary).toHaveTextContent("20 Sept 2026");

    const rows = screen.getAllByRole("row").slice(1);
    const name = within(rows[0]);
    expect(name.getByText("THE KIMANA TOWERS")).toBeInTheDocument();
    expect(name.getByText("The Kimana Towers")).toBeInTheDocument();
    expect(name.getByText("Differs")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Not entered")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Matches")).toBeInTheDocument();
    expect(within(rows[3]).getByText("RERA silent")).toBeInTheDocument();
  });

  it("says which pieces RERA did not return", () => {
    renderPanel(fetched(comparison, { gaps: ["unit count"] }));

    expect(
      screen.getByText(/RERA did not return: unit count/),
    ).toBeInTheDocument();
  });

  it("asks before using RERA's values, then applies that fetch", async () => {
    const onApply = vi.fn(async () => null);
    renderPanel(fetched(comparison), { onApply });

    // Two fields would change: the differing name and the empty unit count.
    await userEvent.click(
      screen.getByRole("button", { name: "Use RERA values (2)" }),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(
      screen.getByText(/replacing anything entered by hand/i),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Use RERA values" }),
    );

    expect(onApply).toHaveBeenCalledWith("job-1");
  });

  it("says so when nothing would change, and offers no apply", () => {
    renderPanel(
      fetched([
        item(
          "property.name",
          "Property name",
          "The Kimana Towers",
          "The Kimana Towers",
          "same",
        ),
      ]),
    );

    expect(
      screen.getByText("Everything RERA states matches this submission."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Use RERA values/ }),
    ).toBeNull();
  });

  it("does not offer to apply on a submission that is no longer a draft", () => {
    renderPanel(fetched(comparison), { editable: false });

    expect(
      screen.queryByRole("button", { name: /Use RERA values/ }),
    ).toBeNull();
    expect(
      screen.getByText(/only be applied while the submission is a draft/i),
    ).toBeInTheDocument();
  });

  it("explains a promoter that matches no recorded legal entity", () => {
    renderPanel(
      fetched([
        {
          ...item(
            "property.legal_entity_id",
            "Promoter (legal entity)",
            "SUN VN DEVELOPERS LLP",
            null,
            "not_held",
          ),
          proposedValue: null,
          note: "None of this developer's recorded legal entities matches this promoter name. Add it on the developer page, then fetch again.",
        },
      ]),
    );

    expect(
      screen.getByText(/Add it on the developer page/),
    ).toBeInTheDocument();
    // Nothing can be written for it, so there is nothing to apply.
    expect(
      screen.queryByRole("button", { name: /Use RERA values/ }),
    ).toBeNull();
  });

  it("never shows a price", () => {
    renderPanel(fetched(comparison));

    expect(document.body.textContent).not.toMatch(
      /₹|\bINR\b|\bcost\b|\bprice\b/i,
    );
  });
});

describe("ReraPanel — carpet area by unit type", () => {
  const row = (overrides: Record<string, unknown>) => ({
    variantName: "Block A - 3rd Floor",
    currentSqft: null,
    reraSqft: 3977.7,
    groupLabel: "Block A: 3,978 sq ft (36 flats, A-301 to A-2002)",
    how: "nearest",
    roomsTotalSqft: 3980,
    roomsGap: 0,
    roomsGapFlagged: false,
    status: "not_held",
    note: null,
    ...overrides,
  });
  const carpetItem = (rows: unknown[]) =>
    ({
      fieldKey: "unit_variants",
      label: "Carpet area by unit type",
      reraValue: "2 carpet areas listed",
      proposedValue: [],
      currentValue: "0 of 2 unit types",
      status: "not_held",
      unitRows: rows,
      carpetGroups: [
        {
          block: "A",
          carpetAreaSqm: 369.54,
          flatCount: 36,
          firstFlat: "A-301",
          lastFlat: "A-2002",
        },
      ],
    }) as unknown as ReraState["comparison"][number];

  it("lists RERA's carpet areas, and each unit type beside what we hold and its rooms total", () => {
    renderPanel(
      fetched([
        carpetItem([
          row({}),
          row({
            variantName: "Block A Penthouse",
            reraSqft: 6163.31,
            roomsTotalSqft: 5268,
            roomsGap: -0.145,
            note: "Chosen as the nearest of 2 carpet areas in this block: check it.",
          }),
        ]),
      ]),
    );

    const section = document.querySelector('[data-slot="carpet-areas"]')!;
    expect(section).toHaveTextContent(
      "RERA lists Block A: 3,978 sq ft (36 flats, A-301 to A-2002)",
    );
    const rows = within(section as HTMLElement).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Block A - 3rd Floor");
    expect(rows[1]).toHaveTextContent("3,978 sq ft");
    expect(rows[2]).toHaveTextContent("6,163 sq ft");
    expect(rows[2]).toHaveTextContent("nearest of 2 carpet areas");
    expect(section).toHaveTextContent("never saved");
  });

  it("shows ordinary reading noise quietly and flags a large gap in words", () => {
    renderPanel(
      fetched([
        carpetItem([
          row({ roomsGap: -0.066 }),
          row({
            variantName: "Block A - Odd",
            roomsTotalSqft: 345,
            roomsGap: -0.91,
            roomsGapFlagged: true,
          }),
        ]),
      ]),
    );
    const gaps = document.querySelectorAll('[data-slot="rooms-gap"]');
    expect(gaps[0]).toHaveAttribute("data-flagged", "false");
    expect(gaps[0]).toHaveTextContent(
      "−7% against RERA: ordinary reading difference",
    );
    expect(gaps[1]).toHaveAttribute("data-flagged", "true");
    expect(gaps[1]).toHaveTextContent(
      "Rooms add up to 345 sq ft; RERA says 3,978 sq ft (−91%). Check the room sizes and their unit.",
    );
  });

  it("shows nothing when the record has no carpet areas and no unit types", () => {
    renderPanel(
      fetched([
        {
          ...carpetItem([]),
          carpetGroups: [],
          status: "rera_silent",
        } as ReraState["comparison"][number],
      ]),
    );
    expect(document.querySelector('[data-slot="carpet-areas"]')).toBeNull();
  });
});
