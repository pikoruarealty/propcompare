"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { EnquiryStatus } from "@/lib/buyer/enquiry-inbox";

const LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  forwarded: "Forwarded",
  closed: "Closed",
};

/**
 * What each status can move to. An enquiry reaches the admin first; the admin
 * either sends it on to the developer or closes it themselves, and can take either
 * back (`DECISIONS.md` 2026-09-25).
 */
const NEXT = (
  developerName: string,
): Record<EnquiryStatus, { to: EnquiryStatus; label: string }[]> => ({
  new: [
    { to: "forwarded", label: `Forward to ${developerName}` },
    { to: "contacted", label: "Mark contacted" },
    { to: "closed", label: "Close" },
  ],
  contacted: [
    { to: "forwarded", label: `Forward to ${developerName}` },
    { to: "closed", label: "Close" },
    { to: "new", label: "Reopen as new" },
  ],
  forwarded: [
    { to: "closed", label: "Close" },
    { to: "new", label: "Take back as new" },
  ],
  closed: [{ to: "new", label: "Reopen" }],
});

export function EnquiryStatus({
  id,
  status,
  developerName,
}: {
  id: string;
  status: EnquiryStatus;
  developerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const move = (to: EnquiryStatus) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/v1/admin/enquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      if (!response.ok) {
        setError("Could not change the status.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <span
        data-slot="enquiry-status"
        className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-[0.08em] uppercase"
      >
        {LABEL[status]}
      </span>
      <div className="flex flex-wrap gap-2">
        {NEXT(developerName)[status].map((option) => (
          <Button
            key={option.to}
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => move(option.to)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
