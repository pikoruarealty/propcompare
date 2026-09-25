"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import {
  REPORT_PROBLEM_EMAIL,
  reportProblemMailto,
} from "@/lib/buyer/report-contact";

/**
 * "Report a problem" on every property dossier — the placement `DECISIONS.md`
 * (2026-09-20) already committed to as one of the mitigations for publishing
 * brochure media before a developer has consented (attribution, a takedown
 * route, keeping source PDFs private). The dialog asks the reader to send a mail
 * to a placeholder address (`DECISIONS.md`, 2026-09-24, which supersedes the
 * earlier "invent no address" position). No table, no storage, nothing submitted:
 * this component never calls the network, the reader's own mail app does the
 * sending.
 */
export function ReportProblemLink({ propertyName }: { propertyName?: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-slot="report-problem"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          Report a problem with this listing
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)]" />
        <Dialog.Content
          data-slot="report-problem-dialog"
          aria-describedby="report-problem-body"
          className="bg-card fixed top-1/2 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-display text-xl">
              Report a problem
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground rounded-md p-1"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <p
            id="report-problem-body"
            className="text-muted-foreground mt-3 text-sm"
          >
            Something wrong or out of date on this page, or a picture or fact
            that should not be here? Send us an email and we will look at it.
          </p>
          <p
            data-slot="report-problem-email"
            className="text-foreground mt-4 text-base font-medium break-all"
          >
            {REPORT_PROBLEM_EMAIL}
          </p>
          {/* Built only once the dialog is open, in the browser, so the page address is real. */}
          <a
            data-slot="report-problem-mailto"
            href={reportProblemMailto(
              propertyName === undefined
                ? undefined
                : { name: propertyName, url: window.location.href },
            )}
            className="border-border text-foreground mt-5 inline-flex items-center rounded-lg border px-4 py-2 text-sm transition-colors hover:border-[var(--color-terracotta)]"
          >
            Write to us
          </a>
          <p className="text-muted-foreground mt-4 text-xs">
            This address is a placeholder until our reporting inbox is set up.
            Nothing is sent from this page.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
