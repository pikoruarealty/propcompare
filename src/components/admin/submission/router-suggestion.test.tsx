import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routerEvidenceSnippet } from "@/lib/ocr/single-facility";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { FieldsPanel } from "./fields-panel";

/**
 * An amenity the router named from a single-facility page is shown with that page's
 * own image and a plain label, so confirming it is a check against the source
 * (`DECISIONS.md` 2026-09-24).
 */

const snippet = routerEvidenceSnippet({
  pageNumber: 14,
  caption: "Swimming Pool",
  amenityKey: "swimming_pool",
  amenityLabel: "Swimming pool",
});

const submission = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "draft",
  source: "ocr_brochure",
  propertyId: null,
  live: {},
  availableFields: [
    {
      fieldKey: "property.amenities",
      label: "Amenities",
      dataType: "amenity_key_array",
    },
  ],
  fields: [
    {
      fieldKey: "property.amenities",
      label: "Amenities",
      dataType: "amenity_key_array",
      value: ["clubhouse", "swimming_pool"],
      confidence: "0.9",
      reviewStatus: "needs_review",
      evidence: [
        { sourcePage: 3, sourceSnippet: "Clubhouse" },
        { sourcePage: 14, sourceSnippet: snippet },
      ],
    },
  ],
  lookups: {
    propertyTypes: [],
    amenities: [
      { key: "clubhouse", label: "Clubhouse", category: "Social" },
      { key: "swimming_pool", label: "Swimming pool", category: "Wellness" },
    ],
    bhkTypes: [],
    layoutTypes: [],
    legalEntities: [],
  },
  rera: { registrationNumber: null, lastFetch: null, comparison: [] },
} as unknown as SubmissionDetail;

const renderPanel = () =>
  render(
    <FieldsPanel
      submission={submission}
      editable
      reviewable
      pending={false}
      onSave={async () => null}
      onReview={() => {}}
    />,
  );

describe("a router-detected amenity in the review panel", () => {
  it("shows the page's own image beside a label that says the router named it", () => {
    const { container } = renderPanel();

    const suggestion = container.querySelector(
      '[data-slot="router-suggestion"]',
    ) as HTMLElement;
    expect(suggestion).not.toBeNull();
    const image = within(suggestion).getByRole("img");
    expect(image.getAttribute("src")).toBe(
      `/api/v1/admin/submissions/${submission.id}/brochure-page/14`,
    );
    expect(suggestion).toHaveTextContent("Router-detected:");
    expect(suggestion).toHaveTextContent("Swimming Pool");
    expect(suggestion).toHaveTextContent(/No extraction read this page/);
    expect(
      screen.getByRole("button", { name: /Open full size: Brochure page 14/ }),
    ).toBeInTheDocument();
  });

  it("leaves an ordinary read's evidence as a plain line, with no image", () => {
    const { container } = renderPanel();

    expect(screen.getByText(/Brochure page 3/)).toHaveTextContent("Clubhouse");
    expect(
      container.querySelectorAll('[data-slot="router-suggestion"]'),
    ).toHaveLength(1);
  });

  it("is still a field waiting for a person to confirm", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});
