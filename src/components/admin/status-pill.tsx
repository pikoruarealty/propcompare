import { cn } from "@/lib/utils";
import {
  SUBMISSION_STATUS_LABEL,
  type SubmissionStatus,
} from "@/lib/submissions/status-labels";

/**
 * A submission's status as a small pill (pills are reserved for chips and tags
 * in the design system, which this is). Tones come from the documented palette
 * only, and none of them is Soft Gold — that colour is reserved for Verified
 * badges on buyer surfaces, and a "Published" pill here is not one.
 */
const TONE: Record<SubmissionStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-accent text-accent-foreground",
  in_review:
    "bg-[color-mix(in_oklab,var(--color-terracotta)_14%,var(--color-chalk))] text-primary",
  changes_requested:
    "bg-[color-mix(in_oklab,var(--color-pale-sky)_45%,var(--color-chalk))] text-foreground",
  approved: "bg-accent text-accent-foreground",
  rejected:
    "bg-[color-mix(in_oklab,var(--destructive)_12%,var(--color-chalk))] text-destructive",
  published: "border-border border bg-card text-foreground",
};

export function StatusPill({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.06em] uppercase",
        TONE[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {SUBMISSION_STATUS_LABEL[status]}
    </span>
  );
}
