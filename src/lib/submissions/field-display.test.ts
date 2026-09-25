import { describe, expect, it } from "vitest";
import {
  compareFieldsWithinGroup,
  countNeedingReview,
  groupFields,
  groupOfField,
} from "./field-display";

describe("groupOfField", () => {
  it.each([
    ["property.name", "project"],
    ["property.rera_registration_number", "project"],
    ["developer.profile_narrative", "developer"],
    ["property.amenities", "amenities"],
    ["property.specifications.flooring", "specifications"],
    ["unit_variants", "unit_types"],
    ["property.specifications.nearby_connectivity", "location"],
    ["property.specifications.nearby_hospitals", "location"],
    ["property.specifications.nearby_schools", "location"],
    ["property.specifications.plot_no", "location"],
    ["property.specifications.amenities_full_list", "amenities"],
    ["something.new", "project"],
  ])("%s is in %s", (key, group) => {
    expect(groupOfField(key)).toBe(group);
  });
});

describe("groupFields", () => {
  const available = [
    { fieldKey: "property.city" },
    { fieldKey: "property.name" },
    { fieldKey: "property.specifications.flooring" },
    { fieldKey: "unit_variants" },
    { fieldKey: "property.amenities" },
  ];

  it("puts every active field in exactly one group, in reading order", () => {
    const groups = groupFields(available, []);
    expect(groups.map((g) => g.group.key)).toEqual([
      "project",
      "amenities",
      "specifications",
      "unit_types",
    ]);
    expect(groups.flatMap((g) => g.rows).length).toBe(available.length);
    expect(groups[0].rows.map((r) => r.field.fieldKey)).toEqual([
      "property.name",
      "property.city",
    ]);
  });

  it("marks a field with no candidate as not stated, and one with a candidate as proposed", () => {
    const proposed = [{ fieldKey: "property.name", value: "Tower" }];
    const project = groupFields(available, proposed)[0].rows;
    expect(project[0].candidate).toEqual(proposed[0]);
    expect(project[1].candidate).toBeNull();
  });

  it("omits a group with no active fields", () => {
    expect(
      groupFields([{ fieldKey: "property.name" }], []).map((g) => g.group.key),
    ).toEqual(["project"]);
  });
});

describe("compareFieldsWithinGroup", () => {
  it("orders known project fields first and the rest alphabetically", () => {
    const keys = [
      "property.zzz",
      "property.city",
      "property.aaa",
      "property.name",
    ];
    expect(keys.sort(compareFieldsWithinGroup)).toEqual([
      "property.name",
      "property.city",
      "property.aaa",
      "property.zzz",
    ]);
  });
});

describe("countNeedingReview", () => {
  it("counts unreviewed and hand-edited candidates, not decided ones", () => {
    expect(
      countNeedingReview([
        { reviewStatus: "needs_review" },
        { reviewStatus: "edited" },
        { reviewStatus: "confirmed" },
        { reviewStatus: "rejected" },
        { reviewStatus: "auto_accepted" },
      ]),
    ).toBe(2);
  });
});
