import { describe, expect, it } from "vitest";
import {
  focusFromPriorities,
  orderGroups,
  orderSummary,
  parseFocus,
} from "./focus";
import type { CompareGroup, SummaryLine } from "./model";

const group = (key: CompareGroup["key"], rowKeys: string[]): CompareGroup => ({
  key,
  title: key,
  rows: rowKeys.map((rowKey) => ({
    key: rowKey,
    label: rowKey,
    cells: [],
    status: "same" as const,
  })),
});

const groups = [
  group("timeline", ["possession_date"]),
  group("unit_type", ["area_carpet"]),
  group("rooms", ["rooms_bedroom"]),
  group("project", ["towers"]),
  group("amenities", ["amenity_pool"]),
  group("specifications", ["spec_floor"]),
  group("trust", ["rera_number"]),
];

describe("parseFocus", () => {
  it("keeps known keys in chip order and drops the rest", () => {
    expect(parseFocus("timeline,space,nonsense,space")).toEqual([
      "space",
      "timeline",
    ]);
    expect(parseFocus(null)).toEqual([]);
    expect(parseFocus("")).toEqual([]);
  });
});

describe("focusFromPriorities", () => {
  it("maps the intake priorities that have a comparison group and drops the others", () => {
    expect(
      focusFromPriorities([
        "family_space",
        "location",
        "privacy",
        "possession_speed",
      ]),
    ).toEqual(["space", "timeline"]);
    expect(focusFromPriorities(["location"])).toEqual([]);
  });
});

describe("orderGroups", () => {
  it("changes nothing without a focus", () => {
    expect(orderGroups(groups, []).map((g) => g.key)).toEqual(
      groups.map((g) => g.key),
    );
  });

  it("brings focused groups first and keeps every group", () => {
    const ordered = orderGroups(groups, ["amenities", "space"]).map(
      (g) => g.key,
    );
    // Chip order is space, then amenities; the rest keep their order.
    expect(ordered.slice(0, 3)).toEqual(["unit_type", "rooms", "amenities"]);
    expect([...ordered].sort()).toEqual(groups.map((g) => g.key).sort());
  });
});

describe("orderSummary", () => {
  it("leads with lines about the focused groups, keeping the order otherwise", () => {
    const summary: SummaryLine[] = [
      { rowKey: "possession_date", text: "a" },
      { rowKey: "area_carpet", text: "b" },
      { rowKey: "towers", text: "c" },
    ];
    expect(
      orderSummary(summary, groups, ["space"]).map((line) => line.text),
    ).toEqual(["b", "a", "c"]);
    expect(orderSummary(summary, groups, [])).toEqual(summary);
  });
});
