import { describe, expect, it } from "vitest";
import {
  describeEvent,
  readVisitorFilter,
  visitorLabel,
  type EventFacts,
} from "./visitors";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const facts = (over: Partial<EventFacts>): EventFacts => ({
  event: "property_viewed",
  signedIn: false,
  engagedMs: null,
  detail: null,
  budgetBand: null,
  propertyName: "Kimana Towers",
  comparedNames: [],
  unitTypeName: null,
  ...over,
});

describe("visitorLabel", () => {
  it("is the first six characters of the id, capitalised", () => {
    expect(visitorLabel("9936be25-9005-4a00-a4e1-5efa054f690f")).toBe(
      "Visitor 9936BE",
    );
  });
});

describe("readVisitorFilter", () => {
  it("keeps only what fits and ignores the rest", () => {
    expect(
      readVisitorFilter({
        reached: "opened",
        stopped: "viewed",
        property: A,
        pair: `${A},${B}`,
      }),
    ).toEqual({
      reached: "opened",
      stopped: "viewed",
      propertyId: A,
      pair: [A, B],
    });
    expect(readVisitorFilter({ reached: "gate" })).toEqual({ reached: "gate" });
    expect(
      readVisitorFilter({
        reached: "everyone; drop table",
        stopped: "gate",
        property: "not-an-id",
        pair: `${A},${A}`,
      }),
    ).toEqual({});
    expect(readVisitorFilter({})).toEqual({});
  });

  it("reads source, budget band, device and section, and refuses what does not fit", () => {
    expect(
      readVisitorFilter({
        source: "google / cpc",
        band: "₹2–3 crore",
        device: "mobile",
        group: "unit_type",
      }),
    ).toEqual({
      source: "google / cpc",
      band: "₹2–3 crore",
      device: "mobile",
      group: "unit_type",
    });
    expect(
      readVisitorFilter({
        source: "x".repeat(201),
        group: "Robert'); drop table",
        device: "",
      }),
    ).toEqual({});
  });
});

describe("describeEvent", () => {
  it("says what happened in plain words, with names", () => {
    expect(describeEvent(facts({}))).toBe("Opened Kimana Towers");
    expect(
      describeEvent(
        facts({
          event: "compare_opened",
          comparedNames: ["Kimana Towers", "Anamika High Point"],
        }),
      ),
    ).toBe(
      "Opened a comparison of Kimana Towers and Anamika High Point, locked: not signed in",
    );
    expect(
      describeEvent(
        facts({
          event: "compare_opened",
          signedIn: true,
          comparedNames: ["A", "B", "C"],
        }),
      ),
    ).toBe("Opened a comparison of A, B and C, signed in");
    expect(
      describeEvent(
        facts({
          event: "page_engaged",
          engagedMs: 75_000,
          detail: { page: "dossier" },
        }),
      ),
    ).toBe("Spent 1m 15s on Kimana Towers");
    expect(
      describeEvent(
        facts({
          event: "comparison_removed",
          detail: { where: "tray" },
        }),
      ),
    ).toBe("Dropped Kimana Towers from the comparison tray");
    expect(
      describeEvent(
        facts({
          event: "compare_group_opened",
          detail: { group: "rooms" },
        }),
      ),
    ).toBe('Opened "Room by room" in the comparison');
    expect(
      describeEvent(
        facts({
          event: "compare_focus_set",
          detail: { focus: ["space", "trust"] },
        }),
      ),
    ).toBe("Chose the focus Space and Trust");
    expect(
      describeEvent(
        facts({
          event: "enquiry_submitted",
          comparedNames: ["Kimana Towers", "Anamika"],
        }),
      ),
    ).toBe(
      "Sent an enquiry about Kimana Towers, while comparing Kimana Towers and Anamika",
    );
  });

  it("never hides an event it has no words for", () => {
    expect(describeEvent(facts({ event: "some_new_event" }))).toBe(
      "Recorded some new event",
    );
  });
});
