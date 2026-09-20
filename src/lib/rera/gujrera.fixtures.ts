/**
 * Responses shaped exactly like GujRERA's public endpoints (captured for The Kimana
 * Towers on 2026-09-20), trimmed to the fields that matter and with every price
 * and contact detail replaced by an obvious marker. `POISON` stands in for any
 * money value and `POISON_TEXT` for personal contact details: the adapter must
 * never let either reach a `RegulatorRecord`, and its tests check that.
 */
export const POISON = 999_999_999;
export const POISON_TEXT = "poison@example.invalid";

export const KIMANA_NUMBER =
  "PR/GJ/AHMEDABAD/AHMEDABAD CITY/AUDA/RAA10879/111122";

export const searchResponse = (
  hits: Record<string, unknown>[] = [kimanaSearchHit],
) => ({ status: 200, message: "Success", data: hits, totalPages: 1 });

export const kimanaSearchHit = {
  description: "Residential Apartments",
  entityType: "PROJECT",
  taluka: "Ahmedabad City",
  ptype: "Residential/Group Housing",
  maxarea: 572.59,
  minarea: 277.26,
  maxcost: POISON,
  mincost: POISON,
  entityName: "The Kimana Towers",
  distName: "Ahmedabad",
  emailId: POISON_TEXT,
  mobileNo: "0000000000",
  regNo: KIMANA_NUMBER,
  entityId: 17929,
  pdate: "21/06/2022 - 30/04/2027",
  address: "The Kimana Towers, Opp. Amrutbaug Party Plot, Bopal Ambli Road",
};

export const detailResponse = {
  status: 200,
  message: "Success",
  data: {
    projectDetail: {
      prjRegId: 17929,
      projectName: "The Kimana Towers",
      projectType: "Residential/Group Housing",
      startDate: "2022-06-21T00:00:00.000+0530",
      completionDate: "2027-04-30T00:00:00.000+0530",
      projectStatus: "New",
      projectAddress:
        "The Kimana Towers, Opp. Amrutbaug Party Plot, Bopal Ambli Road",
      projectAddress2: "Ambli",
      distName: "Ahmedabad",
      subDistName: "Ahmedabad City",
      totAreaOfLand: 7628,
      totCarpetArea: 25356.46,
      costOfLand: POISON,
      estimatedCost: POISON,
      totalProjectCost: POISON,
    },
    contr: [{ contractortName: "Builder Ltd", emailId: POISON_TEXT }],
  },
};

export const summaryResponse = {
  status: 200,
  message: "Success",
  data: {
    promoterType: "LIMITED LIABILITY PARTNERSHIP FIRM",
    projRegNo: KIMANA_NUMBER,
    projRegId: 17929,
    promoterId: 17009,
    promoterName: "SUN VN DEVELOPERS LLP",
    promoterEmailId: POISON_TEXT,
    promoterMobileNo: "0000000000",
    formThreeId: 417562,
  },
};

export const progressResponse = {
  status: "200",
  errorKey: null,
  masssge: "DATA FOUND",
  data: 67.71875,
  dataFormOneC: null,
};

/** Form-three's totals sit at the top level, unwrapped, beside prices. */
export const inventoryResponse = {
  receivedAmountTotal: String(POISON),
  balanceAmountTotal: String(POISON),
  totalBookedUnitConside: String(POISON),
  totalCansidrationAmt: String(POISON),
  numberOfUnits: 76,
  bookedUnit: 55,
  unBookedUnit: 21,
  totalCarpetArea: "25356.46",
};

export const quartersResponse = {
  status: 200,
  message: "Success",
  data: [
    {
      quarterName: "Q-13",
      qtrIndex: 13,
      endDate: "2026-03-31T23:59:59.000+0530",
      extendedDate: "2026-04-07T23:59:59.000+0530",
      submittedOn: "2026-04-04T18:47:59.000+0530",
      status: "SUBMITTED",
      penaltyAmt: POISON,
    },
    {
      quarterName: "Q-14",
      qtrIndex: 14,
      endDate: "2026-06-30T23:59:59.000+0530",
      extendedDate: "2026-07-07T23:59:59.000+0530",
      submittedOn: "2026-07-03T17:11:46.000+0530",
      status: "SUBMITTED",
      penaltyAmt: null,
    },
    {
      quarterName: "BWA-4",
      qtrIndex: 4,
      endDate: "2025-09-30T23:59:59.000+0530",
      extendedDate: "2025-09-29T23:59:59.000+0530",
      submittedOn: "2025-09-28T00:00:00.000+0530",
      status: "SUBMITTED",
    },
  ],
};
