import { describe, expect, it } from "vitest";
import { identityPicture } from "./identity-picture";
import type { DossierMedia } from "./types";

const item = (
  id: string,
  mediaType: DossierMedia["mediaType"],
  isPrimary = false,
): DossierMedia => ({
  id,
  mediaType,
  gcsPath: id,
  caption: null,
  unitVariantId: null,
  isPrimary,
  attribution: null,
});

describe("identityPicture", () => {
  it("prefers a photo over a floor plan that comes first (Anamika: floor plans at display order 0)", () => {
    expect(
      identityPicture([item("plan", "floor_plan"), item("photo", "photo")])?.id,
    ).toBe("photo");
  });

  it("prefers the primary photo, then any photo", () => {
    expect(
      identityPicture([item("a", "photo"), item("b", "photo", true)])?.id,
    ).toBe("b");
    expect(
      identityPicture([item("plan", "floor_plan", true), item("a", "photo")])
        ?.id,
    ).toBe("a");
  });

  it("falls back to a floor plan only when there is no photo, and never to a video or brochure", () => {
    expect(
      identityPicture([item("pdf", "brochure_pdf"), item("plan", "floor_plan")])
        ?.id,
    ).toBe("plan");
    expect(
      identityPicture([item("v", "video"), item("d", "brochure_pdf")]),
    ).toBe(null);
    expect(identityPicture([])).toBeNull();
  });
});
