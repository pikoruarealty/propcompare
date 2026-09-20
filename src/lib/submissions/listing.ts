import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { properties, propertySubmissions } from "@/db/schema/catalog";
import { LISTING_STATUSES, type ListingStatusValue } from "./edit-only-fields";
import { createEditSubmission, EditPropertyError } from "./edit-property";
import { publishSubmission } from "./publisher";
import { editSubmissionField, transitionSubmission } from "./reconciliation";

export class ListingChangeError extends Error {
  constructor(
    public readonly code:
      | "property_not_found"
      | "invalid_status"
      | "no_change"
      | "edit_already_open",
    message: string,
    /** For `edit_already_open`: the edit that is in the way. */
    public readonly submissionId?: string,
  ) {
    super(message);
  }
}

/**
 * Lists, unlists or soft-deletes a property, through the same steps as any other
 * change: an edit submission carrying `property.listing_status`, taken through
 * submit, review and approval and published by an owner. Nothing writes the live
 * property directly, and the edit stays in the property's history as a version.
 *
 * Unlisted and deleted both hide the property from buyers everywhere and delete
 * nothing; listing it again brings it back. If any step is refused the draft is
 * rejected so it cannot block the next edit.
 */
export const changeListingStatus = async (
  database: PostgresJsDatabase,
  input: {
    propertyId: string;
    status: string;
    actorUserId: string;
  },
): Promise<{ propertyId: string; status: ListingStatusValue }> => {
  if (!(LISTING_STATUSES as readonly string[]).includes(input.status)) {
    throw new ListingChangeError(
      "invalid_status",
      "Status must be listed, unlisted or deleted.",
    );
  }
  const status = input.status as ListingStatusValue;

  if (!/^[0-9a-f-]{36}$/i.test(input.propertyId)) {
    throw new ListingChangeError("property_not_found", "Property not found.");
  }
  const [property] = await database
    .select({ status: properties.listingStatus })
    .from(properties)
    .where(eq(properties.id, input.propertyId));
  if (!property) {
    throw new ListingChangeError("property_not_found", "Property not found.");
  }
  if (property.status === status) {
    throw new ListingChangeError(
      "no_change",
      `This property is already ${status}.`,
    );
  }

  let submissionId: string;
  try {
    ({ submissionId } = await createEditSubmission(database, {
      propertyId: input.propertyId,
      submittedBy: input.actorUserId,
    }));
  } catch (cause) {
    if (
      cause instanceof EditPropertyError &&
      cause.code === "edit_already_open"
    ) {
      throw new ListingChangeError(
        "edit_already_open",
        "This property has an edit in progress. Finish or reject it first.",
        cause.submissionId,
      );
    }
    throw cause;
  }

  try {
    await editSubmissionField(database, {
      submissionId,
      fieldKey: "property.listing_status",
      value: status,
      reviewStatus: "confirmed",
    });
    for (const action of ["submit", "start_review", "approve"] as const) {
      await transitionSubmission(database, {
        submissionId,
        action,
        actorUserId: input.actorUserId,
        actorRole: "owner",
      });
    }
    const published = await publishSubmission({
      submissionId,
      actorUserId: input.actorUserId,
      actorRole: "owner",
    });
    return { propertyId: published.propertyId, status };
  } catch (cause) {
    await database
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
    throw cause;
  }
};

/**
 * A developer asking for their own property to be listed, unlisted or deleted. It
 * makes the same edit as `changeListingStatus` but stops at "submitted": it is an
 * admin who reviews, approves and publishes it, so nothing changes for buyers until
 * they do. A property that is not this developer's reads as not found.
 */
export const requestListingChange = async (
  database: PostgresJsDatabase,
  input: {
    propertyId: string;
    status: string;
    actorUserId: string;
    developerId: string;
  },
): Promise<{ submissionId: string; status: ListingStatusValue }> => {
  if (!(LISTING_STATUSES as readonly string[]).includes(input.status)) {
    throw new ListingChangeError(
      "invalid_status",
      "Status must be listed, unlisted or deleted.",
    );
  }
  const status = input.status as ListingStatusValue;

  let submissionId: string;
  try {
    ({ submissionId } = await createEditSubmission(database, {
      propertyId: input.propertyId,
      submittedBy: input.actorUserId,
      onBehalfOfDeveloperId: input.developerId,
    }));
  } catch (cause) {
    if (cause instanceof EditPropertyError) {
      throw new ListingChangeError(
        cause.code === "edit_already_open"
          ? "edit_already_open"
          : "property_not_found",
        cause.message,
        cause.submissionId,
      );
    }
    throw cause;
  }

  try {
    await editSubmissionField(database, {
      submissionId,
      fieldKey: "property.listing_status",
      value: status,
    });
    await transitionSubmission(database, {
      submissionId,
      action: "submit",
      actorUserId: input.actorUserId,
      actorRole: "submitter",
    });
  } catch (cause) {
    await database
      .update(propertySubmissions)
      .set({ status: "rejected" })
      .where(eq(propertySubmissions.id, submissionId));
    throw cause;
  }
  return { submissionId, status };
};
