"use client";

import * as React from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";

/**
 * "Report a problem" on every property dossier — the placement `DECISIONS.md`
 * (2026-09-20) already committed to as one of the mitigations for publishing
 * brochure media before a developer has consented (attribution, a takedown
 * route, keeping source PDFs private). Approved 2026-09-22 as a placeholder
 * only: a dialog that says plainly there is no way to send a report yet,
 * because no contact address has been chosen. No table, no storage, nothing
 * submitted — this component has nothing to write and writes nothing.
 */
export function ReportProblemLink() {
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
            A way to send us a report is coming. There is nothing to submit here
            yet, and this dialog does not send, save, or record anything.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
