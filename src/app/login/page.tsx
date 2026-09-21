import type { Metadata } from "next";
import { Smartphone } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { BuyerLoginForm } from "@/components/auth/buyer-login-form";
import { safeReturnPath } from "@/lib/accounts/return-path";

export const metadata: Metadata = {
  title: "Sign in — PropCompare",
  description:
    "Verify your mobile number to save properties and unlock dossiers.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const returnTo = safeReturnPath(Array.isArray(next) ? next[0] : next, "/");

  return (
    <AuthShell
      icon={Smartphone}
      title="Sign in with your mobile number"
      description="We'll text you a code. New here? Verifying your number creates your account. There is no password to remember."
      footer="We use your number only to verify you and to reach you about properties you ask about."
    >
      <BuyerLoginForm returnTo={returnTo} />
    </AuthShell>
  );
}
