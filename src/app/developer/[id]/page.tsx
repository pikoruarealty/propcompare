import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { DeveloperScreen } from "@/components/buyer/developer-screen";
import { getPublicDeveloper } from "@/lib/properties/developer-profile";
import { assertNoExcludedData } from "@/lib/properties/no-price";

/**
 * `/developer/{id}`: a developer's public profile and published projects. It is
 * singular on purpose: `/developers` is the developer portal (sign-in, invites).
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const generateMetadata = async ({
  params,
}: PageProps<"/developer/[id]">): Promise<Metadata> => {
  const { id } = await params;
  const developer = UUID.test(id) ? await getPublicDeveloper(db, id) : null;
  return {
    title: developer
      ? `${developer.name} | PropCompare`
      : "Developer not found | PropCompare",
  };
};

export default async function DeveloperPage({
  params,
}: PageProps<"/developer/[id]">) {
  const { id } = await params;
  // A malformed id is a missing page, not a database error.
  if (!UUID.test(id)) notFound();
  const developer = await getPublicDeveloper(db, id);
  if (developer === null) notFound();
  return (
    <DeveloperScreen
      developer={{
        ...developer,
        properties: assertNoExcludedData(developer.properties),
      }}
    />
  );
}
