import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SubmissionLookups } from "@/lib/submissions/queue";
import { draftToValue, FieldEditor } from "./field-editor";
import { FieldValue } from "./field-value";
import { WorkflowPanel } from "./workflow-panel";

const lookups: SubmissionLookups = {
  propertyTypes: [
    { key: "apartment", label: "Apartment" },
    { key: "bungalow", label: "Bungalow" },
  ],
  amenities: [
    { key: "gymnasium", label: "Gymnasium", category: "Wellness" },
    { key: "clubhouse", label: "Clubhouse", category: "Social" },
  ],
  bhkTypes: [{ key: "3bhk", label: "3 BHK" }],
  layoutTypes: [{ key: "duplex", label: "Duplex" }],
  legalEntities: [
    { id: "11111111-1111-4111-8111-111111111111", label: "Adani Realty Ltd" },
  ],
};

const field = (
  dataType: string,
  label = "A field",
  fieldKey = "property.x",
) => ({
  fieldKey,
  label,
  dataType,
});

const editor = (
  dataType: string,
  initial: unknown,
  onSave = vi.fn(),
  fieldKey?: string,
) => {
  render(
    <FieldEditor
      field={field(dataType, "Field", fieldKey)}
      initial={initial}
      lookups={lookups}
      pending={false}
      error={null}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );
  return onSave;
};

describe("draftToValue", () => {
  it("turns numeric types into numbers and rejects non-numbers", () => {
    expect(draftToValue("positive_integer", " 120 ")).toEqual({
      ok: true,
      value: 120,
    });
    expect(draftToValue("percentage_0_to_100", "45.5")).toEqual({
      ok: true,
      value: 45.5,
    });
    expect(draftToValue("positive_number", "many")).toMatchObject({
      ok: false,
    });
  });

  it("will not save an empty value, so a field stays honestly not stated", () => {
    expect(draftToValue("string", "  ")).toMatchObject({ ok: false });
    expect(draftToValue("amenity_key_array", [])).toMatchObject({ ok: false });
  });

  it("keeps text as typed, trimmed", () => {
    expect(draftToValue("string", " Bopal ")).toEqual({
      ok: true,
      value: "Bopal",
    });
  });
});

describe("FieldEditor", () => {
  it("saves a typed number as a number", async () => {
    const user = userEvent.setup();
    const onSave = editor("positive_integer", undefined);
    await user.type(screen.getByRole("textbox"), "120");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(120);
  });

  it("explains a bad value on the spot and does not call save", async () => {
    const user = userEvent.setup();
    const onSave = editor("positive_integer", undefined);
    await user.type(screen.getByRole("textbox"), "many");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a number/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("offers only the approved property types", async () => {
    const user = userEvent.setup();
    const onSave = editor("property_type_key", undefined);
    const select = screen.getByRole("combobox");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose…", "Apartment", "Bungalow"]);
    await user.selectOptions(select, "bungalow");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("bungalow");
  });

  it("offers the three possession statuses by their readable names", async () => {
    const user = userEvent.setup();
    const onSave = editor("possession_status", undefined);
    await user.selectOptions(screen.getByRole("combobox"), "Ready to move");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("ready_to_move");
  });

  it("groups amenities by category and saves the chosen keys", async () => {
    const user = userEvent.setup();
    const onSave = editor("amenity_key_array", ["clubhouse"]);
    expect(screen.getByText("Wellness")).toBeVisible();
    expect(screen.getByText("Social")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Clubhouse" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Gymnasium" }));
    expect(screen.getByText("2 selected")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(["clubhouse", "gymnasium"]);
  });

  it("builds a unit type with an area from the unit-types editor", async () => {
    const user = userEvent.setup();
    const onSave = editor(
      "unit_variant_array",
      undefined,
      vi.fn(),
      "unit_variants",
    );
    await user.type(screen.getByPlaceholderText(/3 BHK/), "3 BHK - A");
    await user.selectOptions(screen.getByLabelText("Bedrooms"), "3 BHK");
    // Areas have their own tab.
    await user.click(screen.getByRole("tab", { name: /Areas/ }));
    await user.type(screen.getByLabelText("Area 1 for unit type 1"), "1450");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith([
      {
        variantName: "3 BHK - A",
        bhkTypeKey: "3bhk",
        areas: [{ basis: "carpet", areaSqft: 1450 }],
      },
    ]);
  });

  it("blocks a unit type with no name and says why", async () => {
    const user = userEvent.setup();
    const onSave = editor(
      "unit_variant_array",
      undefined,
      vi.fn(),
      "unit_variants",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/needs a name/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses a larger box for the developer narrative", () => {
    editor("string", "", vi.fn(), "developer.profile_narrative");
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA");
  });
});

describe("FieldValue", () => {
  it("shows labels rather than stored keys", () => {
    const { container } = render(
      <>
        <FieldValue
          dataType="property_type_key"
          value="apartment"
          lookups={lookups}
        />
        <FieldValue
          dataType="possession_status"
          value="ready_to_move"
          lookups={lookups}
        />
        <FieldValue
          dataType="percentage_0_to_100"
          value={45}
          lookups={lookups}
        />
      </>,
    );
    expect(container).toHaveTextContent("Apartment");
    expect(container).toHaveTextContent("Ready to move");
    expect(container).toHaveTextContent("45%");
    expect(container).not.toHaveTextContent("ready_to_move");
  });

  it("renders amenities as chips and unit types as cards, including room dimensions kept from OCR", () => {
    render(
      <>
        <FieldValue
          dataType="amenity_key_array"
          value={["gymnasium", "unknown_key"]}
          lookups={lookups}
        />
        <FieldValue
          dataType="unit_variant_array"
          lookups={lookups}
          value={[
            {
              variantName: "3 BHK - A",
              bhkTypeKey: "3bhk",
              layoutTypeKey: "duplex",
              totalUnitsOfVariant: 24,
              areas: [{ basis: "carpet", areaSqft: 1450 }],
              dimensions: { rooms: [{ name: "Living" }] },
            },
          ]}
        />
      </>,
    );
    const chips = within(
      screen.getByRole("list", { name: "Amenities" }),
    ).getAllByRole("listitem");
    // An unrecognised key is still shown, never hidden from the reviewer.
    expect(chips.map((c) => c.textContent)).toEqual([
      "Gymnasium",
      "unknown_key",
    ]);
    expect(screen.getByText("3 BHK - A")).toBeVisible();
    expect(screen.getByText(/3 BHK · Duplex · 24 units/)).toBeVisible();
    expect(screen.getByText("Carpet 1450 sq ft")).toBeVisible();
    expect(screen.getByText("1 room dimension recorded")).toBeVisible();
  });
});

describe("WorkflowPanel", () => {
  const render_ = (
    props: Partial<Parameters<typeof WorkflowPanel>[0]> = {},
  ) => {
    const onAction = vi.fn();
    const onPublish = vi.fn();
    render(
      <WorkflowPanel
        status="draft"
        permissionLevel="owner"
        needsReview={0}
        pending={false}
        onAction={onAction}
        onPublish={onPublish}
        {...props}
      />,
    );
    return { onAction, onPublish };
  };

  it("lets an owner submit a draft", async () => {
    const user = userEvent.setup();
    const { onAction } = render_();
    await user.click(screen.getByRole("button", { name: "Submit for review" }));
    expect(onAction).toHaveBeenCalledWith("submit");
  });

  it("tells a verifier they cannot submit rather than showing a dead button", () => {
    render_({ permissionLevel: "verifier" });
    expect(
      screen.queryByRole("button", { name: "Submit for review" }),
    ).toBeNull();
    expect(screen.getByText(/only an owner can submit/i)).toBeVisible();
  });

  it("counts values still waiting for a decision during review", () => {
    render_({ status: "in_review", needsReview: 3 });
    expect(screen.getByText(/values are/)).toBeVisible();
  });

  it("asks before approving and only then acts", async () => {
    const user = userEvent.setup();
    const { onAction } = render_({ status: "in_review" });
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(onAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(onAction).toHaveBeenCalledWith("approve");
  });

  it("does not act if the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    const { onAction } = render_({ status: "in_review" });
    await user.click(screen.getByRole("button", { name: "Reject submission" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Not yet",
      }),
    );
    expect(onAction).not.toHaveBeenCalled();
  });

  it("offers publish only to an owner, and only after confirmation", async () => {
    const user = userEvent.setup();
    const { onPublish } = render_({ status: "approved" });
    await user.click(
      screen.getByRole("button", { name: "Publish to catalog" }),
    );
    expect(onPublish).not.toHaveBeenCalled();
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Publish",
      }),
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("hides publish from a verifier", () => {
    render_({ status: "approved", permissionLevel: "verifier" });
    expect(
      screen.queryByRole("button", { name: "Publish to catalog" }),
    ).toBeNull();
    expect(screen.getByText("Only an owner can publish.")).toBeVisible();
  });
});

describe("the legal entity field", () => {
  it("shows the chosen entity by name, and offers only the developer's entities", () => {
    const { container } = render(
      <FieldValue
        dataType="legal_entity_id"
        value="11111111-1111-4111-8111-111111111111"
        lookups={lookups}
      />,
    );
    expect(container).toHaveTextContent("Adani Realty Ltd");

    render(
      <FieldEditor
        field={{
          fieldKey: "property.legal_entity_id",
          label: "Promoter legal entity",
          dataType: "legal_entity_id",
        }}
        initial={undefined}
        lookups={lookups}
        pending={false}
        error={null}
        onSave={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Adani Realty Ltd" }),
    ).toBeInTheDocument();
  });
});
