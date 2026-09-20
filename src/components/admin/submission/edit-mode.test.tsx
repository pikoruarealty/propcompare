import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { SubmissionWorkbench } from "../submission-workbench";
import { FieldsPanel } from "./fields-panel";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const available = [
  { fieldKey: "property.name", label: "Property name", dataType: "string" },
  {
    fieldKey: "property.locality",
    label: "Locality",
    dataType: "locality_name",
  },
  {
    fieldKey: "property.total_units",
    label: "Total units",
    dataType: "positive_integer",
  },
  {
    fieldKey: "property.possession_date",
    label: "Possession date",
    dataType: "date",
  },
  {
    fieldKey: "developer.name",
    label: "Developer name",
    dataType: "string",
  },
  {
    fieldKey: "property.specifications.flooring",
    label: "Flooring",
    dataType: "specification_text",
  },
  {
    fieldKey: "property.amenities",
    label: "Amenities",
    dataType: "amenity_key_array",
  },
  {
    fieldKey: "unit_variants",
    label: "Unit configurations",
    dataType: "unit_variant_array",
  },
];

const candidate = (fieldKey: string, dataType: string, value: unknown) => ({
  fieldKey,
  label: fieldKey,
  dataType,
  value,
  confidence: null,
  reviewStatus: "confirmed",
  evidence: [],
});

const base = {
  id: "s1",
  status: "draft",
  source: "manual_form",
  developerName: "Sun VN Developers LLP",
  propertyName: "The Kimana Towers",
  city: null,
  locality: null,
  fieldCount: 0,
  needsReviewCount: 0,
  submittedAt: null,
  createdAt: new Date("2026-09-20"),
  developerId: "d1",
  extraction: null,
  availableFields: available,
  lookups: {
    propertyTypes: [],
    amenities: [
      { key: "gymnasium", label: "Gymnasium", category: "Wellness" },
      { key: "clubhouse", label: "Clubhouse", category: "Social" },
    ],
    bhkTypes: [{ key: "3bhk", label: "3 BHK" }],
    layoutTypes: [],
    legalEntities: [],
  },
  media: [],
  rera: { registrationNumber: null, lastFetch: null, comparison: [] },
  versions: [],
};

const editing = (overrides: Partial<SubmissionDetail> = {}) =>
  ({
    ...base,
    propertyId: "p1",
    live: {
      "property.name": "THE KIMANA TOWERS",
      "property.total_units": 76,
      "property.amenities": ["gymnasium"],
      unit_variants: [
        {
          variantName: "Type A",
          bhkTypeKey: "3bhk",
          totalUnitsOfVariant: 20,
          areas: [{ basis: "carpet", areaSqft: 1200 }],
        },
      ],
    },
    fields: [candidate("property.possession_date", "date", "2027-04-30")],
    ...overrides,
  }) as unknown as SubmissionDetail;

const panel = (submission: SubmissionDetail, editable = true) =>
  render(
    <FieldsPanel
      submission={submission}
      editable={editable}
      inReview={false}
      pending={false}
      onSave={async () => null}
      onReview={() => {}}
    />,
  );

/** The list row for a field. A label can also be a group heading, so look for the
 * occurrence that sits inside a row. */
const rowOf = (label: string) => {
  const row = screen
    .getAllByText(label)
    .map((element) => element.closest("li"))
    .find((element): element is HTMLLIElement => element !== null);
  if (!row) throw new Error(`no row ${label}`);
  return within(row);
};

describe("an edit of a published property — the fields", () => {
  it("shows the published value with a small Unchanged mark, not 'Not stated'", () => {
    panel(editing());

    const name = rowOf("Property name");
    expect(name.getByText("THE KIMANA TOWERS")).toBeInTheDocument();
    expect(name.getByText("Unchanged")).toBeInTheDocument();
    expect(name.queryByText("Not stated")).toBeNull();
    expect(name.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("shows the real amenities and unit types too, not a sentence about them", () => {
    panel(editing());

    const amenities = rowOf("Amenities");
    expect(amenities.getByText(/Gymnasium/)).toBeInTheDocument();
    expect(amenities.getByText("Unchanged")).toBeInTheDocument();
    const units = rowOf("Unit configurations");
    expect(units.getByText(/Type A/)).toBeInTheDocument();
    expect(units.getByText("Unchanged")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Keeps what is published/);
  });

  it("marks a proposed change as Changed, and not Unchanged", () => {
    panel(
      editing({
        fields: [candidate("property.total_units", "positive_integer", 80)],
      }),
    );

    const units = rowOf("Total units");
    expect(units.getByText("Changed")).toBeInTheDocument();
    expect(units.queryByText("Unchanged")).toBeNull();
  });

  it("starts an edit from the published value, never blank", async () => {
    panel(editing());

    await userEvent.click(
      within(
        rowOf("Total units")
          .getByRole("button", { name: "Edit" })
          .closest("li")!,
      ).getByRole("button", { name: "Edit" }),
    );

    expect(screen.getByRole("textbox")).toHaveValue("76");
  });

  it("says what an edit of unit types can and cannot do", async () => {
    panel(editing());

    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );

    expect(screen.getByText(/cannot be removed yet/i)).toBeInTheDocument();
    // The editor holds the published type, not an empty form.
    expect(screen.getByDisplayValue("Type A")).toBeInTheDocument();
  });

  it("locks the name of a published unit type and offers no way to remove it", async () => {
    panel(editing());
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );

    expect(screen.getByPlaceholderText(/3 BHK/)).toBeDisabled();
    expect(screen.getByText(/name is fixed/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove this unit type/ }),
    ).toBeNull();
  });

  it("lets a new unit type be added, renamed and removed, and selects it", async () => {
    panel(editing());
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Add a unit type/ }),
    );
    expect(
      screen.getByRole("tab", { name: "New unit type", selected: true }),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText(/3 BHK/), "Type C");
    expect(screen.getByRole("tab", { name: "Type C" })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Remove this unit type/ }),
    );
    expect(screen.queryByRole("tab", { name: "Type C" })).toBeNull();
    // Back on the published type.
    expect(
      screen.getByRole("tab", { name: "Type A", selected: true }),
    ).toBeInTheDocument();
  });

  it("edits a room's dimensions in the Rooms tab and saves them with the type", async () => {
    const onSave = vi.fn(async () => null);
    render(
      <FieldsPanel
        submission={editing({
          live: {
            unit_variants: [
              {
                variantName: "Type A",
                bhkTypeKey: "3bhk",
                totalUnitsOfVariant: 20,
                dimensions: {
                  rooms: [
                    { name: "Living", lengthFt: 16, widthFt: 12 },
                    { name: "Bedroom", lengthFt: 12, widthFt: 11 },
                  ],
                  foyer: { name: "Foyer", lengthFt: 6, widthFt: 5 },
                },
              },
            ],
          },
        } as Partial<SubmissionDetail>)}
        editable
        inReview={false}
        pending={false}
        onSave={onSave}
        onReview={() => {}}
      />,
    );
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );

    await userEvent.click(screen.getByRole("tab", { name: /Rooms/ }));
    // The published rooms are all there, ready to change.
    expect(screen.getByLabelText("Rooms 1 name")).toHaveValue("Living");
    expect(screen.getByLabelText("Rooms 2 length (ft)")).toHaveValue("12");
    expect(screen.getByLabelText("Foyer 1 name")).toHaveValue("Foyer");

    await userEvent.clear(screen.getByLabelText("Rooms 2 length (ft)"));
    await userEvent.type(screen.getByLabelText("Rooms 2 length (ft)"), "13.5");
    await userEvent.click(
      screen.getByRole("button", { name: "Add a balcony" }),
    );
    await userEvent.type(screen.getByLabelText("Balconies 1 name"), "Balcony");
    await userEvent.type(
      screen.getByLabelText("Balconies 1 length (ft)"),
      "10",
    );
    await userEvent.type(screen.getByLabelText("Balconies 1 width (ft)"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("unit_variants", [
      {
        variantName: "Type A",
        bhkTypeKey: "3bhk",
        totalUnitsOfVariant: 20,
        dimensions: {
          rooms: [
            { name: "Living", lengthFt: 16, widthFt: 12 },
            { name: "Bedroom", lengthFt: 13.5, widthFt: 11 },
          ],
          balconies: [{ name: "Balcony", lengthFt: 10, widthFt: 4 }],
          foyer: { name: "Foyer", lengthFt: 6, widthFt: 5 },
        },
      },
    ]);
  });

  it("removes a room from the listing when its row is removed", async () => {
    const onSave = vi.fn(async () => null);
    render(
      <FieldsPanel
        submission={editing({
          live: {
            unit_variants: [
              {
                variantName: "Type A",
                dimensions: {
                  rooms: [
                    { name: "Living", lengthFt: 16, widthFt: 12 },
                    { name: "Study", lengthFt: 10, widthFt: 9 },
                  ],
                },
              },
            ],
          },
        } as Partial<SubmissionDetail>)}
        editable
        inReview={false}
        pending={false}
        onSave={onSave}
        onReview={() => {}}
      />,
    );
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: /Rooms/ }));

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Rooms 2" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("unit_variants", [
      {
        variantName: "Type A",
        dimensions: { rooms: [{ name: "Living", lengthFt: 16, widthFt: 12 }] },
      },
    ]);
  });

  it("says in words when a room has no measurement", async () => {
    panel(editing());
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: /Rooms/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add a room" }));
    await userEvent.type(screen.getByLabelText("Rooms 1 name"), "Study");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Study needs a length and width, or an area/,
    );
  });

  it("keeps a published amenity when its box is unticked, and says why", async () => {
    const onSave = vi.fn(async () => null);
    render(
      <FieldsPanel
        submission={editing({
          lookups: {
            propertyTypes: [],
            amenities: [
              { key: "gymnasium", label: "Gymnasium", category: "Wellness" },
              { key: "clubhouse", label: "Clubhouse", category: "Social" },
            ],
            bhkTypes: [{ key: "3bhk", label: "3 BHK" }],
            layoutTypes: [],
            legalEntities: [],
          },
        } as Partial<SubmissionDetail>)}
        editable
        inReview={false}
        pending={false}
        onSave={onSave}
        onReview={() => {}}
      />,
    );
    await userEvent.click(
      rowOf("Amenities").getByRole("button", { name: "Edit" }),
    );
    expect(screen.getByText(/unticking it has no effect/i)).toBeInTheDocument();
    // Untick the published one, tick another, save.
    await userEvent.click(screen.getByRole("checkbox", { name: /Gymnasium/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Clubhouse/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("property.amenities", [
      "gymnasium",
      "clubhouse",
    ]);
  });

  it("still says 'Not stated' for a simple field the property really lacks", () => {
    panel(editing());

    const locality = rowOf("Locality");
    expect(locality.getByText("Not stated")).toBeInTheDocument();
    expect(locality.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("shows the published value beside a proposed change", () => {
    panel(
      editing({
        fields: [candidate("property.total_units", "positive_integer", 80)],
      }),
    );

    const units = rowOf("Total units");
    expect(units.getByText("80")).toBeInTheDocument();
    expect(units.getByText(/Currently published: 76/)).toBeInTheDocument();
  });

  it("says nothing about a published value when the proposal equals it", () => {
    panel(
      editing({
        fields: [candidate("property.total_units", "positive_integer", 76)],
      }),
    );

    expect(rowOf("Total units").queryByText(/Currently published/)).toBeNull();
  });

  it("flags a value that differs from RERA, beside the value", () => {
    render(
      <FieldsPanel
        submission={editing()}
        reraDifferences={{
          "property.possession_date": {
            fieldKey: "property.possession_date",
            label: "Possession date",
            reraValue: "2027-06-30",
            proposedValue: "2027-06-30",
            currentValue: "2027-04-30",
            status: "differs",
          },
        }}
        editable
        inReview={false}
        pending={false}
        onSave={async () => null}
        onReview={() => {}}
      />,
    );

    expect(
      rowOf("Possession date").getByText(
        "Differs from RERA. RERA says 30 Jun 2027.",
      ),
    ).toBeInTheDocument();
  });

  it("leaves a new property's fields as they were: Not stated, no live text", () => {
    panel(
      editing({
        propertyId: null,
        live: {},
        fields: [],
      } as Partial<SubmissionDetail>),
    );

    expect(screen.getAllByText("Not stated").length).toBeGreaterThan(3);
    expect(screen.queryByText(/Currently published/)).toBeNull();
    expect(screen.queryByText(/Unchanged/)).toBeNull();
  });
});

describe("the tabs of the edit screen", () => {
  const renderScreen = (submission: SubmissionDetail) =>
    render(
      <SubmissionWorkbench
        submission={submission}
        media={[]}
        permissionLevel="owner"
      />,
    );

  it("groups the screen into tabs instead of one long page", () => {
    renderScreen(editing());

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "RERA",
      "Project",
      "Developer",
      "Amenities",
      "Specifications",
      "Unit types",
      "Images",
    ]);
  });

  it("opens on Project and shows only that tab's fields", () => {
    renderScreen(editing());

    expect(
      screen.getByRole("tab", { name: "Project", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Property name")).toBeVisible();
    // Other tabs are in the page but hidden.
    expect(screen.getByText("Unit configurations")).not.toBeVisible();
    expect(screen.getByText("RERA record")).not.toBeVisible();
  });

  it("switches tab and shows that tab's content", async () => {
    renderScreen(editing());

    await userEvent.click(screen.getByRole("tab", { name: "Unit types" }));

    expect(screen.getByText("Unit configurations")).toBeVisible();
    expect(screen.getByText("Property name")).not.toBeVisible();
  });

  it("moves between tabs with the arrow keys", async () => {
    renderScreen(editing());
    screen.getByRole("tab", { name: "Project" }).focus();

    await userEvent.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("tab", { name: "Developer", selected: true }),
    ).toBeInTheDocument();
  });

  it("keeps a half-edited field when another tab is opened and closed", async () => {
    renderScreen(editing());
    await userEvent.click(
      rowOf("Total units").getByRole("button", { name: "Edit" }),
    );
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "99");

    await userEvent.click(screen.getByRole("tab", { name: "Amenities" }));
    await userEvent.click(screen.getByRole("tab", { name: "Project" }));

    expect(screen.getByRole("textbox")).toHaveValue("99");
  });

  it("counts values still to review on the tab that holds them", () => {
    renderScreen(
      editing({
        status: "in_review",
        fields: [
          {
            ...candidate("property.total_units", "positive_integer", 80),
            reviewStatus: "needs_review",
          },
          {
            ...candidate("property.possession_date", "date", "2027-04-30"),
            reviewStatus: "needs_review",
          },
          {
            ...candidate("property.amenities", "amenity_key_array", [
              "gymnasium",
            ]),
            reviewStatus: "needs_review",
          },
        ],
      } as Partial<SubmissionDetail>),
    );

    expect(screen.getByRole("tab", { name: /Project/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Amenities/ })).toHaveTextContent(
      "1",
    );
    expect(
      screen.getByRole("tab", { name: /Developer/ }),
    ).not.toHaveTextContent(/d/);
    // One "confirm all" bar above the tabs, counting all three.
    expect(screen.getByText("Confirm all 3 remaining")).toBeInTheDocument();
  });

  it("shows how many values differ from RERA on the RERA tab", () => {
    renderScreen(
      editing({
        rera: {
          registrationNumber: null,
          lastFetch: null,
          comparison: [
            {
              fieldKey: "property.total_units",
              label: "Total units",
              reraValue: 76,
              proposedValue: 76,
              currentValue: 80,
              status: "differs",
            },
          ],
        },
      } as Partial<SubmissionDetail>),
    );

    expect(screen.getByRole("tab", { name: /RERA/ })).toHaveTextContent("1");
  });
});

describe("the versions of a property", () => {
  const versions = [
    {
      id: "s0",
      status: "published",
      kind: "original",
      createdAt: new Date("2026-09-19T10:00:00Z"),
    },
    {
      id: "s1",
      status: "published",
      kind: "edit",
      createdAt: new Date("2026-09-20T10:00:00Z"),
    },
  ];

  it("lists the original and each edit, links the others, and marks the current one", () => {
    render(
      <SubmissionWorkbench
        submission={editing({
          id: "s1",
          status: "published",
          versions,
        } as Partial<SubmissionDetail>)}
        media={[]}
        permissionLevel="owner"
      />,
    );

    const list = screen
      .getByRole("heading", { name: "Versions of this property" })
      .closest("section")!;
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Original");
    expect(
      within(items[0]).getByRole("link", { name: "Open" }),
    ).toHaveAttribute("href", "/admin/submissions/s0");
    expect(items[1]).toHaveTextContent("Edit");
    expect(items[1]).toHaveTextContent("You are here");
  });

  it("is not shown for a property with a single version or a new property", () => {
    render(
      <SubmissionWorkbench
        submission={editing({
          versions: [versions[0]],
        } as Partial<SubmissionDetail>)}
        media={[]}
        permissionLevel="owner"
      />,
    );

    expect(screen.queryByText("Versions of this property")).toBeNull();
  });
});

describe("starting an edit of a published property", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  const renderWorkbench = (submission: SubmissionDetail) =>
    render(
      <SubmissionWorkbench
        submission={submission}
        media={[]}
        permissionLevel="owner"
      />,
    );

  it("offers the edit only on a published property", () => {
    renderWorkbench(editing({ status: "published" }));
    expect(
      screen.getByRole("button", { name: "Edit this property" }),
    ).toBeInTheDocument();
  });

  it("does not offer it on a draft, a new property, or a property still being edited", () => {
    const view = renderWorkbench(editing({ status: "draft" }));
    expect(
      screen.queryByRole("button", { name: "Edit this property" }),
    ).toBeNull();
    // The banner explains the situation instead.
    expect(
      screen.getByText(/editing a property that is live/i),
    ).toBeInTheDocument();
    view.unmount();

    renderWorkbench(editing({ status: "published", propertyId: null }));
    expect(
      screen.queryByRole("button", { name: "Edit this property" }),
    ).toBeNull();
  });

  it("creates the edit and goes to it", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ submissionId: "new-edit" }), {
          status: 201,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWorkbench(editing({ status: "published" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Edit this property" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/properties/p1/edits",
      { method: "POST" },
    );
    expect(push).toHaveBeenCalledWith("/admin/submissions/new-edit");
  });

  it("goes to the edit already open instead of failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              submissionId: "open-edit",
              error: { code: "edit_already_open", message: "In progress." },
            }),
            { status: 409 },
          ),
      ),
    );
    renderWorkbench(editing({ status: "published" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Edit this property" }),
    );

    expect(push).toHaveBeenCalledWith("/admin/submissions/open-edit");
  });

  it("says so when it could not start, and stays put", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "forbidden",
                message: "Admin access is required.",
              },
            }),
            { status: 403 },
          ),
      ),
    );
    renderWorkbench(editing({ status: "published" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Edit this property" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Admin access is required.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
