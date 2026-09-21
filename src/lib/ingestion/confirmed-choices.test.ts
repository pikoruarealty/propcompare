import { describe, expect, it } from "vitest";
import { readConfirmedChoices } from "./confirmed-choices";
import { buildConfirmedRoutingManifest } from "./routing-confirmation";

describe("readConfirmedChoices", () => {
  it("gives back exactly the choices a manifest was built from, project pages included", () => {
    const choices = [
      { pageNumber: 1, category: "project_details" as const },
      { pageNumber: 2, category: "ignore" as const },
      { pageNumber: 3, category: "amenities" as const },
      { pageNumber: 4, category: "specifications" as const },
      { pageNumber: 5, category: "floor_plan" as const },
      { pageNumber: 6, category: "project_details" as const },
    ];
    const manifest = buildConfirmedRoutingManifest(choices, 6);

    // The amenities step also reads pages 1 and 6, yet they stay project details.
    expect(readConfirmedChoices(manifest, 6)).toEqual(choices);
  });

  it("returns null for something that is not a manifest", () => {
    expect(readConfirmedChoices({ nope: true }, 3)).toBeNull();
    expect(readConfirmedChoices(null, 3)).toBeNull();
  });
});
