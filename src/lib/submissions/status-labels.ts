/**
 * Submission statuses and how the admin screens name them. Pure, so client
 * components can import it without pulling in the database code that
 * `queue.ts` carries. `queue.ts` checks at compile time that this list is the
 * database enum, so the two cannot drift apart.
 */
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "published";

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  submitted: "New",
  in_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
};
