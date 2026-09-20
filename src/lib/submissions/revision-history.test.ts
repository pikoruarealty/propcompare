import { describe, expect, it } from "vitest";
import { buildRevisionHistory } from "./revision-history";

const labels = new Map([
  ["property.name", "Property name"],
  ["property.total_units", "Total units"],
  ["property.amenities", "Amenities"],
]);
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("revision history", () => {
  it("shows what an edit changed as was and now, and leaves the original's list empty", () => {
    const history = buildRevisionHistory(
      [
        {
          submissionId: "edit-1",
          publishedAt: at("2026-09-10"),
          snapshot: {
            isNewProperty: false,
            fields: {
              "property.name": "Kimana Towers",
              "property.total_units": 76,
            },
          },
        },
        {
          submissionId: "original",
          publishedAt: at("2026-09-01"),
          snapshot: {
            isNewProperty: true,
            fields: { "property.name": "Kimana", "property.total_units": 70 },
          },
        },
      ],
      labels,
    );

    expect(history.map((entry) => entry.submissionId)).toEqual([
      "original",
      "edit-1",
    ]);
    expect(history[0].changes).toEqual([]);
    expect(history[1].changes).toEqual([
      {
        fieldKey: "property.name",
        label: "Property name",
        from: "Kimana",
        to: "Kimana Towers",
        complex: false,
      },
      {
        fieldKey: "property.total_units",
        label: "Total units",
        from: "70",
        to: "76",
        complex: false,
      },
    ]);
  });

  it("skips a field an edit re-published unchanged", () => {
    const history = buildRevisionHistory(
      [
        {
          submissionId: "original",
          publishedAt: at("2026-09-01"),
          snapshot: { isNewProperty: true, fields: { "property.name": "A" } },
        },
        {
          submissionId: "edit",
          publishedAt: at("2026-09-02"),
          snapshot: { isNewProperty: false, fields: { "property.name": "A" } },
        },
      ],
      labels,
    );
    expect(history[1].changes).toEqual([]);
  });

  it("reports a field set for the first time with no before, and a set as changed without text", () => {
    const history = buildRevisionHistory(
      [
        {
          submissionId: "original",
          publishedAt: at("2026-09-01"),
          snapshot: {
            isNewProperty: true,
            fields: { "property.amenities": ["gym"] },
          },
        },
        {
          submissionId: "edit",
          publishedAt: at("2026-09-02"),
          snapshot: {
            isNewProperty: false,
            fields: {
              "property.amenities": ["gym", "pool"],
              "property.total_units": 76,
            },
          },
        },
      ],
      labels,
    );
    expect(history[1].changes).toEqual([
      {
        fieldKey: "property.amenities",
        label: "Amenities",
        from: null,
        to: null,
        complex: true,
      },
      {
        fieldKey: "property.total_units",
        label: "Total units",
        from: null,
        to: "76",
        complex: false,
      },
    ]);
  });

  it("copes with an empty or malformed snapshot", () => {
    expect(
      buildRevisionHistory(
        [{ submissionId: "x", publishedAt: at("2026-09-01"), snapshot: null }],
        labels,
      ),
    ).toEqual([
      {
        submissionId: "x",
        publishedAt: at("2026-09-01"),
        isNewProperty: false,
        changes: [],
      },
    ]);
  });
});
