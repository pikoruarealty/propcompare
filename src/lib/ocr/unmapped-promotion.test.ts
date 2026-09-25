import { describe, expect, it } from "vitest";
import type { OcrUnmappedEvidenceCandidate } from "./adapter";
import {
  promoteUnmappedEvidence,
  specificationTextOf,
  type PromotionVocabulary,
} from "./unmapped-promotion";

const vocabulary: PromotionVocabulary = {
  activeSpecificationFieldKeys: new Set(
    [
      "windows",
      "kitchen",
      "vastu_compliance",
      "clubhouse_size",
      "nearby_connectivity",
      "nearby_hospitals",
      "nearby_schools",
    ].map((key) => `property.specifications.${key}`),
  ),
  specificationKeyBySynonym: new Map([
    ["vastu_compliance", "vastu_compliance"],
    ["vastu_compliance_declaration", "vastu_compliance"],
    ["clubhouse_size", "clubhouse_size"],
    ["clubhouse_area", "clubhouse_size"],
    ["nearby_connectivity", "nearby_connectivity"],
    ["connectivity_nearby_landmarks", "nearby_connectivity"],
    ["nearby_hospitals", "nearby_hospitals"],
    ["nearby_schools", "nearby_schools"],
    ["nearby_educational_institutions", "nearby_schools"],
    // A specification the contract has switched off: never a destination.
    ["lifts_per_tower", "lifts_per_tower"],
  ]),
};

const item = (
  fieldKey: string,
  value: unknown,
  ...pages: number[]
): OcrUnmappedEvidenceCandidate => ({
  fieldKey,
  value,
  scopeKey: "project-details",
  evidence: pages.map((pageNumber) => ({
    scopeKey: "project-details",
    pageNumber,
    sourceSnippet: `page ${pageNumber}`,
  })),
});

const promote = (
  unmapped: OcrUnmappedEvidenceCandidate[],
  already: string[] = [],
) => promoteUnmappedEvidence(unmapped, new Set(already), vocabulary);

describe("promoteUnmappedEvidence", () => {
  it("takes a fact whose raw key is a specification that is active now", () => {
    expect(
      promote([
        item(
          "property.specifications.windows",
          "UPVC windows / Aluminium windows / equivalent",
          34,
        ),
      ]),
    ).toEqual([
      {
        fieldKey: "property.specifications.windows",
        value: "UPVC windows / Aluminium windows / equivalent",
        evidence: [
          {
            scopeKey: "project-details",
            pageNumber: 34,
            sourceSnippet: "page 34",
            valuePath: "$",
          },
        ],
      },
    ]);
  });

  it("finds the destination through the catalog's synonyms, dotted or not", () => {
    const found = promote([
      item("vastu_compliance_declaration", "Certified Vastu Compliant", 25),
      item("property.clubhouse_area", "~1858 sq. mt. (~20,000 sq. ft.)", 11),
      item("amenities.nearby_educational_institutions", ["IIM Ahmedabad"], 5),
      item("connectivity.nearby_landmarks", ["Gurukul Road Metro Station"], 2),
    ]);
    expect(found.map((candidate) => candidate.fieldKey).sort()).toEqual([
      "property.specifications.clubhouse_size",
      "property.specifications.nearby_connectivity",
      "property.specifications.nearby_schools",
      "property.specifications.vastu_compliance",
    ]);
  });

  it("writes a list of named places as the catalog's one line, name and time as printed", () => {
    const [hospitals] = promote([
      item(
        "amenities.nearby_hospitals",
        [
          { name: "Sterling Hospital", travel_time: "4 min" },
          { name: "Zydus Hospital", travel_time: "11 min" },
        ],
        5,
      ),
    ]);
    expect(hospitals.value).toBe(
      "Sterling Hospital 4 min; Zydus Hospital 11 min",
    );
  });

  it("never replaces a field the read already filled", () => {
    expect(
      promote(
        [item("property.specifications.kitchen", "from the unmapped list", 34)],
        ["property.specifications.kitchen"],
      ),
    ).toEqual([]);
  });

  it("keeps the first of two raw keys for one specification and both places as evidence", () => {
    const [vastu, ...rest] = promote([
      item("vastu_compliance_declaration", "Certified Vastu Compliant", 25),
      item("property.vastu_compliance", "Vastu compliant - certified", 15),
    ]);
    expect(rest).toEqual([]);
    expect(vastu.value).toBe("Certified Vastu Compliant");
    expect(vastu.evidence.map((entry) => entry.pageNumber).sort()).toEqual([
      15, 25,
    ]);
  });

  it("collapses a page cited twice into one piece of evidence", () => {
    const [kitchen] = promote([
      item("property.specifications.kitchen", "Vitrified tiles", 34, 34, 34),
    ]);
    expect(kitchen.evidence).toHaveLength(1);
  });

  it("leaves alone what has no destination: a retired field, another kind of fact, an odd shape, no evidence", () => {
    expect(
      promote([
        item("property.specifications.lifts_per_tower", "3", 34),
        item("property.total_area", "~ 12,383 sq. mt.", 7),
        item("unit.lobby_width", "3055 MM WIDE", 30),
        item("property.specifications.kitchen", { flooring: "tiles" }, 34),
        item("property.specifications.kitchen", "Tiles"),
      ]),
    ).toEqual([]);
  });

  it("never promotes money", () => {
    expect(
      promote([
        item(
          "property.specifications.kitchen",
          "Modular kitchen, Rs. 2 lakh",
          3,
        ),
        item("property.specifications.windows", "UPVC, ₹450 per sq ft", 3),
      ]),
    ).toEqual([]);
  });
});

describe("specificationTextOf", () => {
  it("reads text, a list of text and named places, and nothing else", () => {
    expect(specificationTextOf("  Vastu compliant ")).toBe("Vastu compliant");
    expect(specificationTextOf(["A", "B"])).toBe("A; B");
    expect(specificationTextOf([{ name: "Metro", distance: "1.2 Km" }])).toBe(
      "Metro 1.2 Km",
    );
    expect(specificationTextOf([{ name: "Metro" }])).toBe("Metro");
    for (const odd of [null, 3, "", [], [{ label: "x" }], [1, 2]]) {
      expect(specificationTextOf(odd)).toBeNull();
    }
  });
});
