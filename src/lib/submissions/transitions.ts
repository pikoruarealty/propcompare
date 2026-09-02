import type { submissionStatus } from "@/db/schema/catalog";

export type SubmissionStatus = (typeof submissionStatus.enumValues)[number];

export type SubmissionActorRole = "submitter" | "verifier" | "owner";

export type SubmissionAction =
  | "submit"
  | "start_review"
  | "request_changes"
  | "reject"
  | "approve"
  | "publish";

export class SubmissionTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionTransitionError";
  }
}

/**
 * Fixed for Phase 2A per DECISIONS.md ("Submission review permissions and
 * slug generation are fixed for Phase 2A"): a submitter may only submit; a
 * verifier moves a submission through review; only an owner may publish. An
 * owner may also perform every other action, since the initial owner-admin
 * workflow can be the same actor at every step.
 */
const ACTION_PERMISSIONS: Record<
  SubmissionAction,
  ReadonlySet<SubmissionActorRole>
> = {
  submit: new Set(["submitter", "owner"]),
  start_review: new Set(["verifier", "owner"]),
  request_changes: new Set(["verifier", "owner"]),
  reject: new Set(["verifier", "owner"]),
  approve: new Set(["verifier", "owner"]),
  publish: new Set(["owner"]),
};

const ACTION_TRANSITIONS: Record<
  SubmissionAction,
  { from: ReadonlySet<SubmissionStatus>; to: SubmissionStatus }
> = {
  submit: { from: new Set(["draft", "changes_requested"]), to: "submitted" },
  start_review: { from: new Set(["submitted"]), to: "in_review" },
  request_changes: {
    from: new Set(["in_review"]),
    to: "changes_requested",
  },
  reject: { from: new Set(["in_review"]), to: "rejected" },
  approve: { from: new Set(["in_review"]), to: "approved" },
  publish: { from: new Set(["approved"]), to: "published" },
};

export interface SubmissionTransitionInput {
  currentStatus: SubmissionStatus;
  action: SubmissionAction;
  actorRole: SubmissionActorRole;
}

export interface SubmissionTransitionResult {
  nextStatus: SubmissionStatus;
  /** Timestamp column this transition must stamp, beyond updatedAt. */
  timestampField: "submittedAt" | "reviewedAt" | "publishedAt";
}

const TIMESTAMP_FIELD_BY_ACTION: Record<
  SubmissionAction,
  SubmissionTransitionResult["timestampField"]
> = {
  submit: "submittedAt",
  start_review: "reviewedAt",
  request_changes: "reviewedAt",
  reject: "reviewedAt",
  approve: "reviewedAt",
  publish: "publishedAt",
};

/**
 * Pure review-transition state machine. Callers are responsible for row
 * locking, persisting the result, and stamping `reviewedBy`/`submittedBy`
 * from the authenticated actor — this function only decides whether the
 * requested action is legal from the current state for the given role.
 */
export const applySubmissionTransition = (
  input: SubmissionTransitionInput,
): SubmissionTransitionResult => {
  const { currentStatus, action, actorRole } = input;

  const allowedRoles = ACTION_PERMISSIONS[action];
  if (!allowedRoles.has(actorRole)) {
    throw new SubmissionTransitionError(
      `role ${actorRole} is not permitted to perform ${action}`,
    );
  }

  const transition = ACTION_TRANSITIONS[action];
  if (!transition.from.has(currentStatus)) {
    throw new SubmissionTransitionError(
      `cannot perform ${action} from status ${currentStatus}`,
    );
  }

  return {
    nextStatus: transition.to,
    timestampField: TIMESTAMP_FIELD_BY_ACTION[action],
  };
};
