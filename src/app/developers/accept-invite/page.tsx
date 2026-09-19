import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LinkIcon } from "lucide-react";
import { db } from "@/db";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { acceptInviteAction } from "@/app/actions/developer-invite";
import { inspectInvite } from "@/lib/developers/invites";

export const metadata: Metadata = {
  title: "Accept your invitation — PropCompare",
  // The URL carries a secret; keep it out of search results and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : (value ?? "");

/**
 * The page an invited developer opens. A link that does not work — wrong,
 * expired, used, or withdrawn — always gets the same plain message, so the page
 * cannot be used to find out who has been invited.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string | string[]; t?: string | string[] }>;
}) {
  const params = await searchParams;
  const userId = first(params.u);
  const token = first(params.t);

  let invite: { email: string; developerName: string } | null = null;
  try {
    invite = await inspectInvite(db, { userId, token });
  } catch {
    invite = null;
  }

  if (!invite) {
    return (
      <AuthShell
        icon={LinkIcon}
        title="This link no longer works"
        description="Invitation links can be used once and expire after a week. Ask PropCompare to send you a new one."
        footer={
          <Link
            href="/developers/login"
            className="underline underline-offset-4"
          >
            Already set up? Sign in
          </Link>
        }
      >
        <p className="text-muted-foreground text-center text-sm">
          If you have already created your account, you can sign in instead.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon={KeyRound}
      title={`Join ${invite.developerName}`}
      description={`Choose a password for ${invite.email}. You will manage ${invite.developerName}'s listings from here.`}
    >
      <AcceptInviteForm
        action={acceptInviteAction}
        userId={userId}
        token={token}
      />
    </AuthShell>
  );
}
