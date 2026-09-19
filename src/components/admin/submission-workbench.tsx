"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countNeedingReview } from "@/lib/submissions/field-display";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { FieldsPanel } from "./submission/fields-panel";
import { MediaPanel, type MediaItem } from "./submission/media-panel";
import { WorkflowPanel } from "./submission/workflow-panel";

/**
 * The reconciliation screen for one submission, whether it began as a brochure or
 * as manual entry — both are the same draft, edited and reviewed the same way.
 * It lays out the workflow, the fields (grouped, with typed inputs) and the
 * images, and turns each action into a call to the admin API. The API enforces
 * every rule again; nothing here is the authority.
 */
export function SubmissionWorkbench({
  submission,
  media,
  permissionLevel,
}: {
  submission: SubmissionDetail;
  media: MediaItem[];
  permissionLevel: "verifier" | "owner";
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const editable =
    submission.status === "draft" || submission.status === "changes_requested";
  const inReview = submission.status === "in_review";
  const base = `/api/v1/admin/submissions/${submission.id}`;

  /** Calls the API; resolves to an error message, or null on success. */
  const call = async (
    url: string,
    init: RequestInit,
  ): Promise<string | null> => {
    try {
      const response = await fetch(url, init);
      if (response.ok) return null;
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return payload?.error?.message ?? "That could not be saved.";
    } catch {
      return "Could not reach the server. Check your connection and try again.";
    }
  };

  const run = (url: string, init: RequestInit) =>
    startTransition(async () => {
      setError(null);
      const message = await call(url, init);
      if (message) setError(message);
      else router.refresh();
    });

  const post = (path: string, body?: unknown): [string, RequestInit] => [
    `${base}${path}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
  ];

  const saveField = async (fieldKey: string, value: unknown) => {
    const message = await call(
      `${base}/fields/${encodeURIComponent(fieldKey)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      },
    );
    if (!message) router.refresh();
    return message;
  };

  const variantNames = React.useMemo(() => {
    const variants = submission.fields.find(
      (f) => f.fieldKey === "unit_variants",
    )?.value;
    return Array.isArray(variants)
      ? variants
          .map((v) => (v as { variantName?: unknown }).variantName)
          .filter((n): n is string => typeof n === "string")
      : [];
  }, [submission.fields]);

  return (
    <div className="flex flex-col gap-10">
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 text-destructive rounded-md border p-3 text-sm"
        >
          {error}
        </p>
      ) : null}

      <WorkflowPanel
        status={submission.status}
        permissionLevel={permissionLevel}
        needsReview={countNeedingReview(submission.fields)}
        pending={pending}
        onAction={(action) => run(...post("/review", { action }))}
        onPublish={() => run(...post("/publish"))}
      />

      {submission.source === "ocr_brochure" ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            This draft came from a brochure.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/submissions/${submission.id}/pages`}>
              <FileText /> Review brochure pages
            </Link>
          </Button>
        </div>
      ) : null}

      <FieldsPanel
        submission={submission}
        editable={editable}
        inReview={inReview}
        pending={pending}
        onSave={saveField}
        onReview={(fieldKey, reviewStatus) =>
          run(
            ...post(`/fields/${encodeURIComponent(fieldKey)}/review`, {
              reviewStatus,
            }),
          )
        }
      />

      <MediaPanel
        submissionId={submission.id}
        media={media}
        variantNames={variantNames}
        editable={editable}
        inReview={inReview}
        pending={pending}
        onReview={(mediaId, reviewStatus, isPublic) =>
          run(...post(`/media/${mediaId}/review`, { reviewStatus, isPublic }))
        }
        onUploaded={() => router.refresh()}
      />
    </div>
  );
}
