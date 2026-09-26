import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { BodyText, DisplayHeading } from "@/components/buyer/typography";
import { DeveloperShell } from "@/components/developers/developer-shell";
import { requirePortalRole } from "@/lib/accounts/session";
import { listForwardedEnquiries } from "@/lib/developers/forwarded-enquiries";

export const metadata: Metadata = {
  title: "Enquiries | Developer portal",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

/**
 * A developer's own forwarded enquiries (`DECISIONS.md` 2026-09-26). Only what
 * the admin has released to this developer appears: an enquiry still with the
 * admin, or closed without forwarding, is never shown. The page shares the
 * Phase 4 developer shell and keeps its own role check.
 */
export default async function DeveloperEnquiriesPage() {
  const session = await requirePortalRole("developer", "/developers/enquiries");
  const enquiries = await listForwardedEnquiries(db, session.role.developerId);

  return (
    <DeveloperShell active="enquiries" email={session.email}>
      <DisplayHeading level={1} className="mt-10">
        Enquiries
      </DisplayHeading>
      <BodyText className="text-muted-foreground mt-4 max-w-prose">
        {enquiries.length === 0
          ? "No buyer enquiry has been forwarded to you yet. Buyers reach our team first; we forward what looks like a real fit."
          : `${enquiries.length} forwarded ${enquiries.length === 1 ? "enquiry" : "enquiries"}, most recent first.`}
      </BodyText>

      {enquiries.length === 0 ? null : (
        <ul
          data-slot="developer-enquiry-list"
          className="border-border bg-card divide-border mt-8 divide-y rounded-lg border"
        >
          {enquiries.map((enquiry) => (
            <li
              key={enquiry.id}
              data-slot="developer-enquiry-row"
              className="flex flex-col gap-2 p-5"
            >
              <p className="text-sm">
                <Link
                  href={`/properties/${enquiry.propertySlug}`}
                  className="font-display text-xl underline-offset-4 hover:underline"
                >
                  {enquiry.propertyName}
                </Link>
                {enquiry.unitTypeName ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {enquiry.unitTypeName}
                  </span>
                ) : null}
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {enquiry.message ?? (
                  <span className="text-muted-foreground italic">
                    No message.
                  </span>
                )}
              </p>
              <p
                data-slot="developer-enquiry-contact"
                className="text-muted-foreground text-xs"
              >
                {enquiry.buyerName} ·{" "}
                {enquiry.buyerPhone ?? "no number recorded"} · forwarded{" "}
                {dateTime.format(new Date(enquiry.forwardedAt))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DeveloperShell>
  );
}
