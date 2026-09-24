import { describe, expect, it } from "vitest";
import { richDossierFixture } from "@/lib/properties/fixtures";
import { lockComparison } from "./lock";
import { buildComparison } from "./model";

const model = buildComparison(
  [
    { ...richDossierFixture, slug: "a", name: "Alpha Heights" },
    { ...richDossierFixture, slug: "b", name: "Beta Residency" },
  ],
  {},
);

describe("lockComparison", () => {
  it("keeps the identity, the summary and every row's label", () => {
    const locked = lockComparison(model);

    expect(locked.columns.map((c) => c.name)).toEqual([
      "Alpha Heights",
      "Beta Residency",
    ]);
    expect(locked.summary).toEqual(model.summary);
    expect(locked.groups.map((g) => [g.key, g.title])).toEqual(
      model.groups.map((g) => [g.key, g.title]),
    );
    expect(locked.groups.flatMap((g) => g.rows.map((r) => r.label))).toEqual(
      model.groups.flatMap((g) => g.rows.map((r) => r.label)),
    );
  });

  it("carries no cell, no floor plan and no row status", () => {
    const locked = lockComparison(model);

    expect(locked.groups.flatMap((g) => g.rows).length).toBeGreaterThan(0);
    for (const row of locked.groups.flatMap((g) => g.rows)) {
      expect(row.cells).toEqual([]);
      expect(row.status).toBe("same");
    }
    for (const column of locked.columns) expect(column.floorPlans).toEqual([]);
  });

  it("serialises with no cell content, so nothing reaches the client payload", () => {
    const locked = JSON.stringify(lockComparison(model));

    expect(JSON.stringify(model)).toContain('"cells":[{');
    expect(locked).not.toContain('"cells":[{');
    expect(locked).not.toContain('"regulatorChecked"');
    expect(locked).not.toContain('"floorPlans":[{');
  });
});
