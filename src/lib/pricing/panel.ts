import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { propertySubmissions } from "@/db/schema/catalog";
import type { ServiceDb } from "@/lib/matching/budget-range";
import { loadCurrentValues } from "@/lib/rera/submission-fetch";
import { WORKING_STATUSES } from "@/lib/submissions/working-statuses";
import { applyStagedPrices, type ApplyPricesResult } from "./apply";
import { parsePriceInr } from "./format";
import { readReraPriceRange } from "./ranges";
import {
  clearStagedPrice,
  listCurrentPrices,
  listStagedPrices,
  nameKey,
  setStagedPrice,
} from "./staged";

/**
 * What the review panel's Prices tab shows and does, staff only. Prices are entered
 * here, held privately, and applied when the submission is published
 * (`DECISIONS.md` 2026-09-24, "price data"). None of it is ever shown to a buyer.
 */

export class PricesError extends Error {
  constructor(
    public readonly code:
      | "submission_not_found"
      | "invalid_state"
      | "unknown_unit_type"
      | "invalid_price",
    message: string,
  ) {
    super(message);
  }
}

const UUID = /^[0-9a-f-]{36}$/i;
const EDITABLE = new Set<string>(WORKING_STATUSES);

interface SubmissionScope {
  id: string;
  status: string;
  propertyId: string | null;
}

const loadScope = async (
  database: PostgresJsDatabase,
  submissionId: string,
): Promise<SubmissionScope> => {
  if (!UUID.test(submissionId)) {
    throw new PricesError("submission_not_found", "Submission not found.");
  }
  const [row] = await database
    .select({
      id: propertySubmissions.id,
      status: propertySubmissions.status,
      propertyId: propertySubmissions.propertyId,
    })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  if (!row) {
    throw new PricesError("submission_not_found", "Submission not found.");
  }
  return row;
};

/** The unit type names this submission would publish, in the order it lists them. */
const unitTypeNames = (values: Record<string, unknown>): string[] => {
  const list = values["unit_variants"];
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const name = (entry as { variantName?: unknown } | null)?.variantName;
    return typeof name === "string" && name.trim() !== ""
      ? [name.trim().replace(/\s+/g, " ")]
      : [];
  });
};

export interface PricesState {
  submissionStatus: string;
  /** Prices can be typed only while the submission is still being worked on. */
  editable: boolean;
  unitTypes: {
    name: string;
    /** What the admin has typed and not yet published, in whole rupees. */
    staged: string | null;
    /** True when the typed price has been applied to the live unit type. */
    stagedApplied: boolean;
    /** The price the live unit type has now, if any. */
    current: string | null;
  }[];
  /** Staged names that match none of the submission's unit types (renamed or removed). */
  orphanedStaged: string[];
  registrationNumber: string | null;
  /** RERA's stated range for the project, as last checked. */
  rera: { minInr: string; maxInr: string; fetchedAt: string } | null;
  /** True when the private connection is not configured, so nothing can be shown or saved. */
  unavailable: boolean;
}

export const getPricesState = async (
  database: PostgresJsDatabase,
  pricing: ServiceDb | null,
  submissionId: string,
): Promise<PricesState> => {
  const scope = await loadScope(database, submissionId);
  const values = await loadCurrentValues(database, {
    id: scope.id,
    status: scope.status,
    developerId: null,
    propertyId: scope.propertyId,
  });
  const names = unitTypeNames(values);
  const number = values["property.rera_registration_number"];
  const registrationNumber =
    typeof number === "string" && number.trim() !== "" ? number.trim() : null;

  if (!pricing) {
    return {
      submissionStatus: scope.status,
      editable: false,
      unitTypes: names.map((name) => ({
        name,
        staged: null,
        stagedApplied: false,
        current: null,
      })),
      orphanedStaged: [],
      registrationNumber,
      rera: null,
      unavailable: true,
    };
  }

  const [staged, current, range] = await Promise.all([
    listStagedPrices(pricing, scope.id),
    scope.propertyId ? listCurrentPrices(pricing, scope.propertyId) : [],
    registrationNumber ? readReraPriceRange(pricing, registrationNumber) : null,
  ]);
  const stagedBy = new Map(
    staged.map((row) => [nameKey(row.unitVariantName), row]),
  );
  const currentBy = new Map(
    current.map((row) => [nameKey(row.unitVariantName), row]),
  );
  const listed = new Set(names.map(nameKey));

  return {
    submissionStatus: scope.status,
    editable: EDITABLE.has(scope.status),
    unitTypes: names.map((name) => ({
      name,
      staged: stagedBy.get(nameKey(name))?.priceInr ?? null,
      stagedApplied: stagedBy.get(nameKey(name))?.appliedAt != null,
      current: currentBy.get(nameKey(name))?.priceInr ?? null,
    })),
    orphanedStaged: staged
      .filter((row) => !listed.has(nameKey(row.unitVariantName)))
      .map((row) => row.unitVariantName),
    registrationNumber,
    rera: range
      ? {
          minInr: range.minInr,
          maxInr: range.maxInr,
          fetchedAt: range.fetchedAt.toISOString(),
        }
      : null,
    unavailable: false,
  };
};

const requireEditableUnitType = async (
  database: PostgresJsDatabase,
  submissionId: string,
  unitVariantName: string,
): Promise<SubmissionScope> => {
  const scope = await loadScope(database, submissionId);
  if (!EDITABLE.has(scope.status)) {
    throw new PricesError(
      "invalid_state",
      "Prices can only be entered before the submission is published or rejected.",
    );
  }
  const values = await loadCurrentValues(database, {
    id: scope.id,
    status: scope.status,
    developerId: null,
    propertyId: scope.propertyId,
  });
  if (
    !unitTypeNames(values).some((n) => nameKey(n) === nameKey(unitVariantName))
  ) {
    throw new PricesError(
      "unknown_unit_type",
      "That is not one of this submission's unit types.",
    );
  }
  return scope;
};

export const stagePrice = async (
  database: PostgresJsDatabase,
  pricing: ServiceDb,
  input: {
    submissionId: string;
    unitVariantName: string;
    priceInr: unknown;
    enteredBy: string;
  },
): Promise<void> => {
  const price = parsePriceInr(input.priceInr);
  if (price === null) {
    throw new PricesError(
      "invalid_price",
      "Enter the price in whole rupees, for example 25000000.",
    );
  }
  await requireEditableUnitType(
    database,
    input.submissionId,
    input.unitVariantName,
  );
  await setStagedPrice(pricing, {
    submissionId: input.submissionId,
    unitVariantName: input.unitVariantName,
    priceInr: price,
    enteredBy: input.enteredBy,
  });
};

export const unstagePrice = async (
  database: PostgresJsDatabase,
  pricing: ServiceDb,
  input: { submissionId: string; unitVariantName: string },
): Promise<void> => {
  const scope = await loadScope(database, input.submissionId);
  if (!EDITABLE.has(scope.status)) {
    throw new PricesError(
      "invalid_state",
      "Prices can only be changed before the submission is published or rejected.",
    );
  }
  await clearStagedPrice(pricing, input);
};

/**
 * Retry for a published submission whose staged prices did not reach the live unit
 * types (the connection was down, or a unit type was renamed and has since been
 * fixed). Only after publish, and only for the property it published as.
 */
export const retryApplyPrices = async (
  database: PostgresJsDatabase,
  pricing: ServiceDb,
  submissionId: string,
): Promise<ApplyPricesResult> => {
  const scope = await loadScope(database, submissionId);
  if (scope.status !== "published" || !scope.propertyId) {
    throw new PricesError(
      "invalid_state",
      "Prices are applied when the submission is published.",
    );
  }
  return applyStagedPrices(pricing, {
    submissionId: scope.id,
    propertyId: scope.propertyId,
  });
};
