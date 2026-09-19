import type { Metadata } from "next";
import { PortalLanding } from "@/components/auth/portal-landing";
import { requirePortalRole } from "@/lib/accounts/session";

export const metadata: Metadata = {
  title: "Admin console — PropCompare",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await requirePortalRole("admin", "/admin");
  return <PortalLanding portal="admin" email={session.email} />;
}
