import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { signInDeveloper } from "@/app/actions/portal-auth";
import { safeReturnPath } from "@/lib/accounts/return-path";
import { redirectIfSignedIn } from "@/lib/accounts/session";

export const metadata: Metadata = {
  title: "Developer sign in — PropCompare",
  robots: { index: false },
};

export default async function DeveloperLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(
    Array.isArray(next) ? next[0] : next,
    "/developers",
  );
  await redirectIfSignedIn("developer", returnTo);

  return (
    <AuthShell
      icon={Building2}
      title="Developer portal"
      description="Sign in to submit and track your project listings."
      footer="Accounts are created by invitation. If you haven't received one, contact PropCompare."
    >
      <PasswordLoginForm action={signInDeveloper} returnTo={returnTo} />
    </AuthShell>
  );
}
