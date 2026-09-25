import { describe, expect, it } from "vitest";
import {
  compareWithRecord,
  derivePossessionStatus,
  legalEntityTypeFromRera,
  LEGAL_ENTITY_FIELD_KEY,
  matchLegalEntity,
  writableItems,
  UNIT_VARIANTS_FIELD_KEY,
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
  projectDescription: "Residential Apartments",
  pincode: null,
  landAreaSqm: 7628,
  coveredParkingSlots: 246,
  blocks: [{ name: "A+B", slabs: 24 }],
  declaredAmenityKeys: [],
  carpetGroups: [],
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
      "property.pincode",
      "property.rera_project_land_area_sqft",
      "property.total_floors",
      "property.total_towers",
      "property.possession_status",
      "property.amenities",
      LEGAL_ENTITY_FIELD_KEY,
      "unit_variants",
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
      "property.rera_project_land_area_sqft",
      "property.possession_status",
      LEGAL_ENTITY_FIELD_KEY,
    ]);
  });
});

describe("possession status, derived from RERA's progress", () => {
  it("is under construction while progress is below 100, and ready to move at 100", () => {
    expect(
      derivePossessionStatus({ ...record, constructionProgressPercent: 67.7 }),
    ).toBe("under_construction");
    expect(
      derivePossessionStatus({ ...record, constructionProgressPercent: 0 }),
    ).toBe("under_construction");
    expect(
      derivePossessionStatus({ ...record, constructionProgressPercent: 100 }),
    ).toBe("ready_to_move");
  });

  it("is never guessed when progress is missing, and never says 'nearing possession'", () => {
    expect(
      derivePossessionStatus({ ...record, constructionProgressPercent: null }),
    ).toBeNull();
    for (const progress of [0, 50, 95, 99.9, 100]) {
      expect(
        derivePossessionStatus({
          ...record,
          constructionProgressPercent: progress,
        }),
      ).not.toBe("nearing_possession");
    }
  });

  it("is proposed with a note saying it is derived, and flagged when we hold another", () => {
    const items = byKey(
      compareWithRecord(
        record,
        { "property.possession_status": "ready_to_move" },
        entities,
      ),
    );

    expect(items["property.possession_status"]).toMatchObject({
      status: "differs",
      proposedValue: "under_construction",
      currentValue: "ready_to_move",
    });
    expect(items["property.possession_status"].note).toMatch(
      /Derived from RERA/,
    );
  });

  it("proposes nothing when RERA gave no progress", () => {
    const items = byKey(
      compareWithRecord(
        { ...record, constructionProgressPercent: null },
        {},
        entities,
      ),
    );

    expect(items["property.possession_status"]).toMatchObject({
      status: "rera_silent",
      proposedValue: null,
    });
  });
});

describe("amenities", () => {
  const labels = { swimming_pool: "Swimming pool", security: "Security" };
  const withPool = { ...record, declaredAmenityKeys: ["swimming_pool"] };

  it("is silent, and leaves ours alone, when RERA declares none", () => {
    const items = byKey(
      compareWithRecord(
        record,
        { "property.amenities": ["security"] },
        entities,
        labels,
      ),
    );

    expect(items["property.amenities"]).toMatchObject({
      status: "rera_silent",
      proposedValue: null,
    });
    expect(items["property.amenities"].note).toMatch(/lists no amenities/);
  });

  it("adds a declared pool to what we hold and never removes anything", () => {
    const items = byKey(
      compareWithRecord(
        withPool,
        { "property.amenities": ["security"] },
        entities,
        labels,
      ),
    );

    expect(items["property.amenities"]).toMatchObject({
      status: "not_held",
      reraValue: "Swimming pool",
      currentValue: "Security",
      proposedValue: ["security", "swimming_pool"],
    });
  });

  it("proposes just the pool when we hold no amenities", () => {
    const items = byKey(compareWithRecord(withPool, {}, entities, labels));

    expect(items["property.amenities"].proposedValue).toEqual([
      "swimming_pool",
    ]);
    expect(items["property.amenities"].currentValue).toBeNull();
  });

  it("matches when the pool is already listed", () => {
    const items = byKey(
      compareWithRecord(
        withPool,
        { "property.amenities": ["swimming_pool", "security"] },
        entities,
        labels,
      ),
    );

    expect(items["property.amenities"]).toMatchObject({
      status: "same",
      proposedValue: null,
    });
  });
});

describe("compareWithRecord — carpet area by unit type", () => {
  const groups = [
    {
      block: "A",
      carpetAreaSqm: 369.54,
      flatCount: 36,
      firstFlat: "A-301",
      lastFlat: "A-2002",
    },
  ];
  const carpet = (overrides: Partial<RegulatorRecord>, variants: unknown) =>
    compareWithRecord(
      { ...record, ...overrides },
      { unit_variants: variants },
      [],
    ).find((entry) => entry.fieldKey === UNIT_VARIANTS_FIELD_KEY)!;

  it("proposes the full unit-type list with RERA's carpet area and counts as writable", () => {
    const item = carpet({ carpetGroups: groups }, [
      { variantName: "Block A - 3rd", areas: [] },
    ]);
    expect(item.status).toBe("not_held");
    expect(item.reraValue).toBe("1 carpet area listed");
    expect(item.proposedValue).toEqual([
      {
        variantName: "Block A - 3rd",
        areas: [{ basis: "carpet", areaSqft: 3977.7 }],
      },
    ]);
    expect(writableItems([item]).map((entry) => entry.fieldKey)).toEqual([
      UNIT_VARIANTS_FIELD_KEY,
    ]);
  });

  it("is quiet when the held carpet areas already match", () => {
    const item = carpet({ carpetGroups: groups }, [
      {
        variantName: "Block A - 3rd",
        areas: [{ basis: "carpet", areaSqft: 3978 }],
      },
    ]);
    expect(item.status).toBe("same");
    expect(item.proposedValue).toBeNull();
    expect(writableItems([item])).toEqual([]);
  });

  it("says RERA lists none only when the flat list was read and was empty", () => {
    const read = carpet({ carpetGroups: [], gaps: [] }, []);
    expect(read.status).toBe("rera_silent");
    expect(read.note).toMatch(/lists no carpet areas/i);

    const unread = carpet(
      { carpetGroups: [], gaps: ["flat carpet areas"] },
      [],
    );
    expect(unread.status).toBe("rera_silent");
    expect(unread.note).toMatch(/not read on this fetch/i);
  });

  it("explains an empty unit-type list instead of proposing anything", () => {
    const item = carpet({ carpetGroups: groups }, undefined);
    expect(item.proposedValue).toBeNull();
    expect(item.note).toMatch(/no unit types are entered yet/i);
  });
});

describe("the second-pass items (position, map link, snapshot)", () => {
  const withDetails: RegulatorRecord = {
    ...record,
    details: {
      version: 1,
      layoutLandAreaSqm: 7628,
      openAreaSqm: 3131.1,
      coveredAreaSqm: 4496.9,
      coveredParkingAreaSqm: null,
      filing: {
        quarter: "Q-14",
        periodEndsOn: "2026-06-30",
        source: "quarterly_filing",
        progressPercent: 67.71875,
        blocks: [],
      },
      inventory: {
        totalUnits: 76,
        bookedUnits: 63,
        availableUnits: 13,
        asOn: "2026-07-03",
      },
      filings: { listed: 18, submitted: 17 },
      planPassingAuthority: "AUDA",
      registeredOn: "2022-11-11",
      architects: [],
      engineers: [],
      contractors: [],
      boundary: [
        { lat: 23.0275, lng: 72.4888 },
        { lat: 23.0274, lng: 72.49 },
        { lat: 23.0269, lng: 72.49 },
      ],
      centre: { lat: 23.0272712, lng: 72.4894294 },
    },
  };

  it("proposes the boundary's centre as the position and a search by name as the map link, where none is held", () => {
    const items = byKey(compareWithRecord(withDetails, {}, entities));

    expect(items["property.latitude"]).toMatchObject({
      status: "not_held",
      proposedValue: 23.0272712,
    });
    expect(items["property.longitude"]).toMatchObject({
      status: "not_held",
      proposedValue: 72.4894294,
    });
    // The name search leads; RERA's own value stays the boundary centre, the
    // alternative when the search lands on the wrong place.
    expect(items["property.google_maps_url"]).toMatchObject({
      status: "not_held",
      proposedValue:
        "https://www.google.com/maps/search/?api=1&query=The%20Kimana%20Towers%20Ahmedabad",
      reraValue: "https://www.google.com/maps?q=23.0272712,72.4894294",
    });
    expect(items["property.google_maps_url"].note).toMatch(
      /search from the project.s name.*wrong place.*centre of the boundary/i,
    );
  });

  it("proposes the boundary's pin as the map link only when there is no name to search", () => {
    const items = byKey(
      compareWithRecord(
        { ...withDetails, projectName: "", district: null },
        { "property.name": null, "property.locality": null },
        entities,
      ),
    );
    expect(items["property.google_maps_url"].proposedValue).toBe(
      "https://www.google.com/maps?q=23.0272712,72.4894294",
    );
  });

  it("treats a held name search, or a held boundary pin, as the same link", () => {
    const search =
      "https://www.google.com/maps/search/?api=1&query=The%20Kimana%20Towers%20Ahmedabad";
    for (const held of [
      search,
      "https://www.google.com/maps?q=23.0272712,72.4894294",
    ]) {
      const item = byKey(
        compareWithRecord(
          withDetails,
          { "property.google_maps_url": held },
          entities,
        ),
      )["property.google_maps_url"];
      expect(item.status).toBe("same");
      expect(item.proposedValue).toBeNull();
    }
  });

  it("never overwrites a pin or a link an admin already holds, but shows the difference", () => {
    const held = {
      "property.latitude": 23.03,
      "property.longitude": 72.5,
      "property.google_maps_url":
        "https://www.google.com/maps/place/Kimana/@23.03,72.5,17z",
    };
    const compared = compareWithRecord(withDetails, held, entities);
    const items = byKey(compared);

    for (const key of [
      "property.latitude",
      "property.longitude",
      "property.google_maps_url",
    ]) {
      expect(items[key].status).toBe("differs");
      expect(items[key].proposedValue).toBeNull();
    }
    expect(writableItems(compared).map((item) => item.fieldKey)).not.toContain(
      "property.latitude",
    );
  });

  it("falls back to a search from the name when RERA drew no boundary, and says so", () => {
    const noBoundary: RegulatorRecord = {
      ...withDetails,
      details: { ...withDetails.details!, boundary: [], centre: null },
    };
    const items = byKey(
      compareWithRecord(noBoundary, { "property.locality": "Ambli" }, entities),
    );

    expect(items["property.latitude"].status).toBe("rera_silent");
    expect(items["property.google_maps_url"].status).toBe("not_held");
    expect(items["property.google_maps_url"].proposedValue).toBe(
      "https://www.google.com/maps/search/?api=1&query=The%20Kimana%20Towers%20Ambli%20Ahmedabad",
    );
    expect(items["property.google_maps_url"].note).toMatch(/search/i);
  });

  it("says which filing the progress figure is from", () => {
    const items = byKey(compareWithRecord(withDetails, {}, entities));

    expect(items["property.rera_construction_progress_percent"].note).toMatch(
      /quarterly filing \(Q-14, period ending 2026-06-30\)/,
    );
  });

  it("proposes the snapshot, and calls it the same only when every fact matches", () => {
    const first = byKey(compareWithRecord(withDetails, {}, entities));
    const snapshot = first["property.rera_snapshot"];

    expect(snapshot.status).toBe("not_held");
    expect(snapshot.reraValue).toMatch(
      /filing Q-14, 13 units available as on 2026-07-03/,
    );

    const held = { "property.rera_snapshot": snapshot.proposedValue };
    expect(
      byKey(compareWithRecord(withDetails, held, entities))[
        "property.rera_snapshot"
      ].status,
    ).toBe("same");

    const changed: RegulatorRecord = {
      ...withDetails,
      details: {
        ...withDetails.details!,
        inventory: { ...withDetails.details!.inventory!, availableUnits: 9 },
      },
    };
    expect(
      byKey(compareWithRecord(changed, held, entities))[
        "property.rera_snapshot"
      ].status,
    ).toBe("differs");
  });

  it("proposes the floors the latest filing states, and says why a difference needs a look", () => {
    const withFloors: RegulatorRecord = {
      ...withDetails,
      details: {
        ...withDetails.details!,
        filing: {
          ...withDetails.details!.filing,
          blocks: [
            { name: "A", progressPercent: 50, floors: 22, lifts: 4, slabs: 24 },
            { name: "B", progressPercent: 50, floors: 20, lifts: 4, slabs: 24 },
          ],
        },
      },
    };

    const none = byKey(compareWithRecord(withFloors, {}, entities));
    expect(none["property.total_floors"]).toMatchObject({
      status: "not_held",
      proposedValue: 22,
    });

    const held = byKey(
      compareWithRecord(withFloors, { "property.total_floors": 24 }, entities),
    );
    expect(held["property.total_floors"]).toMatchObject({
      status: "differs",
      proposedValue: 22,
      currentValue: 24,
    });
    expect(held["property.total_floors"].note).toMatch(
      /podium, stilt or terrace/,
    );

    // A record with no filing blocks says nothing about floors.
    expect(
      byKey(compareWithRecord(record, {}, entities))["property.total_floors"]
        .status,
    ).toBe("rera_silent");
  });

  it("adds none of these for a record that predates them", () => {
    const keys = compareWithRecord(record, {}, entities).map(
      (item) => item.fieldKey,
    );

    for (const key of [
      "property.latitude",
      "property.google_maps_url",
      "property.rera_snapshot",
    ]) {
      expect(keys).not.toContain(key);
    }
  });
});

describe("legalEntityTypeFromRera", () => {
  it.each([
    ["LIMITED LIABILITY PARTNERSHIP FIRM", "llp"],
    ["Limited Liability Partnership", "llp"],
    ["PARTNERSHIP FIRM", "partnership"],
    ["COMPANY", "company"],
    ["PRIVATE LIMITED COMPANY", "company"],
    ["INDIVIDUAL/PROPRIETORSHIP", "proprietorship"],
    ["TRUST", "trust"],
  ])("reads %j as %s", (wording, expected) => {
    expect(legalEntityTypeFromRera(wording)).toBe(expected);
  });

  it("says other, never a guess, for wording it does not know or none at all", () => {
    expect(legalEntityTypeFromRera("SOCIETY")).toBe("other");
    expect(legalEntityTypeFromRera("")).toBe("other");
    expect(legalEntityTypeFromRera(null)).toBe("other");
  });
});

describe("amenities from RERA's flags", () => {
  const labels = {
    clubhouse: "Clubhouse",
    landscaped_garden: "Landscaped garden",
    swimming_pool: "Swimming pool",
  };
  const flagged: RegulatorRecord = {
    ...record,
    declaredAmenityKeys: ["landscaped_garden"],
    notProposedAmenityKeys: ["clubhouse", "multipurpose_hall"],
  };

  it("adds a declared amenity to the brochure's set and removes nothing", () => {
    const item = byKey(
      compareWithRecord(
        flagged,
        { "property.amenities": ["gymnasium", "clubhouse"] },
        entities,
        labels,
      ),
    )["property.amenities"];

    expect(item.proposedValue).toEqual([
      "gymnasium",
      "clubhouse",
      "landscaped_garden",
    ]);
  });

  it("only prompts a check when RERA does not propose something the brochure lists", () => {
    const item = byKey(
      compareWithRecord(
        flagged,
        {
          "property.amenities": ["gymnasium", "clubhouse", "landscaped_garden"],
        },
        entities,
        labels,
      ),
    )["property.amenities"];

    // Nothing to change: the brochure is kept.
    expect(item.status).toBe("same");
    expect(item.proposedValue).toBeNull();
    expect(item.note).toMatch(/does not propose Clubhouse/);
    expect(item.note).toMatch(/brochure is kept/i);
  });

  it("stays quiet when the brochure lists nothing RERA does not propose", () => {
    const item = byKey(
      compareWithRecord(
        flagged,
        { "property.amenities": ["gymnasium"] },
        entities,
        labels,
      ),
    )["property.amenities"];

    expect(item.note).not.toMatch(/does not propose/);
  });

  it("says nothing about not-proposed amenities for a record that predates them", () => {
    const item = byKey(
      compareWithRecord(
        { ...record, declaredAmenityKeys: [] },
        { "property.amenities": ["clubhouse"] },
        entities,
        labels,
      ),
    )["property.amenities"];

    expect(item.note).not.toMatch(/does not propose/);
  });
});
