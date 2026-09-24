import { describe, expect, it } from "vitest";
import { buildFacilityMatcher } from "@/lib/ocr/single-facility";
import { readConfirmedChoices } from "./confirmed-choices";
import { buildConfirmedRoutingManifest } from "./routing-confirmation";

/**
 * Confirming a brochure's page routing when an amenities page's caption names one
 * catalog amenity (`DECISIONS.md` 2026-09-24): the page is kept out of the paid
 * amenities read and offered as a suggestion instead.
 */

const matchFacility = buildFacilityMatcher([
  { key: "swimming_pool", label: "Swimming pool", synonyms: [] },
  { key: "gym", label: "Gymnasium", synonyms: ["gym"] },
]);

const scopeOf = (
  manifest: ReturnType<typeof buildConfirmedRoutingManifest>,
  kind: string,
) => manifest.scopes.find((scope) => scope.kind === kind);
const pagesOf = (
  manifest: ReturnType<typeof buildConfirmedRoutingManifest>,
  kind: string,
) => scopeOf(manifest, kind)?.pages.map((page) => page.pageNumber);

describe("a single-facility page in the confirmed routing", () => {
  const choices = [
    { pageNumber: 1, category: "project_details" as const },
    { pageNumber: 2, category: "amenities" as const, caption: "Swimming Pool" },
    { pageNumber: 3, category: "amenities" as const },
    { pageNumber: 4, category: "amenities" as const, caption: "Observatory" },
    { pageNumber: 5, category: "ignore" as const },
  ];

  it("is taken out of the amenities read and listed as a suggestion", () => {
    const manifest = buildConfirmedRoutingManifest(choices, 5, {
      matchFacility,
    });

    // Page 2 is not sent to the model; page 4 (no catalog match) still is.
    expect(pagesOf(manifest, "amenities")).toEqual([1, 3, 4]);
    expect(pagesOf(manifest, "ignore")).toEqual([2, 5]);
    expect(manifest.singleFacilities).toEqual([
      {
        pageNumber: 2,
        caption: "Swimming Pool",
        amenityKey: "swimming_pool",
        amenityLabel: "Swimming pool",
      },
    ]);
  });

  it("is read as before when no matcher is given", () => {
    const manifest = buildConfirmedRoutingManifest(choices, 5);

    expect(pagesOf(manifest, "amenities")).toEqual([1, 2, 3, 4]);
    expect(manifest.singleFacilities).toBeUndefined();
  });

  it("only ever applies to a page chosen as amenities", () => {
    const manifest = buildConfirmedRoutingManifest(
      [
        { pageNumber: 1, category: "project_details" },
        {
          pageNumber: 2,
          category: "project_details",
          caption: "Swimming Pool",
        },
        { pageNumber: 3, category: "ignore", caption: "Gym" },
      ],
      3,
      { matchFacility },
    );

    expect(manifest.singleFacilities).toBeUndefined();
    expect(pagesOf(manifest, "amenities")).toEqual([1, 2]);
  });

  it("is not skipped when that would leave nothing to extract", () => {
    const manifest = buildConfirmedRoutingManifest(
      [
        { pageNumber: 1, category: "amenities", caption: "Swimming Pool" },
        { pageNumber: 2, category: "ignore" },
      ],
      2,
      { matchFacility },
    );

    expect(pagesOf(manifest, "amenities")).toEqual([1]);
    expect(manifest.singleFacilities).toBeUndefined();
  });

  it("keeps the amenities scope out of the manifest when every amenity page was suggested", () => {
    const manifest = buildConfirmedRoutingManifest(
      [
        { pageNumber: 1, category: "project_details" },
        { pageNumber: 2, category: "amenities", caption: "Gym" },
      ],
      2,
      { matchFacility },
    );

    // Page 1 (project details) is still read for amenities, page 2 is suggested.
    expect(pagesOf(manifest, "amenities")).toEqual([1]);
    expect(manifest.singleFacilities?.map((page) => page.amenityKey)).toEqual([
      "gym",
    ]);
  });

  it("shows again as an amenities page with its caption, not as ignored", () => {
    const manifest = buildConfirmedRoutingManifest(choices, 5, {
      matchFacility,
    });

    expect(readConfirmedChoices(manifest, 5)).toEqual([
      { pageNumber: 1, category: "project_details" },
      { pageNumber: 2, category: "amenities", label: "Swimming Pool" },
      { pageNumber: 3, category: "amenities" },
      { pageNumber: 4, category: "amenities", label: "Observatory" },
      { pageNumber: 5, category: "ignore" },
    ]);
  });

  it("gives the same manifest when the choices are confirmed again", () => {
    const first = buildConfirmedRoutingManifest(choices, 5, { matchFacility });
    const again = buildConfirmedRoutingManifest(
      readConfirmedChoices(first, 5)!.map((choice) => ({
        pageNumber: choice.pageNumber,
        category: choice.category,
        caption: choice.label,
      })),
      5,
      { matchFacility },
    );

    expect(again).toEqual(first);
  });
});
