import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { AdminPageHeader, AdminShell } from "@/components/admin/admin-shell";
import { EnquiryStatus } from "@/components/admin/enquiry-status";
import { requirePortalRole } from "@/lib/accounts/session";
import { listEnquiryInbox } from "@/lib/buyer/enquiry-inbox";

export const metadata: Metadata = {
  title: "Enquiries | Admin console",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export default async function EnquiriesPage() {
  const session = await requirePortalRole("admin", "/admin/enquiries");
  const inbox = await listEnquiryInbox(db);
  const open = inbox.filter((e) => e.status !== "closed").length;

  return (
    <AdminShell active="enquiries" email={session.email}>
      <AdminPageHeader
        title="Enquiries"
        description={
          inbox.length === 0
            ? "No buyer has asked about a property yet."
            : `${open} open of ${inbox.length}. Buyers reach you here first, after verifying their number. Contact them, then forward the enquiry to the developer or close it yourself.`
        }
      />
      {inbox.length === 0 ? null : (
        <ul className="border-border bg-card divide-border divide-y rounded-lg border">
          {inbox.map((enquiry) => (
            <li
              key={enquiry.id}
              data-slot="enquiry-row"
              className="grid gap-4 p-5 md:grid-cols-[1fr_auto]"
            >
              <div className="flex min-w-0 flex-col gap-2">
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
                <p className="text-muted-foreground text-xs">
                  {enquiry.buyerName} ·{" "}
                  {enquiry.buyerPhone ?? "no number recorded"} ·{" "}
                  {enquiry.buyerEmail.endsWith(".invalid")
                    ? null
                    : `${enquiry.buyerEmail} · `}
                  {dateTime.format(new Date(enquiry.createdAt))}
                </p>
                {enquiry.status === "forwarded" && enquiry.forwardedAt ? (
                  <p
                    data-slot="enquiry-forwarded"
                    className="text-muted-foreground text-xs"
                  >
                    Forwarded to {enquiry.developerName} on{" "}
                    {dateTime.format(new Date(enquiry.forwardedAt))}.
                  </p>
                ) : null}
              </div>
              <EnquiryStatus
                id={enquiry.id}
                status={enquiry.status}
                developerName={enquiry.developerName}
              />
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
