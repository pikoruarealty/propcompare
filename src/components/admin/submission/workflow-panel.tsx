"use client";

import { Button } from "@/components/ui/button";
import type { SubmissionStatus } from "@/lib/submissions/queue";
import { ConfirmAction } from "./confirm-action";

const GUIDANCE: Record<SubmissionStatus, string> = {
  draft:
    "Enter or check the details and add any images, then submit for review.",
  submitted: "Submitted. Start the review to check each field and image.",
  in_review:
    "Confirm or reject each field and image, then approve, ask for changes, or reject the submission.",
  changes_requested:
    "Changes were requested. Fix the details, then submit again.",
  approved: "Approved. An owner can now publish it to the live catalog.",
  rejected: "Rejected. It will not be published.",
  published: "Published to the live catalog.",
};

/**
 * Where the submission is and what can happen next. The steps that are hard to
 * undo — approving, rejecting and above all publishing — ask for confirmation;
 * publish is offered only to an owner, and the server enforces that again.
 */
export function WorkflowPanel({
  status,
  permissionLevel,
  needsReview,
  pending,
  onAction,
  onPublish,
}: {
  status: SubmissionStatus;
  permissionLevel: "verifier" | "owner";
  /** Proposed values not yet confirmed or rejected. */
  needsReview: number;
  pending: boolean;
  onAction: (action: string) => void;
  onPublish: () => void;
}) {
  const isOwner = permissionLevel === "owner";

  return (
    <section
      aria-labelledby="workflow-heading"
      className="border-border bg-card rounded-lg border p-5"
    >
      <h2 id="workflow-heading" className="font-display text-2xl">
        Review
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">{GUIDANCE[status]}</p>
      {status === "in_review" && needsReview > 0 ? (
        <p className="mt-2 text-sm">
          <span className="data-tabular">{needsReview}</span> value
          {needsReview === 1 ? " is" : "s are"} still waiting for a decision.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        {status === "draft" || status === "changes_requested" ? (
          isOwner ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => onAction("submit")}
            >
              Submit for review
            </Button>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only an owner can submit in the current workflow.
            </p>
          )
        ) : null}

        {status === "submitted" ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => onAction("start_review")}
          >
            Start review
          </Button>
        ) : null}

        {status === "in_review" ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onAction("request_changes")}
            >
              Request changes
            </Button>
            <ConfirmAction
              label="Reject submission"
              variant="outline"
              title="Reject this submission?"
              description="It will not be published. You can start again from a new draft."
              confirmLabel="Reject"
              disabled={pending}
              onConfirm={() => onAction("reject")}
            />
            <ConfirmAction
              label="Approve"
              title="Approve this submission?"
              description="Only the fields and images you confirmed will go into the catalog when an owner publishes it."
              confirmLabel="Approve"
              disabled={pending}
              onConfirm={() => onAction("approve")}
            />
          </>
        ) : null}

        {status === "approved" && isOwner ? (
          <ConfirmAction
            label="Publish to catalog"
            title="Publish to the live catalog?"
            description="This makes the confirmed details and images visible to buyers straight away. It cannot be undone from here."
            confirmLabel="Publish"
            disabled={pending}
            onConfirm={onPublish}
          />
        ) : null}
        {status === "approved" && !isOwner ? (
          <p className="text-muted-foreground text-sm">
            Only an owner can publish.
          </p>
        ) : null}
      </div>
    </section>
  );
}
