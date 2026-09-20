import { notFound } from "next/navigation";
import { requirePortalRole } from "@/lib/accounts/session";

export const dynamic = "force-dynamic";

/**
 * Any admin address that is not a real screen. Signed out, it sends the person to
 * the admin sign-in like every other admin page (so no `/admin/...` address shows
 * a page without a sign-in); signed in, it is a plain not-found.
 */
export default async function AdminUnknownPage({
  params,
}: {
  params: Promise<{ rest: string[] }>;
}) {
  const { rest } = await params;
  await requirePortalRole("admin", `/admin/${rest.join("/")}`);
  notFound();
}
