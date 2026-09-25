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
      projectDesc: "Residential Apartments",
      pinCode: null,
      totAreaOfLand: 7628,
      totAreaOfLandLayout: 7628,
      totLandAreaForProjectUnderReg: 7628,
      totCarpetArea: 25356.46,
      totCoverdArea: 4496.9,
      totOpenArea: 3131.1,
      coveredParkingArea: 12553.45,
      approvingAuthority: "AUDA",
      coveredParking: 246,
      costOfLand: POISON,
      estimatedCost: POISON,
      totalProjectCost: POISON,
    },
    // Kimana leaves the swimming-pool flag blank: not stated, not "no".
    dev: [{ sewSwimCapacityFlag: null, sewDisposalFlag: null }],
    contr: [
      {
        contractortName: "Builder Ltd",
        emailId: POISON_TEXT,
        mobileNo: POISON_TEXT,
        noofkeyprojectscompleted: "24",
      },
    ],
    acrchlist: [
      {
        name: "HM Architects",
        emailId: POISON_TEXT,
        mobileNo: POISON_TEXT,
        panNo: POISON_TEXT,
        noOfKeyProjectCompleted: 62,
      },
    ],
    englist: [
      {
        name: "Setu Infrastructure",
        engemailId: POISON_TEXT,
        mobileNo: POISON_TEXT,
        noOfKeyProjectsCompleted: "80",
      },
    ],
  },
};

/** Amaris (project 28310): declares a pool, four blocks, a described mix. */
export const amarisDetailResponse = {
  ...detailResponse,
  data: {
    ...detailResponse.data,
    projectDetail: {
      ...detailResponse.data.projectDetail,
      projectName: "AMARIS",
      projectDesc: "4BHK and 5BHK (Penthouse)",
      pinCode: "382481",
      totAreaOfLandLayout: 15949,
      totLandAreaForProjectUnderReg: 15949,
      coveredParking: 1327,
    },
    dev: [
      {
        sewSwimCapacityFlag: "Yes",
        sewSwimCapLiter: "244080.00",
        sewSwimCapLenght: 22.6,
      },
    ],
  },
};

export const formOneResponse = {
  status: 200,
  data: {
    progressReport: 67.71875,
    formOneAList: [
      {
        blockId: 63414,
        blockName: "A+B",
        totalNoOfSlabs: "24",
        blockProgress: 75.3125,
      },
    ],
  },
};

export const amarisFormOneResponse = {
  status: 200,
  data: {
    formOneAList: ["A", "B", "C", "D"].map((blockName) => ({
      blockName,
      totalNoOfSlabs: "14",
      blockProgress: 0,
    })),
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
    formOneId: 278008,
    approvedDate: "11-11-2022",
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
  bookedUnit: 24,
  unBookedUnit: 52,
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

/** One row of the per-flat list, with the price, buyer and phone fields the real
 * response carries (poisoned) beside the three the adapter may read. */
const flatRow = (
  flatNo: string,
  carpetArea: number,
  status: "BOOKED" | "UNBOOKED" = "BOOKED",
) => ({
  id: POISON,
  formThreePk: 417562,
  blockId: null,
  blockName: "A+B",
  usage: "Residential",
  flatNo,
  carpetArea,
  areaofExBalcony: 194.42,
  status,
  unitConsideration: String(POISON),
  receivedAmount: String(POISON),
  balanceAmount: String(POISON),
  encumbranceStatus: "Created",
  dateOfAgrrement: "2025-01-01",
  alloteeName: POISON_TEXT,
  typeofKYC: "PAN",
  kycId: POISON_TEXT,
  redeveloped: null,
  mobileNumber: POISON_TEXT,
  createdOn: "2026-07-03T09:00:00.000+0530",
  kycid: POISON_TEXT,
});

/** Kimana's flat list as GujRERA shows it: 76 flats in four carpet areas (square
 * metres): block A 36 at 369.54 and 2 at 572.59, block B 36 at 277.26 and 2 at
 * 463.24. Flat numbers run from floor 3 to floor 20, then the two penthouses. */
export const flatListResponse = (() => {
  const rows: ReturnType<typeof flatRow>[] = [];
  for (const [block, typical, penthouse] of [
    ["A", 369.54, 572.59],
    ["B", 277.26, 463.24],
  ] as const) {
    for (let floor = 3; floor <= 20; floor += 1) {
      // Floors 3 to 8 are booked: 12 of each block's 36 typical flats.
      const status = floor <= 8 ? "BOOKED" : "UNBOOKED";
      rows.push(flatRow(`${block}-${floor}01`, typical, status));
      rows.push(flatRow(`${block}-${floor}02`, typical, status));
    }
    rows.push(flatRow(`${block}-2101`, penthouse, "UNBOOKED"));
    rows.push(flatRow(`${block}-2102`, penthouse, "UNBOOKED"));
  }
  return {
    status: 200,
    masssge: "Success",
    errKey: null,
    code: null,
    data: rows,
  };
})();

/** The quarterly filing the site's own tabs read: its form ids differ from the
 * registration summary's (which can be a later draft). */
export const qtrDetailsResponse = {
  status: "200",
  message: "Data Found Successfully",
  data: { formOneId: 325057, formTwoId: null, formThreeId: 446362 },
};

/** Kimana's July 2026 filing: 93.7% overall, one block of 22 floors and 8 lifts. */
export const latestFormOneResponse = {
  status: "200",
  masssge: "DATA FOUND",
  data: {
    formOneId: 325057,
    progressReport: 93.72324444444445,
    formOneAList: [
      {
        blockName: "A+B",
        totalNoOfSlabs: "24",
        blockProgress: 95.86533333333334,
        noOfFloors: 22,
        noOfLifts: 8,
        noOfUnitsBooked: 63,
        photoDocList: [
          { latitude: "", longitude: "", photoExternalId: POISON_TEXT },
        ],
      },
    ],
  },
};

/** The same filing with Form 1B's yes/no answers: landscaping proposed, community
 * buildings not. Everything else in Form 1B is left out on purpose. */
export const latestFormOneWithFlagsResponse = {
  ...latestFormOneResponse,
  data: {
    ...latestFormOneResponse.data,
    formOneB: {
      landscapingYesNo: "YES",
      communityBuildingsYesNo: "NO",
      securityYesNo: "YES",
      fireProtectionYesNo: "YES",
    },
  },
};

/** The drawn boundary (closed ring, first point repeated) and, beside it, a
 * project cost that must never be read. */
export const boundaryResponse = {
  locId: 11173,
  projectName: "The Kimana Towers",
  projectCost: POISON,
  coordinates: [
    { locId: 1, lat: "23.027580847592397", lang: "72.48880773049679" },
    { locId: 2, lat: "23.027487045257566", lang: "72.49006032210674" },
    { locId: 3, lat: "23.026948914812206", lang: "72.49006032210674" },
    { locId: 4, lat: "23.02707233941613", lang: "72.48875408631649" },
    { locId: 5, lat: "23.027580847592397", lang: "72.48880773049679" },
  ],
};

/** The routes a project with a readable latest filing adds. */
export const latestFilingRoutes = {
  "/quarter/public/get-qtr-form-details/17929": qtrDetailsResponse,
  "/formone/public/getfrom-one-byformone-id/325057": latestFormOneResponse,
  "/formthree/public/get-fromthree-a-details-byid/446362": inventoryResponse,
  "/maplocation/public/getProjectLocations/17929": boundaryResponse,
};

/** The promoter's own record, as `/user_reg/promoter/promoter{id}` returns it: not
 * wrapped in `data`, and holding contact details, a PAN and an address beside the
 * group's history. Only the three history figures may reach a record. */
export const promoterResponse = {
  id: 17009,
  promoterName: "SUN VN DEVELOPERS LLP",
  promoterType: "LIMITED LIABILITY PARTNERSHIP FIRM",
  emailId: POISON_TEXT,
  mobileNo: "0000000000",
  panNo: "POISON-PAN",
  address: "POISON ADDRESS",
  entities_websiteUrl: "https://poison.example.invalid/",
  entities_groupHistory: "11",
  entities_experienceGroupEntity: "3",
  entities_experienceInState: "11",
  entities_experienceInOtherState: "0",
  entities_totalProjects: "1",
  entities_totalAreaConstructed: "0",
  entities_noOfProjectsCompleted: "0",
  entities_areaConstructed: "7799",
  entities_ongoingProjects: "1",
  entities_proposedAreaConstructed: "0",
};
