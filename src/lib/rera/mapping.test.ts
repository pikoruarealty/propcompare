import { describe, expect, it } from "vitest";
import {
  compareWithRecord,
  LEGAL_ENTITY_FIELD_KEY,
  matchLegalEntity,
  writableItems,
} from "./mapping";
import type { RegulatorRecord } from "./types";

const record: RegulatorRecord = {
  regulatorCode: "gujrera",
  registrationNumber: "PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA10879/111122",
  externalProjectId: "17929",
  projectName: "The Kimana Towers",
  promoterName: "SUN VN DEVELOPERS LLP",
  promoterType: "LIMITED LIABILITY PARTNERSHIP FIRM",
  projectType: "Residential/Group Housing",
  registeredFrom: "2022-06-21",
  completionDate: "2027-04-30",
  district: "Ahmedabad",
  address: null,
  totalUnits: 76,
  constructionProgressPercent: 67.71875,
  latestQuarter: null,
  sourceUrl: "https://gujrera.gujarat.gov.in/",
  fetchedAt: "2026-09-20T06:00:00.000Z",
  gaps: [],
};

const entities = [
  { id: "e1", legalName: "Sun VN Developers LLP" },
  { id: "e2", legalName: "Other Builders Pvt Ltd" },
];

const byKey = (items: ReturnType<typeof compareWithRecord>) =>
  Object.fromEntries(items.map((item) => [item.fieldKey, item]));

describe("compareWithRecord", () => {
  it("proposes RERA's value where we hold nothing", () => {
    const items = byKey(compareWithRecord(record, {}, entities));

    expect(items["property.possession_date"]).toMatchObject({
      status: "not_held",
      proposedValue: "2027-04-30",
      currentValue: null,
    });
    expect(items["property.total_units"]).toMatchObject({
      status: "not_held",
      proposedValue: 76,
    });
  });

  it("flags a different value and proposes RERA's", () => {
    const items = byKey(
      compareWithRecord(
        record,
        {
          "property.possession_date": "2027-12-31",
          "property.total_units": 80,
        },
        entities,
      ),
    );

    expect(items["property.possession_date"]).toMatchObject({
      status: "differs",
      reraValue: "2027-04-30",
      currentValue: "2027-12-31",
      proposedValue: "2027-04-30",
    });
    expect(items["property.total_units"].status).toBe("differs");
  });

  it("treats a change of case as a difference and adopts RERA's spelling", () => {
    const items = byKey(
      compareWithRecord(
        record,
        { "property.name": "THE KIMANA TOWERS" },
        entities,
      ),
    );

    expect(items["property.name"]).toMatchObject({
      status: "differs",
      proposedValue: "The Kimana Towers",
    });
  });

  it("calls equal values the same, whether stored as text or a number", () => {
    const items = byKey(
      compareWithRecord(
        record,
        {
          "property.rera_construction_progress_percent": "67.71875",
          "property.name": " The Kimana Towers ",
        },
        entities,
      ),
    );

    expect(items["property.rera_construction_progress_percent"].status).toBe(
      "same",
    );
    expect(items["property.name"].status).toBe("same");
  });

  it("leaves our value alone when RERA is silent", () => {
    const items = byKey(
      compareWithRecord(
        { ...record, totalUnits: null },
        { "property.total_units": 76 },
        entities,
      ),
    );

    expect(items["property.total_units"]).toMatchObject({
      status: "rera_silent",
      proposedValue: null,
    });
    expect(
      writableItems(Object.values(items)).map((i) => i.fieldKey),
    ).not.toContain("property.total_units");
  });

  it("never proposes a field RERA does not speak to", () => {
    const keys = compareWithRecord(record, {}, entities).map((i) => i.fieldKey);

    expect(keys).toEqual([
      "property.rera_registration_number",
      "property.name",
      "property.possession_date",
      "property.total_units",
      "property.rera_construction_progress_percent",
      LEGAL_ENTITY_FIELD_KEY,
    ]);
  });
});

describe("the promoter", () => {
  it("proposes the recorded legal entity that matches RERA's promoter", () => {
    const items = byKey(compareWithRecord(record, {}, entities));

    expect(items[LEGAL_ENTITY_FIELD_KEY]).toMatchObject({
      status: "not_held",
      reraValue: "SUN VN DEVELOPERS LLP",
      proposedValue: "e1",
    });
  });

  it("is the same when that entity is already linked", () => {
    const items = byKey(
      compareWithRecord(record, { [LEGAL_ENTITY_FIELD_KEY]: "e1" }, entities),
    );

    expect(items[LEGAL_ENTITY_FIELD_KEY].status).toBe("same");
  });

  it("differs when another entity is linked", () => {
    const items = byKey(
      compareWithRecord(record, { [LEGAL_ENTITY_FIELD_KEY]: "e2" }, entities),
    );

    expect(items[LEGAL_ENTITY_FIELD_KEY]).toMatchObject({
      status: "differs",
      currentValue: "Other Builders Pvt Ltd",
      proposedValue: "e1",
    });
  });

  it("proposes nothing, and says why, when no recorded entity matches", () => {
    const items = byKey(
      compareWithRecord(record, {}, [
        { id: "e2", legalName: "Other Builders" },
      ]),
    );

    expect(items[LEGAL_ENTITY_FIELD_KEY]).toMatchObject({
      proposedValue: null,
      status: "not_held",
    });
    expect(items[LEGAL_ENTITY_FIELD_KEY].note).toMatch(/developer page/);
  });

  it("does not guess between two entities with the same name", () => {
    expect(
      matchLegalEntity("Sun VN Developers LLP", [
        { id: "a", legalName: "Sun VN Developers LLP" },
        { id: "b", legalName: "SUN VN DEVELOPERS  LLP." },
      ]),
    ).toBeNull();
  });

  it("matches ignoring case and punctuation", () => {
    expect(matchLegalEntity("SUN VN DEVELOPERS LLP", entities)?.id).toBe("e1");
    expect(matchLegalEntity(null, entities)).toBeNull();
  });
});

describe("writableItems", () => {
  it("lists only what a 'use RERA values' action would change", () => {
    const items = compareWithRecord(
      record,
      {
        "property.name": "The Kimana Towers", // same
        "property.total_units": 80, // differs
      },
      entities,
    );

    expect(writableItems(items).map((i) => i.fieldKey)).toEqual([
      "property.rera_registration_number",
      "property.possession_date",
      "property.total_units",
      "property.rera_construction_progress_percent",
      LEGAL_ENTITY_FIELD_KEY,
    ]);
  });
});
