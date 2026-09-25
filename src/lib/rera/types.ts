/**
 * The one shape a regulator's public record is reduced to. Nothing outside a
 * regulator's own adapter knows where these values came from, so adding another
 * state's regulator means writing one adapter and registering it — the fetch job,
 * the comparison and the admin screens only ever see a `RegulatorRecord`.
 *
 * Deliberately narrow: only facts we hold a field for, plus the filing status the
 * "last checked" and quarterly refresh need. Money is never part of it. Regulator
 * sites publish project costs and per-unit prices; those must not enter this
 * record or the public tables it is stored in, so an adapter copies named fields and
 * ignores everything else. The one price a regulator gives that we use, a project's
 * minimum and maximum cost, travels separately (`RegulatorPriceRange`,
 * `RegulatorAdapter.lookupPriceRange`) into the `private` schema only
 * (`DECISIONS.md` 2026-09-24, "price data").
 */
export interface RegulatorRecord {
  regulatorCode: string;
  /** The regulator's own project registration number, as it prints it. */
  registrationNumber: string;
  /** The regulator's internal id for the project. Opaque; used to fetch detail. */
  externalProjectId: string;
  projectName: string;
  /** The registered promoter (legal entity) as the regulator names it. */
  promoterName: string | null;
  promoterType: string | null;
  /** The regulator's own wording ("Residential/Group Housing"); not our catalogue. */
  projectType: string | null;
  /** ISO dates (YYYY-MM-DD). */
  registeredFrom: string | null;
  completionDate: string | null;
  district: string | null;
  address: string | null;
  totalUnits: number | null;
  /** 0–100, as declared in the latest progress report. */
  constructionProgressPercent: number | null;
  /** The regulator's own description ("4BHK and 5BHK (Penthouse)"). Free text. */
  projectDescription: string | null;
  pincode: string | null;
  /** Land area of the project as registered, in square metres (not converted). */
  landAreaSqm: number | null;
  /** Covered parking slots the project declares. */
  coveredParkingSlots: number | null;
  /** The blocks the regulator lists, with their slab counts. A block can hold
   * several towers ("A+B") and a slab is not a storey, so these describe the
   * registration and are not a tower or floor count. */
  blocks: { name: string; slabs: number | null }[];
  /** What else the regulator states about the project (`DECISIONS.md` 2026-09-24,
   * "RERA data, second pass"). Absent on a record fetched before it was read. */
  details?: RegulatorDetails;
  /** Amenity-catalogue keys the regulator affirmatively declares. Only a positive
   * declaration is listed: a blank flag is not stated, never "not offered". */
  declaredAmenityKeys: string[];
  /** Amenity-catalogue keys the regulator's latest filing marks as not proposed.
   * Only ever a prompt to check a brochure claim: a "no" in a filing may mean "not
   * in this filing", so it never removes or disproves an amenity. Absent on a record
   * fetched before it was read. */
  notProposedAmenityKeys?: string[];
  /** The distinct carpet areas the regulator lists per block, with how many flats
   * have each. Square metres, as printed; converted once, where they are offered.
   * Flat numbers only: no price, status or person ever enters this. */
  carpetGroups: RegulatorCarpetGroup[];
  /** The most recent quarterly filing the regulator lists, if any. */
  latestQuarter: RegulatorQuarter | null;
  /** The public page a person can open to check this record. */
  sourceUrl: string;
  fetchedAt: string;
  /** Pieces the regulator did not return this time; the record is still usable. */
  gaps: string[];
}

/** A project's cheapest and dearest unit as the regulator states them, in whole rupees.
 * Commercial data: it goes to the `private` schema through the pricing module and
 * is never part of a `RegulatorRecord`, a stored job payload, or a buyer response. */
export interface RegulatorPriceRange {
  minInr: number;
  maxInr: number;
}

export interface RegulatorCarpetGroup {
  /** The block letter from the flat number ("A" for "A-301"), or null. */
  block: string | null;
  carpetAreaSqm: number;
  flatCount: number;
  firstFlat: string;
  lastFlat: string;
  /** How many of these flats the regulator lists as booked. Absent when the list
   * did not say, which is not the same as none. */
  bookedCount?: number;
  /** The smallest and largest exclusive balcony, veranda or open-terrace area
   * listed for these flats, square metres, as printed. */
  exclusiveAreaMinSqm?: number;
  exclusiveAreaMaxSqm?: number;
}

/** A point on the project's boundary, degrees. */
export interface RegulatorPoint {
  lat: number;
  lng: number;
}

export interface RegulatorBlockProgress {
  name: string;
  /** Percent complete for the block, from the latest filing. */
  progressPercent: number | null;
  /** Floors and lifts the filing states for the block; a block can hold several
   * towers, so these are the regulator's counts, not per tower. */
  floors: number | null;
  lifts: number | null;
  slabs: number | null;
}

/** A professional or contractor the registration names. Names and the count of
 * projects they state only: no address, licence, phone or email. */
export interface RegulatorParty {
  name: string;
  projectsCompleted: number | null;
}

/**
 * What the promoter's record states about its group (the regulator prints these
 * "by Group Entity"): years of work experience in Gujarat and how many projects the
 * group has completed and has ongoing. Counts and years only. The record also holds
 * the promoter's contact details, PAN and address, which are never read, and the
 * areas the group has built, which are not kept because the regulator reports an
 * area for "completed projects" even where the completed count is zero.
 */
export interface RegulatorPromoterHistory {
  yearsInGujarat: number | null;
  completedProjects: number | null;
  ongoingProjects: number | null;
}

/**
 * Facts the regulator states beyond the ones the contract already had a field for.
 * Money never appears here, nor a person's contact detail. Areas are square metres
 * as printed, converted once where they are shown.
 */
export interface RegulatorDetails {
  version: 1;
  /** The project's land as the regulator prints it (its layout figure), which is
   * what the site shows as "Project Land Area". */
  layoutLandAreaSqm: number | null;
  openAreaSqm: number | null;
  coveredAreaSqm: number | null;
  coveredParkingAreaSqm: number | null;
  /** Covered parking slots the registration declares. Absent in a snapshot stored
   * before it was read. */
  coveredParkingSlots?: number | null;
  /** The smallest and largest carpet area of any residential flat the regulator
   * lists, square metres: the "carpet area of units (range)" its summary prints.
   * Absent in a snapshot stored before it was read. */
  carpetAreaRangeSqm?: { min: number; max: number } | null;
  /** The quarterly filing the progress figures come from. */
  filing: {
    quarter: string | null;
    periodEndsOn: string | null;
    /** "quarterly_filing" is the promoter's latest report; "certified_form_one" is
     * the older architect-visit figure, used only when no filing was readable. */
    source: "quarterly_filing" | "certified_form_one" | null;
    progressPercent: number | null;
    blocks: RegulatorBlockProgress[];
  };
  /** Units booked and available as on the date the regulator's flat list carries. */
  inventory: {
    totalUnits: number | null;
    bookedUnits: number | null;
    availableUnits: number | null;
    asOn: string | null;
  } | null;
  /** Every quarterly and half-yearly filing the regulator lists, and how many were
   * submitted. */
  filings: { listed: number; submitted: number } | null;
  planPassingAuthority: string | null;
  registeredOn: string | null;
  architects: RegulatorParty[];
  engineers: RegulatorParty[];
  contractors: RegulatorParty[];
  /** The drawn project boundary and its centre. */
  boundary: RegulatorPoint[];
  centre: RegulatorPoint | null;
  /** The promoter group's stated history. Absent in a snapshot stored before it was
   * read; `null` when the record states none. */
  promoter?: RegulatorPromoterHistory | null;
}

export interface RegulatorQuarter {
  name: string;
  periodEndsOn: string;
  dueOn: string;
  submittedOn: string | null;
  status: string;
}

export type RegulatorErrorCode =
  | "invalid_number"
  | "not_found"
  | "ambiguous"
  | "unavailable"
  | "unexpected_response";

export class RegulatorError extends Error {
  constructor(
    public readonly code: RegulatorErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface RegulatorAdapter {
  code: string;
  label: string;
  /** Whether this regulator issues the given registration number. */
  ownsRegistrationNumber(registrationNumber: string): boolean;
  lookupByRegistrationNumber(
    registrationNumber: string,
  ): Promise<RegulatorRecord>;
  /** The project's stated price range, or null when the regulator states none
   * (or nothing usable). Kept off the record on purpose; see `RegulatorPriceRange`. */
  lookupPriceRange?(
    registrationNumber: string,
  ): Promise<RegulatorPriceRange | null>;
}
