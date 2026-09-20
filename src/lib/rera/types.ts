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
  /** The most recent quarterly filing the regulator lists, if any. */
  latestQuarter: RegulatorQuarter | null;
  /** The public page a person can open to check this record. */
  sourceUrl: string;
  fetchedAt: string;
  /** Pieces the regulator did not return this time; the record is still usable. */
  gaps: string[];
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
