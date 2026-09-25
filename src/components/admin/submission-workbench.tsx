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
import { isManagedElsewhere } from "@/lib/submissions/edit-only-fields";
import { WORKING_STATUSES } from "@/lib/submissions/working-statuses";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaPanel, type MediaItem } from "./submission/media-panel";
import { PricesPanel } from "./submission/prices-panel";
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
/**
 * The end of every tab while the submission can still be worked on: a primary
 * button that leads to the next section (and from the last, to Publish), and a
 * secondary way out. Nothing has to be filled in to go on or to leave.
 */
function GuidedFooter({
  show,
  current,
  order,
  filled,
  onGo,
}: {
  show: boolean;
  current: string;
  order: { key: string; title: string }[];
  filled: { filled: number; total: number } | null;
  onGo: (key: string) => void;
}) {
  if (!show) return null;
  const index = order.findIndex((item) => item.key === current);
  const next = order[index + 1];
  return (
    <div
      data-slot="guided-footer"
      className="border-border mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6"
    >
      <p className="text-muted-foreground text-sm">
        {filled
          ? `${filled.filled} of ${filled.total} filled in this section. Skip anything you do not have.`
          : "Skip anything you do not have."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/admin/submissions">Save draft and leave</Link>
        </Button>
        {next ? (
          <Button type="button" size="lg" onClick={() => onGo(next.key)}>
            Next: {next.title} →
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={() =>
              document
                .getElementById("publish-panel")
                ?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
          >
            Go to publish →
          </Button>
        )}
      </div>
    </div>
  );
}

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

  // Everything before publication can still be worked on and reviewed: an admin
  // who moved on too early is never locked out.
  const editable = (WORKING_STATUSES as readonly string[]).includes(
    submission.status,
  );
  const reviewable = editable;
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

  // The main photo: the admin's pending choice if there is one, else the live
  // primary picture (unless this edit takes it off the listing).
  const mainPhotoId = React.useMemo(() => {
    const chosen = submission.fields.find(
      (field) => field.fieldKey === "property.main_photo",
    )?.value;
    if (typeof chosen === "string") return chosen;
    return (
      submission.publishedMedia.find(
        (item) => item.isPrimary && !removedMediaIds.includes(item.id),
      )?.id ?? null
    );
  }, [submission.fields, submission.publishedMedia, removedMediaIds]);

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

  // How much of the listing is filled in, per tab and overall. Nothing forces
  // completion; this only shows where the gaps are.
  const isFilled = (fieldKey: string, hasCandidate: boolean) =>
    hasCandidate ||
    (submission.propertyId !== null && submission.live[fieldKey] !== undefined);
  const filledByGroup = Object.fromEntries(
    groups.map(({ group, rows }) => {
      const counted = rows.filter(
        (row) => !isManagedElsewhere(row.field.fieldKey),
      );
      return [
        group.key,
        {
          filled: counted.filter((row) =>
            isFilled(row.field.fieldKey, row.candidate != null),
          ).length,
          total: counted.length,
        },
      ];
    }),
  );
  // `unit_variants` is one field key holding every unit type as one array, so
  // the group's field-count badge always reads "/1" no matter how many unit
  // types are inside it — read instead of misleadingly labelled as a count.
  // The actual number of unit types is more useful to show here.
  const unitTypeCount = (() => {
    const row = groups
      .find(({ group }) => group.key === "unit_types")
      ?.rows.find((row) => row.field.fieldKey === "unit_variants");
    const value = row?.candidate?.value ?? submission.live["unit_variants"];
    return Array.isArray(value) ? value.length : 0;
  })();
  const filledTotal = Object.values(filledByGroup).reduce(
    (sum, item) => sum + item.filled,
    0,
  );
  const fieldTotal = Object.values(filledByGroup).reduce(
    (sum, item) => sum + item.total,
    0,
  );
  const tabOrder = [
    { key: "rera", title: "RERA" },
    ...groups.map(({ group }) => ({ key: group.key, title: group.title })),
    { key: "images", title: "Images" },
  ];
  const tabsTop = React.useRef<HTMLDivElement>(null);
  const goToTab = (key: string) => {
    setTab(key);
    tabsTop.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  const waitingPictures = media.filter(
    (item) => item.reviewStatus === "needs_review",
  ).length;

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

      {reviewable ? (
        <ConfirmAllBar
          waiting={waitingForReview}
          pending={pending}
          onConfirmAll={() => run(...post("/fields/confirm-pending"))}
        />
      ) : null}

      {editable ? (
        <div data-slot="progress" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {filledTotal} of {fieldTotal}
              </span>{" "}
              fields filled in.{" "}
              <span className="text-muted-foreground">
                Fill what you have and skip the rest; you can come back.
              </span>
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Fields filled in"
            aria-valuemin={0}
            aria-valuemax={fieldTotal}
            aria-valuenow={filledTotal}
            className="bg-muted h-2 overflow-hidden rounded-full"
          >
            <div
              className="bg-primary h-full rounded-full transition-[width]"
              style={{
                width: `${fieldTotal === 0 ? 0 : Math.round((filledTotal / fieldTotal) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div ref={tabsTop} />
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
              {group.key === "unit_types" ? (
                unitTypeCount > 0 ? (
                  <TabBadge>{unitTypeCount}</TabBadge>
                ) : null
              ) : editable ? (
                <TabBadge>
                  {filledByGroup[group.key].filled}/
                  {filledByGroup[group.key].total}
                </TabBadge>
              ) : null}
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
            onAddPromoter={() => postJson("/rera/promoter", {})}
          />
          <GuidedFooter
            show={editable}
            current="rera"
            order={tabOrder}
            filled={null}
            onGo={goToTab}
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
              reviewable={reviewable}
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
            {/* Each unit type's private price sits with the unit types (owner
                only; never shown to buyers). */}
            {group.key === "unit_types" && permissionLevel === "owner" ? (
              <PricesPanel
                submissionId={submission.id}
                active={tab === "unit_types"}
              />
            ) : null}
            <GuidedFooter
              show={editable}
              current={group.key}
              order={tabOrder}
              filled={filledByGroup[group.key]}
              onGo={goToTab}
            />
          </TabsContent>
        ))}

        <TabsContent value="images" forceMount hidden={tab !== "images"}>
          <MediaPanel
            submissionId={submission.id}
            published={submission.publishedMedia}
            removedIds={removedMediaIds}
            onSetRemoved={(ids) => saveField("property.media_removed", ids)}
            mainPhotoId={mainPhotoId}
            onSetMainPhoto={(id) => saveField("property.main_photo", id)}
            media={media}
            variantNames={variantNames}
            editable={editable}
            reviewable={reviewable}
            pending={pending}
            onReview={(mediaId, reviewStatus, isPublic) =>
              run(
                ...post(`/media/${mediaId}/review`, { reviewStatus, isPublic }),
              )
            }
            onDelete={(mediaId) =>
              run(`${base}/media/${mediaId}`, { method: "DELETE" })
            }
            onUploaded={() => router.refresh()}
          />
          <GuidedFooter
            show={editable}
            current="images"
            order={tabOrder}
            filled={null}
            onGo={goToTab}
          />
        </TabsContent>
      </Tabs>

      <WorkflowPanel
        status={submission.status}
        permissionLevel={permissionLevel}
        waitingFields={countNeedingReview(
          submission.fields.filter(
            (field) => !isManagedElsewhere(field.fieldKey),
          ),
        )}
        waitingPictures={waitingPictures}
        pending={pending}
        onAction={(action) => run(...post("/review", { action }))}
        onPublish={(confirmRemaining) =>
          run(...post("/publish", { confirmRemaining }))
        }
      />

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
    </div>
  );
}
