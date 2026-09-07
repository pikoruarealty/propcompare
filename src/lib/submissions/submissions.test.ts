import { describe, expect, it } from "vitest";
import {
  applySubmissionTransition,
  SubmissionTransitionError,
} from "./transitions";
import {
  SubmissionPayloadError,
  validateSubmissionPayload,
  type ActiveSubmissionField,
  type SubmissionLookupContext,
} from "./validation";

describe("applySubmissionTransition", () => {
  it("allows a submitter to move a draft to submitted", () => {
    const result = applySubmissionTransition({
      currentStatus: "draft",
      action: "submit",
      actorRole: "submitter",
    });
    expect(result).toEqual({
      nextStatus: "submitted",
      timestampField: "submittedAt",
    });
  });

  it("allows a submitter to resubmit from changes_requested", () => {
    const result = applySubmissionTransition({
      currentStatus: "changes_requested",
      action: "submit",
      actorRole: "submitter",
    });
    expect(result.nextStatus).toBe("submitted");
  });

  it("rejects a submitter starting review", () => {
    expect(() =>
      applySubmissionTransition({
        currentStatus: "submitted",
        action: "start_review",
        actorRole: "submitter",
      }),
    ).toThrow(SubmissionTransitionError);
  });

  it("allows a verifier to move submitted into review", () => {
    const result = applySubmissionTransition({
      currentStatus: "submitted",
      action: "start_review",
      actorRole: "verifier",
    });
    expect(result.nextStatus).toBe("in_review");
  });

  it("allows a verifier to approve an in-review submission", () => {
    const result = applySubmissionTransition({
      currentStatus: "in_review",
      action: "approve",
      actorRole: "verifier",
    });
    expect(result).toEqual({
      nextStatus: "approved",
      timestampField: "reviewedAt",
    });
  });

  it("rejects a verifier publishing an approved submission", () => {
    expect(() =>
      applySubmissionTransition({
        currentStatus: "approved",
        action: "publish",
        actorRole: "verifier",
      }),
    ).toThrow("not permitted");
  });

  it("allows only an owner to publish an approved submission", () => {
    const result = applySubmissionTransition({
      currentStatus: "approved",
      action: "publish",
      actorRole: "owner",
    });
    expect(result).toEqual({
      nextStatus: "published",
      timestampField: "publishedAt",
    });
  });

  it("rejects publishing an already-published submission (duplicate publish)", () => {
    expect(() =>
      applySubmissionTransition({
        currentStatus: "published",
        action: "publish",
        actorRole: "owner",
      }),
    ).toThrow("cannot perform publish from status published");
  });

  it("allows an owner to perform every action, including submit", () => {
    const result = applySubmissionTransition({
      currentStatus: "draft",
      action: "submit",
      actorRole: "owner",
    });
    expect(result.nextStatus).toBe("submitted");
  });

  it("rejects an action from a status outside its allowed set", () => {
    expect(() =>
      applySubmissionTransition({
        currentStatus: "draft",
        action: "approve",
        actorRole: "owner",
      }),
    ).toThrow(SubmissionTransitionError);
  });
});

describe("validateSubmissionPayload", () => {
  const activeFields: ActiveSubmissionField[] = [
    { fieldKey: "property.name", dataType: "string" },
    { fieldKey: "developer.profile_narrative", dataType: "string" },
    { fieldKey: "property.type", dataType: "property_type_key" },
    { fieldKey: "property.total_floors", dataType: "positive_integer" },
    { fieldKey: "property.plot_area_sqft", dataType: "positive_number" },
    {
      fieldKey: "property.rera_construction_progress_percent",
      dataType: "percentage_0_to_100",
    },
    { fieldKey: "property.possession_status", dataType: "possession_status" },
    { fieldKey: "property.possession_date", dataType: "date" },
    { fieldKey: "property.amenities", dataType: "amenity_key_array" },
    { fieldKey: "unit_variants", dataType: "unit_variant_array" },
  ];

  const lookups: SubmissionLookupContext = {
    propertyTypeKeys: new Set(["apartment", "bungalow", "plot"]),
    bhkTypeKeys: new Set(["2bhk", "3bhk"]),
    layoutTypeKeys: new Set(["duplex", "penthouse"]),
    amenityKeys: new Set(["swimming_pool", "gym"]),
  };

  it("passes through a valid payload unchanged", () => {
    const payload = {
      "property.name": "Skyline Residences",
      "property.type": "apartment",
      "property.amenities": ["swimming_pool", "gym"],
    };
    expect(validateSubmissionPayload(payload, activeFields, lookups)).toEqual(
      payload,
    );
  });

  it("rejects a field not in the active field contract", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.unknown_field": "x" },
        activeFields,
        lookups,
      ),
    ).toThrow("not an active submission field");
  });

  it("accepts all schema v5 brochure fields when their contract entries are active", () => {
    const payload = {
      "developer.profile_narrative":
        "A developer with a documented project history.",
      "property.total_floors": 21,
      "property.plot_area_sqft": 108900,
      unit_variants: [{ variantName: "3 BHK - Type A", unitsPerFloor: 4 }],
    };

    expect(validateSubmissionPayload(payload, activeFields, lookups)).toEqual(
      payload,
    );
  });

  it("rejects each schema v5 brochure field when its active contract entry is absent", () => {
    const cases: Array<[string, unknown, string]> = [
      [
        "developer.profile_narrative",
        "Evidence-backed developer narrative",
        "developer.profile_narrative",
      ],
      ["property.total_floors", 21, "property.total_floors"],
      ["property.plot_area_sqft", 108900, "property.plot_area_sqft"],
      [
        "unit_variants",
        [{ variantName: "3 BHK - Type A", unitsPerFloor: 4 }],
        "unit_variants",
      ],
    ];

    for (const [fieldKey, value, disabledContractKey] of cases) {
      expect(() =>
        validateSubmissionPayload(
          { [fieldKey]: value },
          activeFields.filter(
            (field) => field.fieldKey !== disabledContractKey,
          ),
          lookups,
        ),
      ).toThrow("not an active submission field");
    }
  });

  it("rejects an unapproved property type key", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.type": "villa" },
        activeFields,
        lookups,
      ),
    ).toThrow(SubmissionPayloadError);
  });

  it("rejects a percentage outside 0-100", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.rera_construction_progress_percent": 150 },
        activeFields,
        lookups,
      ),
    ).toThrow("must be between 0 and 100");
  });

  it("accepts a boundary percentage of 0 and 100", () => {
    expect(
      validateSubmissionPayload(
        { "property.rera_construction_progress_percent": 0 },
        activeFields,
        lookups,
      ),
    ).toEqual({ "property.rera_construction_progress_percent": 0 });
  });

  it("rejects an unapproved possession status", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.possession_status": "delayed" },
        activeFields,
        lookups,
      ),
    ).toThrow("not an approved possession status");
  });

  it("rejects a malformed date", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.possession_date": "31-12-2027" },
        activeFields,
        lookups,
      ),
    ).toThrow("must be an ISO calendar date");
  });

  it("rejects duplicate amenity keys", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.amenities": ["gym", "gym"] },
        activeFields,
        lookups,
      ),
    ).toThrow("duplicate amenity keys");
  });

  it("rejects an unapproved amenity key", () => {
    expect(() =>
      validateSubmissionPayload(
        { "property.amenities": ["sauna"] },
        activeFields,
        lookups,
      ),
    ).toThrow("unapproved amenity key");
  });

  it("validates unit variants including areas and dimensions", () => {
    const payload = {
      unit_variants: [
        {
          variantName: "3 BHK Duplex",
          bhkTypeKey: "3bhk",
          layoutTypeKey: "duplex",
          totalUnitsOfVariant: 12,
          unitsPerFloor: 4,
          areas: [{ basis: "carpet", areaSqft: 1450 }],
          dimensions: {
            rooms: [{ name: "Master Bedroom", lengthFt: 14, widthFt: 12 }],
            foyer: null,
          },
        },
      ],
    };
    expect(validateSubmissionPayload(payload, activeFields, lookups)).toEqual(
      payload,
    );
  });

  it("rejects duplicate unit variant names (case-insensitive)", () => {
    expect(() =>
      validateSubmissionPayload(
        {
          unit_variants: [
            { variantName: "3 BHK Duplex" },
            { variantName: "3 bhk duplex" },
          ],
        },
        activeFields,
        lookups,
      ),
    ).toThrow("duplicate variant name");
  });

  it("rejects duplicate area bases within one variant", () => {
    expect(() =>
      validateSubmissionPayload(
        {
          unit_variants: [
            {
              variantName: "3 BHK Duplex",
              areas: [
                { basis: "carpet", areaSqft: 1450 },
                { basis: "carpet", areaSqft: 1500 },
              ],
            },
          ],
        },
        activeFields,
        lookups,
      ),
    ).toThrow("duplicate bases");
  });

  it("rejects a room with no supported measurement", () => {
    expect(() =>
      validateSubmissionPayload(
        {
          unit_variants: [
            {
              variantName: "3 BHK Duplex",
              dimensions: { rooms: [{ name: "Balcony" }] },
            },
          ],
        },
        activeFields,
        lookups,
      ),
    ).toThrow("must contain a supported measurement");
  });

  it("rejects a non-object payload", () => {
    expect(() =>
      validateSubmissionPayload("not an object", activeFields, lookups),
    ).toThrow("must be an object");
  });
});
