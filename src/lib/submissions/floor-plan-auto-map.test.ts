import { describe, expect, it } from "vitest";
import { matchFloorPlanPages } from "./floor-plan-auto-map";

/**
 * The real Anamika High Point inputs: the router's per-page captions, and the
 * pages the model cited for each unit type. The model's citations for both
 * Block B & E types were one page too high (verified against the rendered
 * pages: page 14 is "Type - 1", page 15 is "Type - 2"), which is why the
 * caption, not the citation, decides.
 */
const pages = [
  { pageNumber: 9, label: "Ground Floor Plan" },
  { pageNumber: 12, label: "Typical Floor Plan 2 to 31" },
  { pageNumber: 13, label: "4 BHK Classy Residences - Block B & E" },
  { pageNumber: 14, label: "4 BHK Classy Residences - Block B & E | Type - 1" },
  { pageNumber: 15, label: "4 BHK Classy Residences - Block B & E | Type - 2" },
  { pageNumber: 16, label: "4 BHLK Luxurious Retreats - Block C & D" },
  {
    pageNumber: 17,
    label: "4 BHLK Luxurious Retreats - Block C & D | Type - 1",
  },
  {
    pageNumber: 18,
    label: "4 BHLK Luxurious Retreats - Block C & D | Type - 2",
  },
  { pageNumber: 19, label: "5 BHLK Lifestyle Living - Block A" },
  { pageNumber: 20, label: "5 BHLK Lifestyle Living - Block A" },
];
const variants = [
  { variantName: "Block B & E - Type 1 (Units 201)", evidencePages: [15] },
  { variantName: "Block B & E - Type 2 (Units 204)", evidencePages: [16] },
  { variantName: "Block C & D - Type 1 (Unit 201)", evidencePages: [17] },
  { variantName: "Block C & D - Type 2 (Unit 202)", evidencePages: [18] },
  {
    variantName: "Block A - 5 BHLK Lifestyle Living (Unit 201)",
    evidencePages: [20],
  },
];

const pageOf = (matches: ReturnType<typeof matchFloorPlanPages>) =>
  Object.fromEntries(matches.map((m) => [m.variantName, m.pageNumber]));

describe("matchFloorPlanPages", () => {
  it("ties each unit type to the page whose caption names it, not the page the model cited", () => {
    expect(pageOf(matchFloorPlanPages(variants, pages))).toEqual({
      "Block B & E - Type 1 (Units 201)": 14,
      "Block B & E - Type 2 (Units 204)": 15,
      "Block C & D - Type 1 (Unit 201)": 17,
      "Block C & D - Type 2 (Unit 202)": 18,
      "Block A - 5 BHLK Lifestyle Living (Unit 201)": 20,
    });
  });

  it("uses the model's citation only to choose among several pages with the same caption", () => {
    const a = variants[4];
    expect(
      matchFloorPlanPages([{ ...a, evidencePages: [19] }], pages).map(
        (m) => m.pageNumber,
      ),
    ).toEqual([19]);
    // Cited none of them: nothing is guessed.
    expect(matchFloorPlanPages([{ ...a, evidencePages: [3] }], pages)).toEqual(
      [],
    );
    // A duplex printed on two pages, both cited: both are tied.
    expect(
      matchFloorPlanPages([{ ...a, evidencePages: [19, 20] }], pages).map(
        (m) => m.pageNumber,
      ),
    ).toEqual([19, 20]);
  });

  it("does not tie a block-level plan to a unit type it does not name", () => {
    const matched = matchFloorPlanPages(variants, pages).map(
      (m) => m.pageNumber,
    );
    for (const blockPlan of [9, 12, 13, 16]) {
      expect(matched).not.toContain(blockPlan);
    }
  });

  it("drops a page that two unit types match equally well", () => {
    const twins = [
      { variantName: "Tower 1 (Unit 1)", evidencePages: [] },
      { variantName: "Tower 1 (Unit 2)", evidencePages: [] },
    ];
    expect(
      matchFloorPlanPages(twins, [{ pageNumber: 4, label: "Tower 1 plan" }]),
    ).toEqual([]);
  });

  it("prefers the more specific unit type when one name is contained in another", () => {
    const nested = [
      { variantName: "Block A", evidencePages: [] },
      { variantName: "Block A Type 1", evidencePages: [] },
    ];
    expect(
      pageOf(
        matchFloorPlanPages(nested, [
          { pageNumber: 4, label: "Block A Type 1" },
          { pageNumber: 5, label: "Block A" },
        ]),
      ),
    ).toEqual({ "Block A Type 1": 4, "Block A": 5 });
  });

  it('does not read the 2 in "2 BHK" as "Type 2"', () => {
    const two = [
      { variantName: "Tower A - Type 1 (Unit 1)", evidencePages: [] },
      { variantName: "Tower A - Type 2 (Unit 2)", evidencePages: [] },
    ];
    expect(
      pageOf(
        matchFloorPlanPages(two, [
          { pageNumber: 2, label: "2 BHK - Tower A | Type - 1" },
          { pageNumber: 3, label: "2 BHK - Tower A | Type - 2" },
        ]),
      ),
    ).toEqual({
      "Tower A - Type 1 (Unit 1)": 2,
      "Tower A - Type 2 (Unit 2)": 3,
    });
  });

  it("ignores pages with no caption", () => {
    expect(matchFloorPlanPages(variants, [{ pageNumber: 14 }])).toEqual([]);
  });
});
