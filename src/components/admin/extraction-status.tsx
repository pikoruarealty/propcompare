"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isExtractionActive } from "@/lib/ingestion/extraction-status";
import { ConfirmAction } from "./submission/confirm-action";

const POLL_MS = 4_000;

/**
 * Where a brochure extraction stands, with no cost shown. While it is waiting or
 * running the screen refreshes itself, so the admin sees it finish without
 * reloading. A failed run offers "Try again" (a second paid run, so it asks first)
 * or "Edit pages" (back to the page choices).
 */
export function ExtractionStatus({
  ocrJobId,
  status,
  failureMessage,
  fieldsHref,
}: {
  ocrJobId: string;
  status: string;
  failureMessage: string | null;
  /** Shown when finished, on screens that are not already the fields. */
  fieldsHref?: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!isExtractionActive(status)) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [status, router]);

  const reopen = async (mode: "requeue" | "edit_pages") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/ocr-jobs/${ocrJobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          payload?.error?.message ??
            "That could not be done. Refresh and try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("That could not be done. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "draft" || status === "cancelled") return null;

  const shell =
    "border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5";

  if (status === "queued" || status === "processing") {
    return (
      <section className={shell} role="status" aria-live="polite">
        <div className="max-w-prose">
          <p className="font-display text-xl">
            {status === "queued"
              ? "Waiting to start"
              : "Claude is reading the confirmed pages"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {status === "queued"
              ? "The brochure is next in line. This page updates by itself."
              : "This usually takes a few minutes for a full brochure. You can leave this page; the result will be here when you come back."}
          </p>
        </div>
      </section>
    );
  }

  if (status === "failed") {
    return (
      <section className={shell}>
        <div className="max-w-prose">
          <p className="font-display text-xl">Extraction did not finish</p>
          <p className="text-muted-foreground mt-1 text-sm">{failureMessage}</p>
          {error ? (
            <p role="alert" className="text-destructive mt-2 text-sm">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => reopen("edit_pages")}
          >
            Edit pages
          </Button>
          <ConfirmAction
            label="Try again"
            title="Run the extraction again?"
            description="Claude will read the confirmed pages again. Nothing from the failed attempt is kept."
            confirmLabel="Run again"
            disabled={busy}
            onConfirm={() => reopen("requeue")}
          />
        </div>
      </section>
    );
  }

  return (
    <section className={shell} role="status">
      <div className="max-w-prose">
        <p className="font-display text-xl">Extraction finished</p>
        <p className="text-muted-foreground mt-1 text-sm">
          The values are drafts. Check each against the brochure page shown as
          its evidence before approving.
        </p>
      </div>
      {fieldsHref ? (
        <Button asChild>
          <Link href={fieldsHref}>Review extracted values</Link>
        </Button>
      ) : null}
    </section>
  );
}
