"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";

/**
 * Clears a submission out of the queue, or brings an archived one back. A
 * submission that was never published is deleted for good; a published one is
 * archived, because the record of what went live has to stay
 * (`DECISIONS.md` 2026-09-24). Either way the live listing is not touched, and
 * the dialog says exactly which of the two is about to happen.
 */
export function SubmissionRowActions({
  submissionId,
  propertyName,
  published,
  archived,
}: {
  submissionId: string;
  propertyName: string;
  published: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (request: () => Promise<Response>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await request();
      if (response.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      const payload = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(payload?.error?.message ?? "That did not work. Try again.");
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (archived) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-3"
          disabled={busy}
          onClick={() =>
            void run(() =>
              fetch(`/api/v1/admin/submissions/${submissionId}/restore`, {
                method: "POST",
              }),
            )
          }
        >
          {busy ? "Restoring…" : "Restore"}
        </Button>
        {error ? (
          <p role="alert" className="text-destructive mt-1 text-xs">
            {error}
          </p>
        ) : null}
      </>
    );
  }

  const verb = published ? "Archive" : "Delete";
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-8 px-3"
          aria-label={`${verb} ${propertyName}`}
        >
          {verb}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_60%,transparent)]" />
        <Dialog.Content
          data-slot="submission-removal-dialog"
          className="bg-card fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border p-6 text-left"
        >
          <Dialog.Title className="font-display text-xl">
            {published ? "Archive" : "Delete"} {propertyName}?
          </Dialog.Title>
          <Dialog.Description asChild>
            {published ? (
              <div className="text-muted-foreground flex flex-col gap-2 text-sm">
                <p>
                  This was published, so it is kept as the record of what went
                  live and who approved it. It leaves this list and moves to
                  Archived, where you can restore it.
                </p>
                <p>The live listing is not changed.</p>
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col gap-2 text-sm">
                <p>
                  This was never published, so nothing live depends on it. Its
                  fields, pictures and brochure read are deleted for good and
                  cannot be recovered.
                </p>
                <p>
                  Any money already spent reading its brochure is not refunded,
                  and stays in the usage ledger.
                </p>
              </div>
            )}
          </Dialog.Description>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              variant={published ? "default" : "destructive"}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  fetch(`/api/v1/admin/submissions/${submissionId}`, {
                    method: "DELETE",
                  }),
                )
              }
            >
              {busy
                ? published
                  ? "Archiving…"
                  : "Deleting…"
                : published
                  ? "Archive"
                  : "Delete for good"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
