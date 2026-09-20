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
  publishedMedia: [],
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

    expect(
      screen.getByText(/removing one hides it from buyers/i),
    ).toBeInTheDocument();
    // The editor holds the published type, not an empty form.
    expect(screen.getByDisplayValue("Type A")).toBeInTheDocument();
  });

  it("locks the name of a published unit type, but lets it be removed", async () => {
    panel(editing());
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );

    expect(screen.getByPlaceholderText(/3 BHK/)).toBeDisabled();
    expect(screen.getByText(/name is fixed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Remove this unit type/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hidden from buyers when this is/i),
    ).toBeInTheDocument();
  });

  it("sends a removed published unit type as a removal, keeping the rest", async () => {
    const onSave = vi.fn(async () => null);
    render(
      <FieldsPanel
        submission={editing({
          live: {
            unit_variants: [
              { variantName: "Type A", bhkTypeKey: "3bhk" },
              { variantName: "Type B", bhkTypeKey: "3bhk" },
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
    await userEvent.click(screen.getByRole("tab", { name: "Type B" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Remove this unit type/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(1, "unit_variants", [
      { variantName: "Type A", bhkTypeKey: "3bhk" },
    ]);
    expect(onSave).toHaveBeenNthCalledWith(2, "unit_variants_removed", [
      "Type B",
    ]);
  });

  it("sends an empty removal list when nothing was removed, so a stale one is cleared", async () => {
    const onSave = vi.fn(async () => null);
    render(
      <FieldsPanel
        submission={editing({
          live: { unit_variants: [{ variantName: "Type A" }] },
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
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenNthCalledWith(2, "unit_variants_removed", []);
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

  it("takes an amenity off the listing when its box is unticked", async () => {
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
    expect(screen.getByText(/Untick one to take it off/i)).toBeInTheDocument();
    // Untick the published one, tick another, save.
    await userEvent.click(screen.getByRole("checkbox", { name: /Gymnasium/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Clubhouse/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenNthCalledWith(1, "property.amenities", [
      "clubhouse",
    ]);
    expect(onSave).toHaveBeenNthCalledWith(2, "property.amenities_removed", [
      "gymnasium",
    ]);
  });

  it("shows what will be removed when published, and hides the removal lists as rows", () => {
    panel(
      editing({
        fields: [
          candidate("property.amenities", "amenity_key_array", ["clubhouse"]),
          candidate("property.amenities_removed", "amenity_key_array", [
            "gymnasium",
          ]),
          candidate("unit_variants_removed", "variant_name_array", ["Type B"]),
        ],
        availableFields: [
          ...available,
          {
            fieldKey: "property.amenities_removed",
            label: "Amenities to remove",
            dataType: "amenity_key_array",
          },
          {
            fieldKey: "unit_variants_removed",
            label: "Unit types to remove",
            dataType: "variant_name_array",
          },
          {
            fieldKey: "property.listing_status",
            label: "Listing status",
            dataType: "listing_status",
          },
        ],
      } as Partial<SubmissionDetail>),
    );

    expect(
      rowOf("Amenities").getByText("Removing when published: Gymnasium"),
    ).toBeInTheDocument();
    // The removal lists and listing status are not editable rows of their own.
    expect(screen.queryByText("Amenities to remove")).toBeNull();
    expect(screen.queryByText("Unit types to remove")).toBeNull();
    expect(screen.queryByText("Listing status")).toBeNull();
  });
});

describe("a unit that slipped through", () => {
  const metres = {
    unit_variants: [
      {
        variantName: "Type A",
        dimensions: {
          rooms: [
            { name: "BED ROOM", lengthFt: 4.36, widthFt: 7 },
            { name: "BED ROOM", lengthFt: 3.95, widthFt: 5.48 },
            { name: "TOILET", lengthFt: 2.75, widthFt: 2.91 },
          ],
        },
      },
    ],
  };

  it("warns on the unit-type summary when the sizes look like metres saved as feet", () => {
    panel(editing({ live: metres } as Partial<SubmissionDetail>));

    expect(
      rowOf("Unit configurations").getByText(/Check the unit.*metres/),
    ).toBeInTheDocument();
  });

  it("warns in the Rooms tab, and stops warning once the sizes are corrected", async () => {
    panel(editing({ live: metres } as Partial<SubmissionDetail>));
    await userEvent.click(
      rowOf("Unit configurations").getByRole("button", { name: "Edit" }),
    );
    await userEvent.click(screen.getByRole("tab", { name: /Rooms/ }));

    expect(screen.getByText(/Check the unit./)).toBeInTheDocument();
    expect(screen.getByText(/1 m is 3.28 ft/)).toBeInTheDocument();

    // Correct the two bedrooms to feet: 14.3 x 22.97 and 12.96 x 17.98.
    for (const [name, value] of [
      ["Rooms 1 length (ft)", "14.3"],
      ["Rooms 1 width (ft)", "22.97"],
      ["Rooms 2 length (ft)", "12.96"],
      ["Rooms 2 width (ft)", "17.98"],
    ] as const) {
      await userEvent.clear(screen.getByLabelText(name));
      await userEvent.type(screen.getByLabelText(name), value);
    }

    expect(screen.queryByText(/Check the unit./)).toBeNull();
  });

  it("says nothing about ordinary sizes in feet", () => {
    panel(
      editing({
        live: {
          unit_variants: [
            {
              variantName: "Type A",
              dimensions: {
                rooms: [
                  { name: "Living", lengthFt: 16, widthFt: 12 },
                  { name: "Duct", lengthFt: 1.53, widthFt: 1.53 },
                ],
              },
            },
          ],
        },
      } as Partial<SubmissionDetail>),
    );

    expect(screen.queryByText(/Check the unit/)).toBeNull();
  });
});

describe("listing, unlisting and deleting a property", () => {
  const renderControls = (
    listingStatus: "listed" | "unlisted" | "deleted",
    permissionLevel: "owner" | "verifier" = "owner",
  ) =>
    render(
      <SubmissionWorkbench
        submission={editing({
          status: "published",
          listingStatus,
        } as Partial<SubmissionDetail>)}
        media={[]}
        permissionLevel={permissionLevel}
      />,
    );
  const controls = () =>
    within(
      document.querySelector<HTMLElement>('[data-slot="listing-controls"]')!,
    );

  it("says a listed property is live, and offers Unlist and Delete to an owner", () => {
    renderControls("listed");

    expect(controls().getByText("Live for buyers.")).toBeInTheDocument();
    expect(
      controls().getByRole("button", { name: "Unlist" }),
    ).toBeInTheDocument();
    expect(
      controls().getByRole("button", { name: "Delete" }),
    ).toBeInTheDocument();
    expect(controls().queryByRole("button", { name: "List again" })).toBeNull();
  });

  it("says an unlisted property is hidden, and offers List again", () => {
    renderControls("unlisted");

    expect(controls().getByText("Unlisted.")).toBeInTheDocument();
    expect(
      controls().getByRole("button", { name: "List again" }),
    ).toBeInTheDocument();
    expect(controls().queryByRole("button", { name: "Unlist" })).toBeNull();
  });

  it("says a deleted property is a soft delete, and offers only Restore", () => {
    renderControls("deleted");

    expect(controls().getByText("Deleted.")).toBeInTheDocument();
    expect(controls().getByText(/nothing is erased/i)).toBeInTheDocument();
    expect(
      controls().getByRole("button", { name: "Restore" }),
    ).toBeInTheDocument();
    expect(controls().queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("gives a verifier no buttons, and says why", () => {
    renderControls("listed", "verifier");

    expect(controls().queryByRole("button")).toBeNull();
    expect(controls().getByText(/Only an owner/)).toBeInTheDocument();
  });

  it("asks first, then sends the change", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "unlisted" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderControls("listed");

    await userEvent.click(controls().getByRole("button", { name: "Unlist" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Nothing is deleted, and you can list it again/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlist" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/admin/properties/p1/listing",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "unlisted" }),
      },
    );
    expect(refresh).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("says in words when the change is refused, and does not refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "edit_already_open",
                message: "This property has an edit in progress.",
              },
            }),
            { status: 409 },
          ),
      ),
    );
    refresh.mockReset();
    renderControls("listed");

    await userEvent.click(controls().getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "edit in progress",
    );
    expect(refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows no listing controls on a draft or a new property", () => {
    render(
      <SubmissionWorkbench
        submission={editing({
          status: "draft",
          propertyId: null,
        } as Partial<SubmissionDetail>)}
        media={[]}
        permissionLevel="owner"
      />,
    );

    expect(document.querySelector('[data-slot="listing-controls"]')).toBeNull();
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
      publishedAt: new Date("2026-09-19T11:00:00Z"),
      changes: [],
    },
    {
      id: "s1",
      status: "published",
      kind: "edit",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      publishedAt: new Date("2026-09-20T11:00:00Z"),
      changes: [],
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

  it("shows what a published edit changed, as was and now", () => {
    render(
      <SubmissionWorkbench
        submission={editing({
          id: "s1",
          status: "published",
          versions: [
            versions[0],
            {
              ...versions[1],
              changes: [
                {
                  fieldKey: "property.name",
                  label: "Property name",
                  from: "Kimana",
                  to: "The Kimana Towers",
                  complex: false,
                },
                {
                  fieldKey: "property.total_units",
                  label: "Total units",
                  from: null,
                  to: "76",
                  complex: false,
                },
                {
                  fieldKey: "property.amenities",
                  label: "Amenities",
                  from: null,
                  to: null,
                  complex: true,
                },
              ],
            },
          ],
        } as Partial<SubmissionDetail>)}
        media={[]}
        permissionLevel="owner"
      />,
    );

    const changes = document.querySelector('[data-slot="version-changes"]')!;
    expect(changes).toHaveTextContent(
      "Property name: Kimana → The Kimana Towers",
    );
    expect(changes).toHaveTextContent("Total units: set to 76");
    expect(changes).toHaveTextContent("Amenities: changed");
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
