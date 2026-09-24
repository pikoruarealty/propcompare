import { syncReraPriceRange } from "@/lib/pricing/ranges";
import { WORKING_STATUSES } from "@/lib/submissions/working-statuses";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  amenityCatalog,
  developerLegalEntities,
  properties,
  propertySubmissionFields,
  propertySubmissions,
  reraFetchJobs,
} from "@/db/schema/catalog";
import { loadLiveValues } from "@/lib/submissions/live-values";
import {
  editSubmissionField,
  ReconciliationError,
} from "@/lib/submissions/reconciliation";
import {
  compareWithRecord,
  LATITUDE_FIELD_KEY,
  LONGITUDE_FIELD_KEY,
  MAP_URL_KEY,
  writableItems,
  type LegalEntityChoice,
  type ReraComparisonItem,
} from "./mapping";
import { getRegulatorRegistry, type RegulatorRegistry } from "./registry";
import { RegulatorError, type RegulatorRecord } from "./types";

const UUID = /^[0-9a-f-]{36}$/i;
const EDITABLE_STATUSES = new Set<string>(WORKING_STATUSES);

export class ReraFetchError extends Error {
  constructor(
    public readonly code:
      | "submission_not_found"
      | "invalid_state"
      | "no_regulator"
      | "duplicate_number"
      | "job_not_found"
      | "nothing_to_apply"
      | "invalid_value"
      | "invalid_number"
      | "not_found"
      | "ambiguous"
      | "unavailable"
      | "unexpected_response",
    message: string,
  ) {
    super(message);
  }
}

interface SubmissionScope {
  id: string;
  status: string;
  developerId: string | null;
  propertyId: string | null;
}

const loadSubmission = async (
  database: PostgresJsDatabase,
  submissionId: string,
): Promise<SubmissionScope> => {
  if (!UUID.test(submissionId)) {
    throw new ReraFetchError("submission_not_found", "Submission not found.");
  }
  const [submission] = await database
    .select({
      id: propertySubmissions.id,
      status: propertySubmissions.status,
      developerId: propertySubmissions.developerId,
      propertyId: propertySubmissions.propertyId,
    })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  if (!submission) {
    throw new ReraFetchError("submission_not_found", "Submission not found.");
  }
  return submission;
};

const requireEditable = (submission: SubmissionScope) => {
  if (!EDITABLE_STATUSES.has(submission.status)) {
    throw new ReraFetchError(
      "invalid_state",
      "RERA values can only be fetched or applied before the submission is published or rejected.",
    );
  }
};

/**
 * What we would publish for each contract field right now: the live property's
 * value for an edit of an existing property, overlaid with the submission's own
 * candidates (a rejected candidate does not count).
 */
export const loadCurrentValues = async (
  database: PostgresJsDatabase,
  submission: SubmissionScope,
): Promise<Record<string, unknown>> => {
  const values: Record<string, unknown> = {};
  if (submission.propertyId) {
    Object.assign(
      values,
      await loadLiveValues(database, submission.propertyId),
    );
  }
  const candidates = await database
    .select({
      fieldKey: propertySubmissionFields.fieldKey,
      value: propertySubmissionFields.value,
      reviewStatus: propertySubmissionFields.reviewStatus,
    })
    .from(propertySubmissionFields)
    .where(eq(propertySubmissionFields.submissionId, submission.id));
  for (const candidate of candidates) {
    if (candidate.reviewStatus === "rejected") continue;
    values[candidate.fieldKey] = candidate.value;
  }
  return values;
};

export const loadEntities = async (
  database: PostgresJsDatabase,
  submission: Pick<SubmissionScope, "developerId" | "propertyId">,
): Promise<LegalEntityChoice[]> => {
  let developerId = submission.developerId;
  if (!developerId && submission.propertyId) {
    const [property] = await database
      .select({ developerId: properties.developerId })
      .from(properties)
      .where(eq(properties.id, submission.propertyId));
    developerId = property?.developerId ?? null;
  }
  if (!developerId) return [];
  const rows = await database
    .select({
      id: developerLegalEntities.id,
      legalName: developerLegalEntities.legalName,
    })
    .from(developerLegalEntities)
    .where(eq(developerLegalEntities.developerId, developerId));
  return rows;
};

export const loadAmenityLabels = async (
  database: PostgresJsDatabase,
): Promise<Record<string, string>> =>
  Object.fromEntries(
    (
      await database
        .select({ key: amenityCatalog.key, label: amenityCatalog.label })
        .from(amenityCatalog)
    ).map((row) => [row.key, row.label]),
  );

/** Records stored before a field existed lack it; fill what is missing so a
 * reader never has to guard for an older fetch. */
const withDefaults = (record: RegulatorRecord): RegulatorRecord => ({
  ...record,
  projectDescription: record.projectDescription ?? null,
  pincode: record.pincode ?? null,
  landAreaSqm: record.landAreaSqm ?? null,
  coveredParkingSlots: record.coveredParkingSlots ?? null,
  blocks: record.blocks ?? [],
  declaredAmenityKeys: record.declaredAmenityKeys ?? [],
  carpetGroups: record.carpetGroups ?? [],
  // A record fetched before carpet areas were read did not fail to list them: it
  // never asked. Say so, so it is not mistaken for "RERA lists none".
  gaps:
    record.carpetGroups === undefined &&
    !record.gaps.includes("flat carpet areas")
      ? [...record.gaps, "flat carpet areas"]
      : record.gaps,
});

export const isRegulatorRecord = (value: unknown): value is RegulatorRecord =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as RegulatorRecord).registrationNumber === "string" &&
  typeof (value as RegulatorRecord).regulatorCode === "string";

export interface ReraFetchResult {
  jobId: string;
  record: RegulatorRecord;
  comparison: ReraComparisonItem[];
}

/**
 * Looks a registration number up at its regulator and sets the answer beside what
 * the submission holds. Writes nothing to the submission: the admin sees the
 * comparison first and chooses "use RERA values" (`applyReraValues`). The fetch is
 * recorded on `rera_fetch_jobs` either way, with the reason if it failed, and the
 * record kept there is the normalized one — never the regulator's raw response,
 * which carries prices.
 */
export const fetchReraForSubmission = async (
  database: PostgresJsDatabase,
  input: {
    submissionId: string;
    registrationNumber: string;
    requestedBy: string;
    registry?: RegulatorRegistry;
  },
): Promise<ReraFetchResult> => {
  const submission = await loadSubmission(database, input.submissionId);
  requireEditable(submission);

  const number = input.registrationNumber.trim().replace(/\s+/g, " ");
  const adapter = (
    input.registry ?? getRegulatorRegistry()
  ).forRegistrationNumber(number);
  if (!adapter) {
    throw new ReraFetchError(
      "no_regulator",
      "That is not a registration number we can check yet. Only Gujarat RERA numbers (PR/GJ/…) are supported.",
    );
  }

  // The same number on a different property would fail at publish; say so now.
  const [taken] = await database
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(
      and(
        sql`upper(${properties.reraRegistrationNumber}) = upper(${number})`,
        submission.propertyId
          ? ne(properties.id, submission.propertyId)
          : undefined,
      ),
    );
  if (taken) {
    throw new ReraFetchError(
      "duplicate_number",
      `${taken.name} is already published under that RERA number.`,
    );
  }

  const [job] = await database
    .insert(reraFetchJobs)
    .values({
      propertyId: submission.propertyId,
      submissionId: submission.id,
      requestedBy: input.requestedBy,
      reraRegistrationNumber: number.toUpperCase(),
      regulatorCode: adapter.code,
      status: "running",
      runAt: new Date(),
    })
    .returning({ id: reraFetchJobs.id });

  let record: RegulatorRecord;
  try {
    record = await adapter.lookupByRegistrationNumber(number);
  } catch (cause) {
    const known = cause instanceof RegulatorError;
    await database
      .update(reraFetchJobs)
      .set({
        status: "failed",
        error: known ? cause.message : "The lookup failed unexpectedly.",
      })
      .where(eq(reraFetchJobs.id, job.id));
    if (known) throw new ReraFetchError(cause.code, cause.message);
    throw cause;
  }

  const [current, entities, amenityLabels] = await Promise.all([
    loadCurrentValues(database, submission),
    loadEntities(database, submission),
    loadAmenityLabels(database),
  ]);
  const comparison = compareWithRecord(
    record,
    current,
    entities,
    amenityLabels,
  );
  await database
    .update(reraFetchJobs)
    .set({
      status: "succeeded",
      externalProjectId: record.externalProjectId,
      fetchedPayload: { record },
      matchedFields: comparison.map(({ fieldKey, status }) => ({
        fieldKey,
        status,
      })),
    })
    .where(eq(reraFetchJobs.id, job.id));
  // The project's stated price range goes to the private schema, never into the
  // record above; best effort, so it cannot fail the check.
  await syncReraPriceRange({ adapter, registrationNumber: number });
  return { jobId: job.id, record, comparison };
};

export interface ReraState {
  /** What the submission would publish as the registration number, if anything. */
  registrationNumber: string | null;
  lastFetch: {
    jobId: string;
    fetchedAt: string;
    record: RegulatorRecord;
  } | null;
  /** The latest fetch against what the submission holds now; recomputed on every
   * read, so a value edited after a fetch shows as different from RERA. */
  comparison: ReraComparisonItem[];
}

const latestSucceededJob = async (
  database: PostgresJsDatabase,
  submission: SubmissionScope,
  jobId?: string,
) => {
  const scope = submission.propertyId
    ? or(
        eq(reraFetchJobs.submissionId, submission.id),
        eq(reraFetchJobs.propertyId, submission.propertyId),
      )
    : eq(reraFetchJobs.submissionId, submission.id);
  const [job] = await database
    .select({
      id: reraFetchJobs.id,
      runAt: reraFetchJobs.runAt,
      createdAt: reraFetchJobs.createdAt,
      payload: reraFetchJobs.fetchedPayload,
    })
    .from(reraFetchJobs)
    .where(
      and(
        eq(reraFetchJobs.status, "succeeded"),
        scope,
        jobId ? eq(reraFetchJobs.id, jobId) : undefined,
      ),
    )
    .orderBy(desc(reraFetchJobs.createdAt))
    .limit(1);
  const record = (job?.payload as { record?: unknown } | null)?.record;
  return job && isRegulatorRecord(record)
    ? { job, record: withDefaults(record) }
    : null;
};

/** The RERA panel's state for a submission: the latest successful fetch, compared
 * with what is held now. */
export const getReraState = async (
  database: PostgresJsDatabase,
  submissionId: string,
): Promise<ReraState> => {
  const submission = await loadSubmission(database, submissionId);
  const current = await loadCurrentValues(database, submission);
  const registrationNumber = current["property.rera_registration_number"];
  const found = await latestSucceededJob(database, submission);
  if (!found) {
    return {
      registrationNumber:
        typeof registrationNumber === "string" ? registrationNumber : null,
      lastFetch: null,
      comparison: [],
    };
  }
  const [entities, amenityLabels] = await Promise.all([
    loadEntities(database, submission),
    loadAmenityLabels(database),
  ]);
  return {
    registrationNumber:
      typeof registrationNumber === "string" ? registrationNumber : null,
    lastFetch: {
      jobId: found.job.id,
      fetchedAt: (found.job.runAt ?? found.job.createdAt).toISOString(),
      record: found.record,
    },
    comparison: compareWithRecord(
      found.record,
      current,
      entities,
      amenityLabels,
    ),
  };
};

/**
 * "Use RERA values": writes RERA's value into each field where it differs from, or
 * fills a gap in, what the submission holds. Every value goes through the same
 * field validation as a hand entry, is saved as confirmed (a person chose to take
 * RERA's answer), and clears any brochure evidence that supported the old value.
 * Fields RERA is silent on are left alone. Still a draft: nothing reaches the live
 * catalogue except through review and publish.
 */
/** RERA's proposed pin and map link are a place someone should look at before it
 * is published, so they are written as needing review: publishing waits for an
 * admin or the developer to check the small map and confirm or correct them. */
const NEEDS_A_LOOK = new Set([
  LATITUDE_FIELD_KEY,
  LONGITUDE_FIELD_KEY,
  MAP_URL_KEY,
]);

export const applyReraValues = async (
  database: PostgresJsDatabase,
  input: { submissionId: string; jobId: string },
): Promise<{ applied: string[] }> => {
  const submission = await loadSubmission(database, input.submissionId);
  requireEditable(submission);
  if (!UUID.test(input.jobId)) {
    throw new ReraFetchError("job_not_found", "That RERA fetch was not found.");
  }
  const found = await latestSucceededJob(database, submission, input.jobId);
  if (!found) {
    throw new ReraFetchError("job_not_found", "That RERA fetch was not found.");
  }

  const [current, entities, amenityLabels] = await Promise.all([
    loadCurrentValues(database, submission),
    loadEntities(database, submission),
    loadAmenityLabels(database),
  ]);
  const items = writableItems(
    compareWithRecord(found.record, current, entities, amenityLabels),
  );
  if (items.length === 0) {
    throw new ReraFetchError(
      "nothing_to_apply",
      "Nothing to change: this submission already matches RERA.",
    );
  }
  const applied: string[] = [];
  for (const item of items) {
    try {
      await editSubmissionField(database, {
        submissionId: submission.id,
        fieldKey: item.fieldKey,
        value: item.proposedValue,
        reviewStatus: NEEDS_A_LOOK.has(item.fieldKey)
          ? "needs_review"
          : "confirmed",
      });
    } catch (cause) {
      if (cause instanceof ReconciliationError) {
        throw new ReraFetchError(
          cause.code === "invalid_state" ? "invalid_state" : "invalid_value",
          `${item.label}: ${cause.message}`,
        );
      }
      throw cause;
    }
    applied.push(item.fieldKey);
  }
  return { applied };
};
