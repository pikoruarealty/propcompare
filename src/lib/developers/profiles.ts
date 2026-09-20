import { count, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { developers, developerUsers, properties } from "@/db/schema/catalog";

/**
 * Canonical developer profiles, as the admin builder-profile flow manages them
 * (docs/app-flows/admin.md step 1). There is exactly one profile per developer:
 * a duplicate RERA developer id is refused rather than merged or shadowed, per
 * the one-live-representation rule in AGENTS.md.
 *
 * `developers` is not one of the live catalog tables reserved to
 * `publishSubmission`; profile identity is administered directly by an admin.
 * The database handle is a parameter so this is testable without `DATABASE_URL`.
 */

export interface DeveloperInput {
  name: string;
  reraDeveloperId: string | null;
  website: string | null;
}

type FieldErrors = Partial<Record<keyof DeveloperInput, string>>;

export type DeveloperInputResult =
  { ok: true; value: DeveloperInput } | { ok: false; errors: FieldErrors };

const collapse = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export const parseDeveloperInput = (raw: {
  name?: unknown;
  reraDeveloperId?: unknown;
  website?: unknown;
}): DeveloperInputResult => {
  const errors: FieldErrors = {};

  const name = collapse(raw.name);
  if (name.length < 2 || name.length > 120) {
    errors.name = "Enter the developer's name (2–120 characters).";
  }

  const rera = collapse(raw.reraDeveloperId);
  if (rera.length > 64) {
    errors.reraDeveloperId = "That RERA developer id is too long.";
  }

  let website: string | null = null;
  const site = collapse(raw.website);
  if (site) {
    try {
      const url = new URL(
        /^https?:\/\//i.test(site) ? site : `https://${site}`,
      );
      if (!url.hostname.includes(".")) throw new Error("no host");
      website = url.toString();
    } catch {
      errors.website = "Enter a valid website address, or leave it blank.";
    }
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { name, reraDeveloperId: rera || null, website } };
};

export interface DeveloperListItem {
  id: string;
  name: string;
  reraDeveloperId: string | null;
  linkedUsers: number;
  properties: number;
}

export const listDevelopers = async (
  database: PostgresJsDatabase,
): Promise<DeveloperListItem[]> =>
  database
    .select({
      id: developers.id,
      name: developers.name,
      reraDeveloperId: developers.reraDeveloperId,
      // The outer developer id is written out with its table name: in a
      // single-table select Drizzle drops table prefixes, and an unqualified
      // `id` inside the subquery would be the subquery's own column (always 0).
      linkedUsers: sql<number>`(select count(*)::int from ${developerUsers} where ${developerUsers.developerId} = "developers"."id")`,
      properties: sql<number>`(select count(*)::int from ${properties} where ${properties.developerId} = "developers"."id")`,
    })
    .from(developers)
    .orderBy(developers.name);

export const getDeveloper = async (
  database: PostgresJsDatabase,
  id: string,
) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [developer] = await database
    .select()
    .from(developers)
    .where(eq(developers.id, id))
    .limit(1);
  if (!developer) return null;
  const [{ value: propertyCount }] = await database
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.developerId, id));
  return { ...developer, propertyCount };
};

export type CreateDeveloperResult =
  { ok: true; id: string } | { ok: false; errors: FieldErrors };

export const createDeveloper = async (
  database: PostgresJsDatabase,
  input: DeveloperInput,
): Promise<CreateDeveloperResult> => {
  if (input.reraDeveloperId) {
    const [existing] = await database
      .select({ name: developers.name })
      .from(developers)
      .where(eq(developers.reraDeveloperId, input.reraDeveloperId))
      .limit(1);
    if (existing) {
      return {
        ok: false,
        errors: {
          reraDeveloperId: `Already recorded for ${existing.name}. Use that profile instead.`,
        },
      };
    }
  }
  const [created] = await database
    .insert(developers)
    .values({
      name: input.name,
      reraDeveloperId: input.reraDeveloperId,
      website: input.website,
    })
    .returning({ id: developers.id });
  return { ok: true, id: created.id };
};
