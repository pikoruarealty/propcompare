import { describe, expect, it } from "vitest";
import type { AnalyticsDashboard } from "./dashboard";
import { insightsOf } from "./insights";

const base = (): AnalyticsDashboard =>
  ({
    funnel: [
      { key: "visited", label: "Visited", visitors: 0 },
      { key: "viewed", label: "Viewed a property", visitors: 0 },
      {
        key: "viewed_two",
        label: "Viewed two or more properties",
        visitors: 0,
      },
      { key: "started", label: "Added a property to compare", visitors: 0 },
      { key: "opened", label: "Opened a comparison", visitors: 0 },
      { key: "unlocked", label: "Compared signed in", visitors: 0 },
      { key: "saved", label: "Saved a property or comparison", visitors: 0 },
      { key: "enquired", label: "Sent an enquiry", visitors: 0 },
    ],
    gate: { reached: 0, unlocked: 0 },
    pairs: [],
    properties: [],
    groupsOpened: [],
  }) as unknown as AnalyticsDashboard;

describe("insightsOf", () => {
  it("says nothing when there is too little to say", () => {
    expect(insightsOf(base())).toEqual([]);
  });

  it("names where the most visitors stop and opens them", () => {
    const data = base();
    data.funnel[0].visitors = 20;
    data.funnel[1].visitors = 18;
    data.funnel[2].visitors = 6;
    const [first] = insightsOf(data);
    expect(first.text).toContain(
      '"Viewed a property": 18 visitors got there and 6 went on to "Viewed two or more properties". 12 visitors stopped.',
    );
    expect(first.query).toBe("stopped=viewed");
  });

  it("reports the most compared pair, dropped and unseen properties, the gate and a section", () => {
    const data = base();
    data.pairs = [
      {
        aId: "a",
        aName: "Kimana",
        bId: "b",
        bName: "Anamika",
        comparisons: 5,
        visitors: 3,
        medianSeconds: 40,
        enquiriesA: 1,
        enquiriesB: 0,
      },
    ];
    data.properties = [
      {
        id: "p1",
        name: "Amaris",
        views: 9,
        viewers: 4,
        medianDossierSeconds: 20,
        added: 2,
        removed: 3,
        inComparisons: 0,
        topRival: null,
        topRivalCount: 0,
        saves: 0,
        enquiries: 0,
        enquiriesAfterComparing: 0,
      },
    ];
    data.gate = { reached: 4, unlocked: 1 };
    data.groupsOpened = [{ label: "Room by room", count: 6 }];
    const texts = insightsOf(data).map((i) => i.text);
    expect(texts).toContain(
      "Kimana and Anamika are the pair compared most: 5 times by 3 visitors; enquiries while comparing them: Kimana 1, Anamika 0.",
    );
    expect(texts).toContain(
      "Amaris was dropped from a comparison 3 times and added 2 times.",
    );
    expect(texts).toContain(
      "Amaris was opened 9 times and has not been in a comparison.",
    );
    expect(texts).toContain(
      "1 of 4 visitors who reached a locked comparison signed in.",
    );
    // No sentence scores or crowns a property.
    expect(texts.join(" ")).not.toMatch(/winner|best|score|won/i);
  });
});
