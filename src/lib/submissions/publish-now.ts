import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  propertySubmissionFields,
  propertySubmissionMedia,
  propertySubmissions,
} from "@/db/schema/catalog";
import { isManagedElsewhere } from "./edit-only-fields";
import { publishSubmission, type PublishSubmissionResult } from "./publisher";
import { transitionSubmission } from "./reconciliation";
import type { SubmissionAction } from "./transitions";
import { isWorkingStatus } from "./working-statuses";

export class PublishNowError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid_state" | "unconfirmed",
    message: string,
    /** For `unconfirmed`: what is still waiting for a decision. */
    public readonly pending?: { fields: number; pictures: number },
  ) {
    super(message);
  }
}

/** What is still waiting for a decision on a submission. */
export const countPending = async (
  database: PostgresJsDatabase,
  submissionId: string,
): Promise<{ fields: number; pictures: number }> => {
  const fields = await database
    .select({ fieldKey: propertySubmissionFields.fieldKey })
    .from(propertySubmissionFields)
    .where(
      and(
        eq(propertySubmissionFields.submissionId, submissionId),
        eq(propertySubmissionFields.reviewStatus, "needs_review"),
      ),
    );
  const [pictures] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(propertySubmissionMedia)
    .where(
      and(
        eq(propertySubmissionMedia.submissionId, submissionId),
        eq(propertySubmissionMedia.reviewStatus, "needs_review"),
      ),
    );
  return {
    fields: fields.filter((field) => !isManagedElsewhere(field.fieldKey))
      .length,
    pictures: pictures?.count ?? 0,
  };
};

const NEXT_STEP: Record<string, SubmissionAction> = {
  draft: "submit",
  changes_requested: "submit",
  submitted: "start_review",
  in_review: "approve",
};

/**
 * One step for an owner: takes a submission from wherever it is (a draft, waiting,
 * in review, or already approved) to published. An owner working on their own
 * submission is the reviewer, so the steps are not separate screens, but each is
 * still made through the same recorded transitions, so the history is the same.
 *
 * Values or pictures still waiting for a decision are never published silently:
 * without \`confirmRemaining\` this refuses and says how many; with it, they are
 * confirmed as they stand (pictures public) and published.
 */
export const publishNow = async (
  database: PostgresJsDatabase,
  input: {
    submissionId: string;
    actorUserId: string;
    confirmRemaining?: boolean;
  },
): Promise<PublishSubmissionResult> => {
  if (!/^[0-9a-f-]{36}$/i.test(input.submissionId)) {
    throw new PublishNowError("not_found", "Submission not found.");
  }
  const [submission] = await database
    .select({ status: propertySubmissions.status })
    .from(propertySubmissions)
    .where(eq(propertySubmissions.id, input.submissionId));
  if (!submission) {
    throw new PublishNowError("not_found", "Submission not found.");
  }
  if (!isWorkingStatus(submission.status)) {
    throw new PublishNowError(
      "invalid_state",
      "This submission is already published or was rejected.",
    );
  }

  const pending = await countPending(database, input.submissionId);
  if (pending.fields + pending.pictures > 0) {
    if (!input.confirmRemaining) {
      throw new PublishNowError(
        "unconfirmed",
        "Some values or pictures are still waiting for a decision.",
        pending,
      );
    }
    await database
      .update(propertySubmissionFields)
      .set({ reviewStatus: "confirmed" })
      .where(
        and(
          eq(propertySubmissionFields.submissionId, input.submissionId),
          eq(propertySubmissionFields.reviewStatus, "needs_review"),
        ),
      );
    await database
      .update(propertySubmissionMedia)
      .set({
        reviewStatus: "confirmed",
        isPublic: true,
        reviewedBy: input.actorUserId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(propertySubmissionMedia.submissionId, input.submissionId),
          eq(propertySubmissionMedia.reviewStatus, "needs_review"),
        ),
      );
  }

  let status = submission.status as string;
  while (status !== "approved") {
    const action = NEXT_STEP[status];
    if (!action) {
      throw new PublishNowError(
        "invalid_state",
        "It cannot be published from here.",
      );
    }
    await transitionSubmission(database, {
      submissionId: input.submissionId,
      action: action as Exclude<SubmissionAction, "publish">,
      actorUserId: input.actorUserId,
      actorRole: "owner",
    });
    status =
      action === "submit"
        ? "submitted"
        : action === "start_review"
          ? "in_review"
          : "approved";
  }

  return publishSubmission({
    submissionId: input.submissionId,
    actorUserId: input.actorUserId,
    actorRole: "owner",
  });
};
