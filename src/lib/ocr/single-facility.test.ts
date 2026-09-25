import { describe, expect, it } from "vitest";
import {
  ROUTER_EVIDENCE_PREFIX,
  buildFacilityMatcher,
  isRouterEvidence,
  normaliseFacilityName,
  routerEvidenceSnippet,
} from "./single-facility";
import { buildSubmissionFieldCandidates } from "./adapter";
import type { NewPipelineExtraction } from "./adapter";
import { parseOcrRoutingManifest } from "./routing";

/**
 * A single-facility page's caption, matched against the catalog
 * (`docs/tasklists/2026-09-23-single-facility-amenity-matching.md`).
 */

const catalog = [
  {
    key: "swimming_pool",
    label: "Swimming pool",
    synonyms: ["indoor pool", "infinity pool"],
  },
  { key: "gym", label: "Gymnasium", synonyms: ["gym", "fully equipped gym"] },
  { key: "clubhouse", label: "Clubhouse", synonyms: ["club house"] },
  { key: "banquet_hall", label: "Banquet hall", synonyms: ["party hall"] },
  { key: "party_lawn", label: "Party lawn", synonyms: ["party hall"] },
];

describe("normaliseFacilityName", () => {
  it("ignores case, punctuation, spacing and a trailing plural", () => {
    expect(normaliseFacilityName("  Swimming   POOLS! ")).toBe("swimming pool");
    expect(normaliseFacilityName("Sports & Games")).toBe("sport and game");
  });
});

describe("buildFacilityMatcher", () => {
  const match = buildFacilityMatcher(catalog);

  it("matches a caption that is exactly a catalog name or a synonym", () => {
    expect(match("Swimming Pool")).toEqual({
      key: "swimming_pool",
      label: "Swimming pool",
    });
    expect(match("swimming pools")?.key).toBe("swimming_pool");
    expect(match("Infinity Pool")?.key).toBe("swimming_pool");
    expect(match("GYM")?.key).toBe("gym");
    expect(match("Club-house")?.key).toBe("clubhouse");
  });

  it("matches nothing for a facility the catalog does not have, or a tagline", () => {
    expect(match("Observatory")).toBeNull();
    expect(match("Dive in for sheer bliss")).toBeNull();
    expect(match("Pool and gym")).toBeNull();
    expect(match("")).toBeNull();
  });

  it("does not guess between two amenities that share a name", () => {
    expect(match("Party Hall")).toBeNull();
  });
});

describe("the evidence a suggestion carries", () => {
  const page = {
    pageNumber: 14,
    caption: "Swimming Pool",
    amenityKey: "swimming_pool",
    amenityLabel: "Swimming pool",
  };

  it("says plainly the router named it and no extraction read it", () => {
    const snippet = routerEvidenceSnippet(page);

    expect(snippet.startsWith(ROUTER_EVIDENCE_PREFIX)).toBe(true);
    expect(snippet).toContain("Swimming Pool");
    expect(snippet).toContain("page 14");
    expect(isRouterEvidence(snippet)).toBe(true);
    expect(isRouterEvidence("Swimming pool with a deck")).toBe(false);
    expect(isRouterEvidence(null)).toBe(false);
  });
});

describe("merging suggestions into the amenities candidate", () => {
  const manifestWith = (singleFacilities?: unknown) =>
    parseOcrRoutingManifest(
      {
        version: "v2",
        pageCount: 5,
        scopes: [
          {
            scopeKey: "amenities",
            kind: "amenities",
            label: "Amenities",
            pages: [{ pageNumber: 1 }],
          },
          {
            scopeKey: "ignored",
            kind: "ignore",
            label: "Not selected for extraction",
            pages: [
              { pageNumber: 2 },
              { pageNumber: 3 },
              { pageNumber: 4 },
              { pageNumber: 5 },
            ],
          },
        ],
        ...(singleFacilities === undefined ? {} : { singleFacilities }),
      },
      5,
    );

  const extraction = (fields: NewPipelineExtraction["fields"]) =>
    ({
      origin: "new_pipeline",
      pipelineVersion: "ocr-v1",
      fieldSchemaVersion: "v1",
      fields,
      unitVariants: [],
    }) as NewPipelineExtraction;

  const pool = {
    pageNumber: 2,
    caption: "Swimming Pool",
    amenityKey: "swimming_pool",
    amenityLabel: "Swimming pool",
  };
  const gym = {
    pageNumber: 4,
    caption: "Gym",
    amenityKey: "gym",
    amenityLabel: "Gymnasium",
  };

  it("adds them to what the extraction read, keeping its own evidence", () => {
    const manifest = manifestWith([pool, gym]);

    const [amenities] = buildSubmissionFieldCandidates(
      extraction([
        {
          fieldKey: "property.amenities",
          value: ["clubhouse", "gym"],
          confidence: 0.9,
          evidence: [{ scopeKey: "amenities", pageNumber: 1 }],
        },
      ]),
      manifest,
    );

    expect(amenities.value).toEqual(["clubhouse", "gym", "swimming_pool"]);
    expect(amenities.confidence).toBe(0.9);
    expect(amenities.evidence.map((e) => e.pageNumber)).toEqual([1, 2, 4]);
    expect(amenities.evidence[0].sourceSnippet).toBeUndefined();
    expect(isRouterEvidence(amenities.evidence[1].sourceSnippet)).toBe(true);
    expect(isRouterEvidence(amenities.evidence[2].sourceSnippet)).toBe(true);
  });

  it("makes the amenities candidate on their own when the read found none", () => {
    const candidates = buildSubmissionFieldCandidates(
      extraction([
        {
          fieldKey: "property.name",
          value: "Example",
          confidence: 0.9,
          evidence: [{ scopeKey: "amenities", pageNumber: 1 }],
        },
      ]),
      manifestWith([pool]),
    );

    const amenities = candidates.find(
      (candidate) => candidate.fieldKey === "property.amenities",
    );
    expect(amenities?.value).toEqual(["swimming_pool"]);
    expect(amenities?.confidence).toBeUndefined();
    expect(amenities?.evidence).toHaveLength(1);
  });

  it("changes nothing when no page was suggested", () => {
    const fields = [
      {
        fieldKey: "property.amenities",
        value: ["clubhouse"],
        confidence: 0.9,
        evidence: [{ scopeKey: "amenities", pageNumber: 1 }],
      },
    ];

    const [amenities] = buildSubmissionFieldCandidates(
      extraction(fields),
      manifestWith(),
    );

    expect(amenities.value).toEqual(["clubhouse"]);
    expect(amenities.evidence).toHaveLength(1);
  });

  it("does not list an amenity twice when the read also found it", () => {
    const [amenities] = buildSubmissionFieldCandidates(
      extraction([
        {
          fieldKey: "property.amenities",
          value: ["swimming_pool"],
          confidence: 0.9,
          evidence: [{ scopeKey: "amenities", pageNumber: 1 }],
        },
      ]),
      manifestWith([pool]),
    );

    expect(amenities.value).toEqual(["swimming_pool"]);
  });
});

describe("the manifest's singleFacilities", () => {
  const base = (singleFacilities: unknown) => ({
    version: "v2",
    pageCount: 3,
    scopes: [
      {
        scopeKey: "details",
        kind: "property_details",
        label: "Details",
        pages: [{ pageNumber: 1 }],
      },
      {
        scopeKey: "ignored",
        kind: "ignore",
        label: "Not selected for extraction",
        pages: [{ pageNumber: 2 }, { pageNumber: 3 }],
      },
    ],
    singleFacilities,
  });
  const entry = (pageNumber: number) => ({
    pageNumber,
    caption: "Swimming Pool",
    amenityKey: "swimming_pool",
    amenityLabel: "Swimming pool",
  });

  it("is kept when every suggested page is in the ignored scope", () => {
    expect(
      parseOcrRoutingManifest(base([entry(2)]), 3).singleFacilities,
    ).toEqual([entry(2)]);
  });

  it("is refused for a page an extraction scope also reads", () => {
    expect(() => parseOcrRoutingManifest(base([entry(1)]), 3)).toThrow(
      /ignored scope/,
    );
  });

  it("is refused for a repeated page, a missing page, or a bad shape", () => {
    expect(() =>
      parseOcrRoutingManifest(base([entry(2), entry(2)]), 3),
    ).toThrow(/repeats page 2/);
    expect(() => parseOcrRoutingManifest(base([entry(9)]), 3)).toThrow(
      /page count/,
    );
    expect(() => parseOcrRoutingManifest(base("pool"), 3)).toThrow(/array/);
    expect(() =>
      parseOcrRoutingManifest(
        base([
          { pageNumber: 2, caption: "", amenityKey: "x", amenityLabel: "X" },
        ]),
        3,
      ),
    ).toThrow(/caption/);
  });

  it("is absent from a manifest that has none", () => {
    expect(
      parseOcrRoutingManifest(base(undefined), 3).singleFacilities,
    ).toBeUndefined();
  });
});
