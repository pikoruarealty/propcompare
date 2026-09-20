"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  countNeedingReview,
  groupFields,
} from "@/lib/submissions/field-display";
import { SUBMISSION_STATUS_LABEL } from "@/lib/submissions/status-labels";
import type { SubmissionDetail } from "@/lib/submissions/queue";
import { ExtractionStatus } from "./extraction-status";
import { ConfirmAction } from "./submission/confirm-action";
import { ConfirmAllBar, FieldsPanel } from "./submission/fields-panel";
import { isEditOnlyField } from "@/lib/submissions/edit-only-fields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaPanel, type MediaItem } from "./submission/media-panel";
import { ReraPanel } from "./submission/rera-panel";
import { WorkflowPanel } from "./submission/workflow-panel";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** A small count on a tab: attention when something needs doing there. */
function TabBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "attention";
}) {
  return (
    <span
      className={
        tone === "attention"
          ? "text-primary rounded-full bg-[color-mix(in_oklab,var(--color-terracotta)_14%,var(--color-chalk))] px-1.5 text-xs font-semibold tabular-nums"
          : "bg-muted text-muted-foreground rounded-full px-1.5 text-xs tabular-nums"
      }
    >
      {children}
    </span>
  );
}

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

  // The published pictures this edit takes off the listing.
  const removedMediaIds = React.useMemo(() => {
    const value = submission.fields.find(
      (field) => field.fieldKey === "property.media_removed",
    )?.value;
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  }, [submission.fields]);

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

  const postJson = async (path: string, body: unknown) => {
    const message = await call(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!message) router.refresh();
    return message;
  };

  /** Fields whose value differs from what RERA states, for the note on each row. */
  const reraDifferences = React.useMemo(
    () =>
      Object.fromEntries(
        submission.rera.comparison
          .filter((item) => item.status === "differs")
          .map((item) => [item.fieldKey, item]),
      ),
    [submission.rera.comparison],
  );

  const [tab, setTab] = React.useState("project");
  const groups = React.useMemo(
    () => groupFields(submission.availableFields, submission.fields),
    [submission.availableFields, submission.fields],
  );
  /** Values still waiting for a decision, per group of fields and in all. */
  const reviewCount = Object.fromEntries(
    groups.map(({ group, rows }) => [
      group.key,
      rows.filter((row) => row.candidate?.reviewStatus === "needs_review")
        .length,
    ]),
  );
  const waitingForReview = submission.fields.filter(
    (field) => field.reviewStatus === "needs_review",
  ).length;
  const differsFromRera = Object.keys(reraDifferences).length;

  /** Lists, unlists or soft-deletes the property. */
  const changeListing = async (status: "listed" | "unlisted" | "deleted") => {
    if (!submission.propertyId) return;
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/admin/properties/${submission.propertyId}/listing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (response.ok) {
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(payload?.error?.message ?? "That could not be changed.");
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    }
  };

  const [starting, setStarting] = React.useState(false);
  /** Starts a correction to this published property and goes to it. */
  const startEdit = async () => {
    if (!submission.propertyId) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/admin/properties/${submission.propertyId}/edits`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as {
        submissionId?: string;
        error?: { message?: string };
      } | null;
      if (payload?.submissionId) {
        // Created now, or already open: either way this is the edit to work on.
        router.push(`/admin/submissions/${payload.submissionId}`);
        return;
      }
      setError(payload?.error?.message ?? "Could not start an edit.");
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
    }
    setStarting(false);
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

      {submission.status === "published" && submission.propertyId ? (
        <div
          data-slot="edit-property"
          className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5"
        >
          <p className="text-muted-foreground max-w-prose text-sm">
            This property is live. To correct or add anything, including its
            RERA details, start an edit. The live page stays as it is until the
            edit is reviewed and published.
          </p>
          <Button type="button" disabled={starting} onClick={startEdit}>
            {starting ? "Starting…" : "Edit this property"}
          </Button>
        </div>
      ) : null}

      {submission.status === "published" && submission.propertyId ? (
        <div
          data-slot="listing-controls"
          className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5"
        >
          <p className="max-w-prose text-sm">
            {submission.listingStatus === "unlisted" ? (
              <>
                <strong>Unlisted.</strong>{" "}
                <span className="text-muted-foreground">
                  Buyers cannot see this property anywhere. Nothing has been
                  deleted.
                </span>
              </>
            ) : submission.listingStatus === "deleted" ? (
              <>
                <strong>Deleted.</strong>{" "}
                <span className="text-muted-foreground">
                  Hidden from buyers. It is a soft delete: nothing is erased and
                  an owner can restore it.
                </span>
              </>
            ) : (
              <>
                <strong>Live for buyers.</strong>{" "}
                <span className="text-muted-foreground">
                  Unlisting hides it everywhere without deleting anything.
                </span>
              </>
            )}
          </p>
          {permissionLevel === "owner" ? (
            <div className="flex flex-wrap gap-2">
              {submission.listingStatus === "listed" ? (
                <ConfirmAction
                  label="Unlist"
                  variant="outline"
                  title="Unlist this property?"
                  description="Buyers will no longer see it in browse, search, matches, saved lists or comparisons, and its page and pictures stop loading. Nothing is deleted, and you can list it again at any time. This is recorded as a change to the property."
                  confirmLabel="Unlist"
                  onConfirm={() => void changeListing("unlisted")}
                />
              ) : null}
              {submission.listingStatus === "unlisted" ? (
                <ConfirmAction
                  label="List again"
                  variant="outline"
                  title="List this property again?"
                  description="Buyers will see it again everywhere. This is recorded as a change to the property."
                  confirmLabel="List again"
                  onConfirm={() => void changeListing("listed")}
                />
              ) : null}
              {submission.listingStatus === "deleted" ? (
                <ConfirmAction
                  label="Restore"
                  variant="outline"
                  title="Restore this property?"
                  description="It will be listed for buyers again. This is recorded as a change to the property."
                  confirmLabel="Restore"
                  onConfirm={() => void changeListing("listed")}
                />
              ) : null}
              {submission.listingStatus !== "deleted" ? (
                <ConfirmAction
                  label="Delete"
                  variant="outline"
                  title="Delete this property?"
                  description="It is hidden from buyers everywhere and marked deleted. This is a soft delete: nothing is erased, its history stays, and an owner can restore it. This is recorded as a change to the property."
                  confirmLabel="Delete"
                  onConfirm={() => void changeListing("deleted")}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only an owner can change whether it is listed.
            </p>
          )}
        </div>
      ) : null}

      {submission.propertyId && submission.status !== "published" ? (
        <p
          data-slot="edit-banner"
          className="border-border bg-card text-muted-foreground rounded-lg border p-4 text-sm"
        >
          You are editing a property that is live. Fields you do not change keep
          their published values, and nothing goes live until this edit is
          reviewed and published.
        </p>
      ) : null}

      {submission.versions.length > 1 ? (
        <section
          data-slot="versions"
          aria-labelledby="versions-heading"
          className="border-border bg-card rounded-lg border p-5"
        >
          <h2 id="versions-heading" className="font-display text-xl">
            Versions of this property
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            The submission that created it, and each edit since, with what each
            published edit changed. The queue shows only the latest.
          </p>
          <ol className="divide-border mt-3 divide-y text-sm">
            {submission.versions.map((version) => (
              <li key={version.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {version.kind === "original" ? "Original" : "Edit"}
                    {" · "}
                    {dateFormat.format(version.createdAt)}
                    {" · "}
                    {SUBMISSION_STATUS_LABEL[version.status]}
                    {version.publishedAt
                      ? ` · live since ${dateFormat.format(version.publishedAt)}`
                      : ""}
                  </span>
                  {version.id === submission.id ? (
                    <span className="text-muted-foreground">You are here</span>
                  ) : (
                    <Link
                      href={`/admin/submissions/${version.id}`}
                      className="text-primary underline underline-offset-4"
                    >
                      Open
                    </Link>
                  )}
                </div>
                {version.changes.length > 0 ? (
                  <ul
                    data-slot="version-changes"
                    className="text-muted-foreground mt-1 space-y-0.5 text-xs"
                  >
                    {version.changes.map((change) => (
                      <li key={change.fieldKey}>
                        <span className="text-foreground">{change.label}</span>
                        {": "}
                        {change.complex
                          ? "changed"
                          : change.from === null
                            ? `set to ${change.to}`
                            : `${change.from} → ${change.to}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <WorkflowPanel
        status={submission.status}
        permissionLevel={permissionLevel}
        needsReview={countNeedingReview(
          submission.fields.filter((field) => !isEditOnlyField(field.fieldKey)),
        )}
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

      {submission.extraction ? (
        <ExtractionStatus
          ocrJobId={submission.extraction.jobId}
          status={submission.extraction.status}
          failureMessage={submission.extraction.failureMessage}
        />
      ) : null}

      {inReview ? (
        <ConfirmAllBar
          waiting={waitingForReview}
          pending={pending}
          onConfirmAll={() => run(...post("/fields/confirm-pending"))}
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab} data-slot="edit-tabs">
        <TabsList aria-label="Sections of this submission">
          <TabsTrigger value="rera">
            RERA
            {differsFromRera > 0 ? (
              <TabBadge tone="attention">{differsFromRera}</TabBadge>
            ) : null}
          </TabsTrigger>
          {groups.map(({ group }) => (
            <TabsTrigger key={group.key} value={group.key}>
              {group.title}
              {reviewCount[group.key] > 0 ? (
                <TabBadge tone="attention">{reviewCount[group.key]}</TabBadge>
              ) : null}
            </TabsTrigger>
          ))}
          <TabsTrigger value="images">
            Images
            {media.length > 0 ? <TabBadge>{media.length}</TabBadge> : null}
          </TabsTrigger>
        </TabsList>

        {/* Every tab stays mounted, only hidden, so a half-edited field is kept
            when you look at another tab. */}
        <TabsContent value="rera" forceMount hidden={tab !== "rera"}>
          <ReraPanel
            rera={submission.rera}
            editable={editable}
            pending={pending}
            onFetch={(registrationNumber) =>
              postJson("/rera/fetch", { registrationNumber })
            }
            onApply={(jobId) => postJson("/rera/apply", { jobId })}
          />
        </TabsContent>

        {groups.map(({ group }) => (
          <TabsContent
            key={group.key}
            value={group.key}
            forceMount
            hidden={tab !== group.key}
          >
            <FieldsPanel
              submission={submission}
              only={group.key}
              reraDifferences={reraDifferences}
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
          </TabsContent>
        ))}

        <TabsContent value="images" forceMount hidden={tab !== "images"}>
          <MediaPanel
            submissionId={submission.id}
            published={submission.publishedMedia}
            removedIds={removedMediaIds}
            onSetRemoved={(ids) => saveField("property.media_removed", ids)}
            media={media}
            variantNames={variantNames}
            editable={editable}
            inReview={inReview}
            pending={pending}
            onReview={(mediaId, reviewStatus, isPublic) =>
              run(
                ...post(`/media/${mediaId}/review`, { reviewStatus, isPublic }),
              )
            }
            onUploaded={() => router.refresh()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
