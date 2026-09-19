import { redirect } from "next/navigation";
import { requirePortalRole } from "@/lib/accounts/session";

export const dynamic = "force-dynamic";

/** The admin home is the submission queue. */
export default async function AdminHomePage() {
  await requirePortalRole("admin", "/admin");
  redirect("/admin/submissions");
}
