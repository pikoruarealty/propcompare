import { redirect } from "next/navigation";
import { requirePortalRole } from "@/lib/accounts/session";

export const dynamic = "force-dynamic";

/** The admin home is the developer directory until the submission queue exists. */
export default async function AdminHomePage() {
  await requirePortalRole("admin", "/admin");
  redirect("/admin/developers");
}
