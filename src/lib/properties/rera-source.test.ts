import { describe, expect, it } from "vitest";
import { reraSourcedFacts, type PublishedRegulatorFacts } from "./rera-source";

const published: PublishedRegulatorFacts = {
  registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA10879/111122",
  constructionProgressPercent: "67.72",
  possessionDate: "2027-04-30",
  totalUnits: 76,
};
const stated = {
  registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA10879/111122",
  constructionProgressPercent: 67.71875,
  completionDate: "2027-04-30",
  totalUnits: 76,
};

describe("which facts may be credited to the regulator", () => {
  it("credits every fact whose published value is exactly what RERA stated", () => {
    expect(reraSourcedFacts(stated, published)).toEqual([
      "registration_number",
      "construction_progress",
      "possession_date",
      "total_units",
    ]);
  });

  it("credits nothing when the record was never checked", () => {
    expect(reraSourcedFacts(null, published)).toEqual([]);
  });

  it("does not credit a value that differs from RERA's, or one we have but RERA did not state", () => {
    expect(
      reraSourcedFacts(
        { ...stated, completionDate: "2027-12-31", totalUnits: 80 },
        published,
      ),
    ).toEqual(["registration_number", "construction_progress"]);
    expect(
      reraSourcedFacts(
        {
          registrationNumber: stated.registrationNumber,
          constructionProgressPercent: null,
          completionDate: undefined,
          totalUnits: null,
        },
        published,
      ),
    ).toEqual(["registration_number"]);
  });

  it("does not credit a fact we do not publish", () => {
    expect(
      reraSourcedFacts(stated, {
        registrationNumber: null,
        constructionProgressPercent: null,
        possessionDate: null,
        totalUnits: null,
      }),
    ).toEqual([]);
  });

  it("compares the registration number ignoring case and spacing, and progress to the two decimals we store", () => {
    expect(
      reraSourcedFacts(
        { registrationNumber: " pr/gj/x  y " },
        { ...published, registrationNumber: "PR/GJ/X Y" },
      ),
    ).toEqual(["registration_number"]);
    expect(
      reraSourcedFacts(
        { constructionProgressPercent: 67.71875 },
        { ...published, constructionProgressPercent: "67.72" },
      ),
    ).toEqual(["construction_progress"]);
    expect(
      reraSourcedFacts(
        { constructionProgressPercent: 67.71875 },
        { ...published, constructionProgressPercent: "67.5" },
      ),
    ).toEqual([]);
  });
});
