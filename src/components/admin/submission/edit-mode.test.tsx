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
    fieldKey: "property.amenities",
    label: "Amenities",
    dataType: "amenity_key_array",
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
    amenities: [],
    bhkTypes: [],
    layoutTypes: [],
    legalEntities: [],
  },
  media: [],
  rera: { registrationNumber: null, lastFetch: null, comparison: [] },
};

const editing = (overrides: Partial<SubmissionDetail> = {}) =>
  ({
    ...base,
    propertyId: "p1",
    live: { "property.name": "THE KIMANA TOWERS", "property.total_units": 76 },
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
  it("shows what is live where nothing has been proposed, not 'Not stated'", () => {
    panel(editing());

    const name = rowOf("Property name");
    expect(name.getByText("THE KIMANA TOWERS")).toBeInTheDocument();
    expect(name.getByText(/Currently published/)).toBeInTheDocument();
    expect(name.queryByText("Not stated")).toBeNull();
    expect(name.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("says a whole-set field is unchanged rather than claiming it is not stated", () => {
    panel(editing());

    expect(
      rowOf("Amenities").getByText(/Unchanged\. Keeps what is published/),
    ).toBeInTheDocument();
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
