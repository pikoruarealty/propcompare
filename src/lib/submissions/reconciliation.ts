import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  amenityCatalog,
  bhkTypes,
  layoutTypes,
  propertySchemaFields,
  propertySubmissionFieldEvidence,
  propertySubmissionFields,
  propertySubmissions,
  propertyTypes,
} from "@/db/schema/catalog";
import { developers } from "@/db/schema/catalog";
import { legalEntityBelongsToDeveloper } from "@/lib/developers/legal-entities";
import {
  applySubmissionTransition,
  SubmissionTransitionError,
  type SubmissionAction,
  type SubmissionActorRole,
} from "./transitions";
import {
  SubmissionPayloadError,
  validateSubmissionPayload,
  type SubmissionLookupContext,
} from "./validation";

const UUID = /^[0-9a-f-]{36}$/i;
const EDITABLE_STATUSES = new Set(["draft", "changes_requested"]);

export class ReconciliationError extends Error {
  constructor(
    public readonly code:
      | "submission_not_found"
      | "developer_not_found"
      | "field_not_found"
      | "invalid_state"
      | "invalid_value"
      | "transition_not_allowed",
    message: string,
  ) {
    super(message);
  }
}

const loadLookupContext = async (
  database: PostgresJsDatabase,
): Promise<SubmissionLookupContext> => {
  const [propertyTypeRows, bhkTypeRows, layoutTypeRows, amenityRows] =
    await Promise.all([
      database.select({ key: propertyTypes.key }).from(propertyTypes),
      database.select({ key: bhkTypes.key }).from(bhkTypes),
      database.select({ key: layoutTypes.key }).from(layoutTypes),
      database.select({ key: amenityCatalog.key }).from(amenityCatalog),
    ]);
  return {
    propertyTypeKeys: new Set(propertyTypeRows.map((row) => row.key)),
    bhkTypeKeys: new Set(bhkTypeRows.map((row) => row.key)),
    layoutTypeKeys: new Set(layoutTypeRows.map((row) => row.key)),
    amenityKeys: new Set(amenityRows.map((row) => row.key)),
  };
};

const requireEditableSubmission = async (
  database: PostgresJsDatabase,
  submissionId: string,
) => {
  if (!UUID.test(submissionId)) {
    throw new ReconciliationError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  const [submission] = await database
    .select({
      id: propertySubmissions.id,
      status: propertySubmissions.status,
      developerId: propertySubmissions.developerId,
    })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, submissionId));
  if (!submission) {
    throw new ReconciliationError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  if (!EDITABLE_STATUSES.has(submission.status)) {
    throw new ReconciliationError(
      "invalid_state",
      "Only draft or changes-requested submissions can be edited.",
    );
  }
  return submission;
};

/** Creates a canonical manual-form draft. Missing fields are represented by
 * absent candidates and rendered explicitly as “Not stated”; no fake value or
 * second field representation is persisted. */
export const createManualSubmission = async (
  database: PostgresJsDatabase,
  input: { developerId: string; submittedBy: string },
): Promise<{ submissionId: string }> => {
  if (!UUID.test(input.developerId)) {
    throw new ReconciliationError(
      "developer_not_found",
      "Developer profile not found.",
    );
  }
  const [developer] = await database
    .select({ id: developers.id })
    .from(developers)
    .where(eq(developers.id, input.developerId));
  if (!developer) {
    throw new ReconciliationError(
      "developer_not_found",
      "Developer profile not found.",
    );
  }
  const [submission] = await database
    .insert(propertySubmissions)
    .values({
      developerId: developer.id,
      submittedBy: input.submittedBy,
      source: "manual_form",
      status: "draft",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  return { submissionId: submission.id };
};

/** Validates one manual/edit value against the active field contract before it
 * is upserted. Editing clears OCR confidence and evidence: evidence for an old
 * candidate must never appear to support a human replacement. */
export const editSubmissionField = async (
  database: PostgresJsDatabase,
  input: {
    submissionId: string;
    fieldKey: string;
    value: unknown;
    /** "confirmed" for a value an admin chose to take from a regulator's record;
     * "needs_review" for one a scheduled check proposed and no person has seen; a
     * person's own replacement is "edited" (the default). */
    reviewStatus?: "edited" | "confirmed" | "needs_review";
  },
): Promise<void> => {
  const submission = await requireEditableSubmission(
    database,
    input.submissionId,
  );
  const [contract] = await database
    .select({
      fieldKey: propertySchemaFields.fieldKey,
      dataType: propertySchemaFields.dataType,
    })
    .from(propertySchemaFields)
    .where(
      and(
        eq(propertySchemaFields.fieldKey, input.fieldKey),
        eq(propertySchemaFields.isActive, true),
      ),
    );
  if (!contract) {
    throw new ReconciliationError(
      "field_not_found",
      "That field is not active.",
    );
  }

  let value: unknown;
  try {
    value = validateSubmissionPayload(
      { [contract.fieldKey]: input.value },
      [contract],
      await loadLookupContext(database),
    )[contract.fieldKey];
  } catch (cause) {
    const message =
      cause instanceof SubmissionPayloadError
        ? cause.message
        : "Invalid field value.";
    throw new ReconciliationError("invalid_value", message);
  }

  if (
    contract.dataType === "legal_entity_id" &&
    !(await legalEntityBelongsToDeveloper(
      database,
      value as string,
      submission.developerId,
    ))
  ) {
    throw new ReconciliationError(
      "invalid_value",
      "Choose one of this developer's recorded legal entities.",
    );
  }

  const [field] = await database
    .insert(propertySubmissionFields)
    .values({
      submissionId: input.submissionId,
      fieldKey: contract.fieldKey,
      value,
      confidence: null,
      reviewStatus: input.reviewStatus ?? "edited",
    })
    .onConflictDoUpdate({
      target: [
        propertySubmissionFields.submissionId,
        propertySubmissionFields.fieldKey,
      ],
      set: {
        value,
        confidence: null,
        reviewStatus: input.reviewStatus ?? "edited",
      },
    })
    .returning({ id: propertySubmissionFields.id });
  await database
    .delete(propertySubmissionFieldEvidence)
    .where(eq(propertySubmissionFieldEvidence.submissionFieldId, field.id));
};

export const reviewSubmissionField = async (
  database: PostgresJsDatabase,
  input: {
    submissionId: string;
    fieldKey: string;
    reviewStatus: "confirmed" | "rejected";
  },
): Promise<void> => {
  if (!UUID.test(input.submissionId)) {
    throw new ReconciliationError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  const [submission] = await database
    .select({ status: propertySubmissions.status })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, input.submissionId));
  if (!submission) {
    throw new ReconciliationError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  if (submission.status !== "in_review") {
    throw new ReconciliationError(
      "invalid_state",
      "Fields can only be reviewed while the submission is in review.",
    );
  }
  const updated = await database
    .update(propertySubmissionFields)
    .set({ reviewStatus: input.reviewStatus })
    .where(
      and(
        eq(propertySubmissionFields.submissionId, input.submissionId),
        eq(propertySubmissionFields.fieldKey, input.fieldKey),
      ),
    )
    .returning({ id: propertySubmissionFields.id });
  if (updated.length === 0) {
    throw new ReconciliationError(
      "field_not_found",
      "Field candidate not found.",
    );
  }
};

/**
 * Confirms every value still waiting for review, in one step, for a submission in
 * review. For the admin who has checked the values against the brochure and
 * would otherwise press "Confirm" dozens of times; values already confirmed,
 * edited or rejected are left as they are. Returns how many it confirmed.
 */
export const confirmPendingFields = async (
  database: PostgresJsDatabase,
  submissionId: string,
): Promise<number> => {
  if (!UUID.test(submissionId)) {
    throw new ReconciliationError(
      "submission_not_found",
      "Submission not found.",
    );
  }
  return database.transaction(async (tx) => {
    const [submission] = await tx
      .select({ status: propertySubmissions.status })
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId))
      .for("update");
    if (!submission) {
      throw new ReconciliationError(
        "submission_not_found",
        "Submission not found.",
      );
    }
    if (submission.status !== "in_review") {
      throw new ReconciliationError(
        "invalid_state",
        "Fields can only be reviewed while the submission is in review.",
      );
    }
    const updated = await tx
      .update(propertySubmissionFields)
      .set({ reviewStatus: "confirmed" })
      .where(
        and(
          eq(propertySubmissionFields.submissionId, submissionId),
          eq(propertySubmissionFields.reviewStatus, "needs_review"),
        ),
      )
      .returning({ id: propertySubmissionFields.id });
    return updated.length;
  });
};

/** Persists the existing state-machine transition under a row lock. */
export const transitionSubmission = async (
  database: PostgresJsDatabase,
  input: {
    submissionId: string;
    action: Exclude<SubmissionAction, "publish">;
    actorUserId: string;
    actorRole: SubmissionActorRole;
  },
): Promise<void> => {
  try {
    await database.transaction(async (tx) => {
      const [submission] = await tx
        .select()
        .from(propertySubmissions)
        .where(eq(propertySubmissions.id, input.submissionId))
        .for("update");
      if (!submission) {
        throw new ReconciliationError(
          "submission_not_found",
          "Submission not found.",
        );
      }
      const transition = applySubmissionTransition({
        currentStatus: submission.status,
        action: input.action,
        actorRole: input.actorRole,
      });
      const timestamp = new Date();
      const [updated] = await tx
        .update(propertySubmissions)
        .set({
          status: transition.nextStatus,
          submittedBy:
            input.action === "submit"
              ? input.actorUserId
              : submission.submittedBy,
          reviewedBy:
            input.action === "submit"
              ? submission.reviewedBy
              : input.actorUserId,
          [transition.timestampField]: timestamp,
        })
        .where(
          and(
            eq(propertySubmissions.id, submission.id),
            eq(propertySubmissions.status, submission.status),
          ),
        )
        .returning({ id: propertySubmissions.id });
      if (!updated) {
        throw new ReconciliationError(
          "invalid_state",
          "Submission changed concurrently; refresh and try again.",
        );
      }
    });
  } catch (cause) {
    if (cause instanceof ReconciliationError) throw cause;
    if (cause instanceof SubmissionTransitionError) {
      throw new ReconciliationError("transition_not_allowed", cause.message);
    }
    throw cause;
  }
};
