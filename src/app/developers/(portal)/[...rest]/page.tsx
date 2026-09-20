import { notFound } from "next/navigation";
import { requirePortalRole } from "@/lib/accounts/session";

export const dynamic = "force-dynamic";

/** Any developer-portal address that is not a real screen: see the admin twin. */
export default async function DeveloperUnknownPage({
  params,
}: {
  params: Promise<{ rest: string[] }>;
}) {
  const { rest } = await params;
  await requirePortalRole("developer", `/developers/${rest.join("/")}`);
  notFound();
}
