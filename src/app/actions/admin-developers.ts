"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { requirePortalRole } from "@/lib/accounts/session";
import {
  createDeveloper,
  parseDeveloperInput,
} from "@/lib/developers/profiles";

export interface DeveloperFormState {
  errors: Partial<Record<"name" | "reraDeveloperId" | "website", string>>;
  values: { name: string; reraDeveloperId: string; website: string };
}

/**
 * Creates a canonical developer profile. Re-checks the admin role itself: a
 * server action is a public endpoint, and the page that rendered the form is
 * not an authorization check.
 */
export const createDeveloperAction = async (
  _previous: DeveloperFormState,
  formData: FormData,
): Promise<DeveloperFormState> => {
  await requirePortalRole("admin", "/admin/developers/new");

  const values = {
    name: String(formData.get("name") ?? ""),
    reraDeveloperId: String(formData.get("reraDeveloperId") ?? ""),
    website: String(formData.get("website") ?? ""),
  };

  const parsed = parseDeveloperInput(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const created = await createDeveloper(db, parsed.value);
  if (!created.ok) return { errors: created.errors, values };

  redirect(`/admin/developers/${created.id}`);
};
