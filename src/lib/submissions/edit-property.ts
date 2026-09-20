import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { properties, propertySubmissions } from "@/db/schema/catalog";

const UUID = /^[0-9a-f-]{36}$/i;

/** A submission in one of these states is still on its way to publication. */
const OPEN_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
] as const;

export class EditPropertyError extends Error {
  constructor(
    public readonly code: "property_not_found" | "edit_already_open",
    message: string,
    /** For `edit_already_open`: the edit already under way. */
    public readonly submissionId?: string,
  ) {
    super(message);
  }
}

/**
 * Starts a correction to an already-published property. It is an ordinary
 * `property_submissions` draft bound to that property and its developer, with no
 * fields: the publisher changes only the fields a submission contains, so anything
 * left alone keeps its published value, and nothing here touches the live
 * catalogue. It goes through review and publish like any other submission.
 *
 * One open edit per property: two half-finished edits of the same property would
 * each publish over the other.
 */
export const createEditSubmission = async (
  database: PostgresJsDatabase,
  input: {
    propertyId: string;
    /** Null for an edit the system proposes itself (a scheduled RERA check). */
    submittedBy: string | null;
    source?: "manual_form" | "rera_scrape";
  },
): Promise<{ submissionId: string }> => {
  if (!UUID.test(input.propertyId)) {
    throw new EditPropertyError("property_not_found", "Property not found.");
  }
  const [property] = await database
    .select({ id: properties.id, developerId: properties.developerId })
    .from(properties)
    .where(eq(properties.id, input.propertyId));
  if (!property) {
    throw new EditPropertyError("property_not_found", "Property not found.");
  }

  const [open] = await database
    .select({ id: propertySubmissions.id })
    .from(propertySubmissions)
    .where(
      and(
        eq(propertySubmissions.propertyId, property.id),
        inArray(propertySubmissions.status, [...OPEN_STATUSES]),
      ),
    );
  if (open) {
    throw new EditPropertyError(
      "edit_already_open",
      "This property already has an edit in progress. Finish or reject it first.",
      open.id,
    );
  }

  const [submission] = await database
    .insert(propertySubmissions)
    .values({
      propertyId: property.id,
      developerId: property.developerId,
      submittedBy: input.submittedBy,
      source: input.source ?? "manual_form",
      status: "draft",
      payload: {},
    })
    .returning({ id: propertySubmissions.id });
  return { submissionId: submission.id };
};
