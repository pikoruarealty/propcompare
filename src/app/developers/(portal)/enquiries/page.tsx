import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { Button } from "@/components/ui/button";
import {
  BodyText,
  DisplayHeading,
  Eyebrow,
} from "@/components/buyer/typography";
import { signOutOfPortal } from "@/app/actions/portal-auth";
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
 * admin, or closed without forwarding, is never shown. This is a standalone
 * page ahead of the real developer shell (Phase 4, Part 5) rather than a
 * competing one — the same minimal layout `PortalLanding` already uses.
 */
export default async function DeveloperEnquiriesPage() {
  const session = await requirePortalRole("developer", "/developers/enquiries");
  const enquiries = await listForwardedEnquiries(db, session.role.developerId);

  return (
    <main className="bg-background min-h-screen px-[var(--layout-margin-mobile)] py-16 md:px-[var(--layout-margin-desktop)]">
      <div className="mx-auto max-w-[var(--layout-max-width)]">
        <Eyebrow>Developer portal</Eyebrow>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <DisplayHeading level={1}>Enquiries</DisplayHeading>
          <form action={signOutOfPortal}>
            <input type="hidden" name="to" value="developer" />
            <Button
              type="submit"
              variant="outline"
              size="lg"
              className="h-11 px-5"
            >
              Sign out
            </Button>
          </form>
        </div>
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
      </div>
    </main>
  );
}
