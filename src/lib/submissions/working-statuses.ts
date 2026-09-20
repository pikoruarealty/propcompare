/**
 * The stages in which a submission's details and pictures can still be worked on.
 *
 * Everything before publication is editable: a draft, one waiting for review, one in
 * review, one that changes were requested on, and one that is approved but not yet
 * published. (Owner direction, 2026-09-20: an admin who approved too early was
 * locked out of the very fields and pictures they still needed to fix.) Editing a
 * later stage does not send it back: the reviewer is the one editing, and what is
 * published is what is confirmed at the moment of publishing.
 *
 * A published submission is history; a correction to it is a new edit of the
 * property. A rejected one is finished.
 */
export const WORKING_STATUSES = [
  "draft",
  "changes_requested",
  "submitted",
  "in_review",
  "approved",
] as const;

export const isWorkingStatus = (status: string): boolean =>
  (WORKING_STATUSES as readonly string[]).includes(status);
