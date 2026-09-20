/**
 * The one shape a regulator's public record is reduced to. Nothing outside a
 * regulator's own adapter knows where these values came from, so adding another
 * state's regulator means writing one adapter and registering it — the fetch job,
 * the comparison and the admin screens only ever see a `RegulatorRecord`.
 *
 * Deliberately narrow: only facts we hold a field for, plus the filing status the
 * "last checked" and quarterly refresh need. Money is never part of it. Regulator
 * sites publish project costs and per-unit prices; those must not enter this
 * database (exact prices stay in the `private` schema), so an adapter copies named
 * fields and ignores everything else.
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
  /** Amenity-catalogue keys the regulator affirmatively declares. Only a positive
   * declaration is listed: a blank flag is not stated, never "not offered". */
  declaredAmenityKeys: string[];
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

export interface RegulatorCarpetGroup {
  /** The block letter from the flat number ("A" for "A-301"), or null. */
  block: string | null;
  carpetAreaSqm: number;
  flatCount: number;
  firstFlat: string;
  lastFlat: string;
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
}
