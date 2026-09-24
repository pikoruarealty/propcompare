import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { FieldsPanel } from "./fields-panel";

/**
 * The Location tab draws the map a link draws, beside the link, so a pin RERA
 * proposed is confirmed by looking at it (`DECISIONS.md` 2026-09-24).
 */

const available = [
  {
    fieldKey: "property.google_maps_url",
    label: "Google Maps link",
    dataType: "map_url",
  },
  {
    fieldKey: "property.latitude",
    label: "Latitude",
    dataType: "positive_number",
  },
];

const submission = (
  fields: { value: unknown; reviewStatus: string }[],
  live: Record<string, unknown> = {},
) =>
  ({
    id: "s1",
    status: "in_review",
    source: "manual_form",
    developerName: "Dev",
    propertyName: "The Kimana Towers",
    propertyId: null,
    city: null,
    locality: null,
    fieldCount: 0,
    needsReviewCount: 0,
    submittedAt: null,
    createdAt: new Date("2026-09-24"),
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
    versions: [],
    publishedMedia: [],
    live,
    fields: fields.map((field) => ({
      fieldKey: "property.google_maps_url",
      label: "Google Maps link",
      dataType: "map_url",
      value: field.value,
      confidence: null,
      reviewStatus: field.reviewStatus,
      evidence: [],
    })),
  }) as unknown as SubmissionDetail;

const panel = (detail: SubmissionDetail) =>
  render(
    <FieldsPanel
      submission={detail}
      only="location"
      editable
      reviewable
      pending={false}
      onSave={async () => null}
      onReview={() => {}}
    />,
  );

const PIN = "https://www.google.com/maps?q=23.0272712,72.4894294";

describe("the Location tab's map preview", () => {
  it("draws the map for a pin RERA proposed and asks for a look before confirming", () => {
    panel(submission([{ value: PIN, reviewStatus: "needs_review" }]));

    const frame = screen.getByTitle("Map preview of the link above");
    expect(frame.getAttribute("src")).toContain("23.0272712%2C72.4894294");
    expect(frame.getAttribute("src")).toContain("output=embed");
    expect(screen.getByText(/RERA proposed this place/i)).toBeTruthy();
  });

  it("does not ask for a look at a link that is already confirmed", () => {
    panel(submission([{ value: PIN, reviewStatus: "confirmed" }]));

    expect(screen.getByTitle("Map preview of the link above")).toBeTruthy();
    expect(screen.queryByText(/RERA proposed this place/i)).toBeNull();
    expect(screen.getByText(/as buyers will see it/i)).toBeTruthy();
  });

  it("falls back to the published link when the submission holds none", () => {
    panel(submission([], { "property.google_maps_url": PIN }));

    expect(screen.getByTitle("Map preview of the link above")).toBeTruthy();
  });

  it("says so when there is no link, and when a link cannot be drawn", () => {
    const { unmount } = panel(submission([]));
    expect(screen.getByText(/No map link yet/i)).toBeTruthy();
    unmount();

    panel(
      submission([
        {
          value: "https://maps.app.goo.gl/AbCdEf123",
          reviewStatus: "confirmed",
        },
      ]),
    );
    expect(screen.queryByTitle("Map preview of the link above")).toBeNull();
    expect(screen.getByText(/cannot be drawn here/i)).toBeTruthy();
  });

  it("ignores a link the reviewer rejected", () => {
    panel(submission([{ value: PIN, reviewStatus: "rejected" }]));

    expect(screen.queryByTitle("Map preview of the link above")).toBeNull();
    expect(screen.getByText(/No map link yet/i)).toBeTruthy();
  });
});
