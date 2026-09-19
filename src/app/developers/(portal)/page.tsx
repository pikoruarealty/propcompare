import type { Metadata } from "next";
import { PortalLanding } from "@/components/auth/portal-landing";
import { requirePortalRole } from "@/lib/accounts/session";

export const metadata: Metadata = {
  title: "Developer portal — PropCompare",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function DeveloperHomePage() {
  const session = await requirePortalRole("developer", "/developers");
  return <PortalLanding portal="developer" email={session.email} />;
}
