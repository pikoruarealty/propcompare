import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { signInAdmin } from "@/app/actions/portal-auth";
import { safeReturnPath } from "@/lib/accounts/return-path";
import { redirectIfSignedIn } from "@/lib/accounts/session";

export const metadata: Metadata = {
  title: "Admin sign in — PropCompare",
  robots: { index: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(
    Array.isArray(next) ? next[0] : next,
    "/admin",
  );
  await redirectIfSignedIn("admin", returnTo);

  return (
    <AuthShell
      icon={ShieldCheck}
      title="Admin console"
      description="Sign in to review submissions and publish verified properties."
    >
      <PasswordLoginForm action={signInAdmin} returnTo={returnTo} />
    </AuthShell>
  );
}
