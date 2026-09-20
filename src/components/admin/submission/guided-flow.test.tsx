import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { SubmissionWorkbench } from "../submission-workbench";
import { InlineField } from "./inline-field";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const lookups = {
  propertyTypes: [{ key: "apartment", label: "Apartment" }],
  amenities: [
    { key: "gymnasium", label: "Gymnasium", category: "Wellness" },
    { key: "clubhouse", label: "Clubhouse", category: "Social" },
  ],
  bhkTypes: [],
  layoutTypes: [],
  legalEntities: [],
};

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
});

describe("InlineField — a field you just type into", () => {
  const field = (dataType: string, label = "Total units") => ({
    fieldKey: "property.total_units",
    label,
    dataType,
  });

  it("saves what was typed when you leave the field, and says so", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    render(
      <InlineField
        field={field("positive_integer")}
        initial={76}
        lookups={lookups}
        disabled={false}
        onSave={onSave}
      />,
    );
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "80");
    expect(onSave).not.toHaveBeenCalled();

    await user.tab();

    expect(onSave).toHaveBeenCalledWith("property.total_units", 80);
    expect(await screen.findByText("Saved")).toBeVisible();
  });

  it("does not save when nothing changed", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    render(
      <InlineField
        field={field("positive_integer")}
        initial={76}
        lookups={lookups}
        disabled={false}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("textbox"));
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("explains a value that cannot be saved, and shows the server's refusal", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => "That is not allowed.");
    render(
      <InlineField
        field={field("positive_integer")}
        initial={76}
        lookups={lookups}
        disabled={false}
        onSave={onSave}
      />,
    );
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a number.",
    );
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "90");
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That is not allowed.",
    );
  });

  it("puts the old value back, quietly, when a field is cleared: clearing is not a save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    render(
      <InlineField
        field={field("positive_integer")}
        initial={76}
        lookups={lookups}
        disabled={false}
        onSave={onSave}
      />,
    );
    await user.clear(screen.getByRole("textbox"));
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("76");
  });

  it("saves a choice as soon as it is picked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    render(
      <InlineField
        field={{
          fieldKey: "property.type",
          label: "Property type",
          dataType: "property_type_key",
        }}
        initial={undefined}
        lookups={lookups}
        disabled={false}
        onSave={onSave}
      />,
    );
    await user.selectOptions(screen.getByRole("combobox"), "apartment");
    expect(onSave).toHaveBeenCalledWith("property.type", "apartment");
  });

  it("saves amenities shortly after the last box is ticked, with no button", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => null);
    render(
      <InlineField
        field={{
          fieldKey: "property.amenities",
          label: "Amenities",
          dataType: "amenity_key_array",
        }}
        initial={["gymnasium"]}
        lookups={lookups}
        disabled={false}
        onSave={onSave}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /Clubhouse/ }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("property.amenities", [
        "gymnasium",
        "clubhouse",
      ]),
    );
  });
});

const field = (fieldKey: string, label: string, dataType: string) => ({
  fieldKey,
  label,
  dataType,
});

const workbenchSubmission = (
  overrides: Partial<SubmissionDetail> = {},
): SubmissionDetail =>
  ({
    id: "s1",
    status: "draft",
    source: "manual_form",
    developerName: "Sun VN Developers LLP",
    propertyName: null,
    city: null,
    locality: null,
    fieldCount: 0,
    needsReviewCount: 0,
    submittedAt: null,
    createdAt: new Date("2026-09-20"),
    developerId: "d1",
    propertyId: null,
    extraction: null,
    availableFields: [
      field("property.name", "Property name", "string"),
      field("property.city", "City", "string"),
      field("developer.name", "Developer name", "string"),
      field("property.amenities", "Amenities", "amenity_key_array"),
    ],
    lookups,
    fields: [],
    live: {},
    media: [],
    publishedMedia: [],
    rera: { registrationNumber: null, lastFetch: null, comparison: [] },
    versions: [
      {
        id: "s1",
        status: "draft",
        kind: "original",
        createdAt: new Date("2026-09-20"),
        publishedAt: null,
        changes: [],
      },
      {
        id: "s0",
        status: "published",
        kind: "edit",
        createdAt: new Date("2026-09-21"),
        publishedAt: new Date("2026-09-21"),
        changes: [],
      },
    ],
    ...overrides,
  }) as unknown as SubmissionDetail;

const renderWorkbench = (submission: SubmissionDetail, media: unknown[] = []) =>
  render(
    <SubmissionWorkbench
      submission={submission}
      media={media as never}
      permissionLevel="owner"
    />,
  );

describe("the guided path through a submission", () => {
  it("leads from section to section with a primary Next button, and out with a secondary Save draft and leave", async () => {
    const user = userEvent.setup();
    renderWorkbench(workbenchSubmission());

    const footer = () =>
      document.querySelector(
        '[data-slot="edit-tabs"] [role="tabpanel"]:not([hidden]) [data-slot="guided-footer"]',
      ) as HTMLElement;

    expect(
      screen.getByRole("tab", { name: /^Project/, selected: true }),
    ).toBeVisible();
    expect(
      within(footer()).getByRole("link", { name: "Save draft and leave" }),
    ).toHaveAttribute("href", "/admin/submissions");
    await user.click(
      within(footer()).getByRole("button", { name: /Next: Developer/ }),
    );
    expect(
      screen.getByRole("tab", { name: /^Developer/, selected: true }),
    ).toBeVisible();
  });

  it("ends the last section with a button that goes to Publish", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    renderWorkbench(workbenchSubmission());
    await user.click(screen.getByRole("tab", { name: /^Images/ }));
    const panel = document.querySelector(
      '[role="tabpanel"]:not([hidden]) [data-slot="guided-footer"]',
    ) as HTMLElement;
    await user.click(
      within(panel).getByRole("button", { name: /Go to publish/ }),
    );
    expect(scroll).toHaveBeenCalled();
  });

  it("shows how much is filled in, and does not insist on all of it", () => {
    renderWorkbench(
      workbenchSubmission({
        fields: [
          {
            fieldKey: "property.name",
            label: "Property name",
            dataType: "string",
            value: "X",
            confidence: null,
            reviewStatus: "edited",
            evidence: [],
          },
        ],
      } as Partial<SubmissionDetail>),
    );
    expect(document.querySelector('[data-slot="progress"]')).toHaveTextContent(
      "1 of 4 fields filled in",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    // Every field is present to type into; nothing is required to move on.
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(1);
  });

  it("puts the version history last, after the publish panel", () => {
    renderWorkbench(workbenchSubmission());
    const panel = document.querySelector('[data-slot="publish-panel"]')!;
    const versions = document.querySelector('[data-slot="versions"]')!;
    expect(
      panel.compareDocumentPosition(versions) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const tabs = document.querySelector('[data-slot="edit-tabs"]')!;
    expect(
      tabs.compareDocumentPosition(versions) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each(["draft", "submitted", "in_review", "approved"] as const)(
    "a %s submission can still be edited, and its pictures reviewed",
    (status) => {
      renderWorkbench(
        workbenchSubmission({ status } as Partial<SubmissionDetail>),
        [
          {
            id: "m1",
            storagePath: "x",
            unitVariantName: null,
            mediaType: "photo",
            sourceKind: "own",
            caption: null,
            attribution: "Test",
            displayOrder: 0,
            isPublic: false,
            reviewStatus: "needs_review",
            previewUrl: null,
          },
        ],
      );
      const name = screen.getByLabelText("Property name");
      expect(name).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Approve", hidden: true }),
      ).toBeInTheDocument();
    },
  );

  it("is read-only once published, and offers no guided path", () => {
    renderWorkbench(
      workbenchSubmission({ status: "published" } as Partial<SubmissionDetail>),
    );
    expect(document.querySelector('[data-slot="guided-footer"]')).toBeNull();
    expect(document.querySelector('[data-slot="progress"]')).toBeNull();
    expect(screen.queryByLabelText("Property name")).toBeNull();
  });
});
