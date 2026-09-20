"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SubmissionStatus } from "@/lib/submissions/queue";
import { ConfirmAction } from "./confirm-action";

const GUIDANCE: Record<SubmissionStatus, string> = {
  draft:
    "When the details and pictures look right, publish it. Your changes are saved as you go, so you can also leave and come back.",
  submitted:
    "When the details and pictures look right, publish it. You can keep editing until then.",
  in_review:
    "When the details and pictures look right, publish it. You can keep editing until then.",
  changes_requested:
    "Changes were requested. Fix the details, then publish or send it back.",
  approved:
    "Approved but not yet live. You can still edit and check pictures; publish when it is right.",
  rejected: "Rejected. It will not be published.",
  published: "Published to the live catalog.",
};

/**
 * The end of the path: publish. An owner working on a submission is its reviewer,
 * so there is one Publish button that takes it from wherever it is to live (each
 * stage is still recorded). Values or pictures nobody has confirmed yet are named
 * before anything goes live, and confirming them as they stand is a deliberate
 * choice. "Save draft and leave" is always there and is not a failure: nothing has
 * to be finished. A verifier, who cannot publish, gets the same guidance and the
 * review steps they are allowed.
 */
export function WorkflowPanel({
  status,
  permissionLevel,
  waitingFields,
  waitingPictures,
  pending,
  onAction,
  onPublish,
}: {
  status: SubmissionStatus;
  permissionLevel: "verifier" | "owner";
  /** Proposed values not yet confirmed or rejected. */
  waitingFields: number;
  /** Pictures not yet confirmed or rejected. */
  waitingPictures: number;
  pending: boolean;
  onAction: (action: string) => void;
  /** Publishes; `confirmRemaining` confirms what is still waiting, as it stands. */
  onPublish: (confirmRemaining: boolean) => void;
}) {
  const isOwner = permissionLevel === "owner";
  const waiting = waitingFields + waitingPictures;
  const working = status !== "published" && status !== "rejected";
  const parts = [
    waitingFields > 0
      ? `${waitingFields} ${waitingFields === 1 ? "value" : "values"}`
      : null,
    waitingPictures > 0
      ? `${waitingPictures} ${waitingPictures === 1 ? "picture" : "pictures"}`
      : null,
  ].filter(Boolean);

  return (
    <section
      id="publish-panel"
      aria-labelledby="workflow-heading"
      data-slot="publish-panel"
      className="border-border bg-card rounded-xl border p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.04)]"
    >
      <h2 id="workflow-heading" className="font-display text-2xl">
        {working ? "Ready to publish?" : "Status"}
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">{GUIDANCE[status]}</p>
      {working && waiting > 0 ? (
        <p data-slot="waiting-note" className="mt-2 text-sm">
          {parts.join(" and ")} {waiting === 1 ? "is" : "are"} not confirmed
          yet.
        </p>
      ) : null}

      {working ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {isOwner ? (
            waiting > 0 ? (
              <ConfirmAction
                label="Publish"
                title="Some items are not confirmed yet"
                description={`${parts.join(" and ")} ${waiting === 1 ? "has" : "have"} not been confirmed. Go back to check ${waiting === 1 ? "it" : "them"}, or publish anyway: they are confirmed as they stand and pictures become public.`}
                confirmLabel="Confirm them and publish"
                disabled={pending}
                onConfirm={() => onPublish(true)}
              />
            ) : (
              <ConfirmAction
                label="Publish"
                title="Publish to the live catalog?"
                description="This makes the details and pictures visible to buyers straight away. Each step is recorded, and you can change it later by editing the property."
                confirmLabel="Publish"
                disabled={pending}
                onConfirm={() => onPublish(false)}
              />
            )
          ) : (
            <p className="text-muted-foreground text-sm">
              Only an owner can publish.
            </p>
          )}
          <Button asChild variant="outline">
            <Link href="/admin/submissions">Save draft and leave</Link>
          </Button>
        </div>
      ) : null}

      {status === "in_review" ? (
        <details className="mt-5 text-sm">
          <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer underline underline-offset-4">
            Other review actions
          </summary>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
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
            {!isOwner ? (
              <ConfirmAction
                label="Approve"
                title="Approve this submission?"
                description="An owner can then publish it."
                confirmLabel="Approve"
                disabled={pending}
                onConfirm={() => onAction("approve")}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
