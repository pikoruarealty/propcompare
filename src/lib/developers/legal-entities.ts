import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  developerLegalEntities,
  developers,
  properties,
} from "@/db/schema/catalog";
import { LEGAL_ENTITY_TYPES, type LegalEntityType } from "./legal-entity-types";

/**
 * The legal promoter entities attached to a developer profile (schema v6,
 * section 3). A profile is the brand buyers know; an entity is the company RERA
 * registers a project under. A property links to exactly one entity, chosen during
 * reconciliation and copied to the live property only by `publishSubmission`.
 *
 * `developer_legal_entities` is not one of the live catalog tables reserved to
 * `publishSubmission`; like a developer profile, an admin administers it directly.
 * The database handle is a parameter so this is testable without `DATABASE_URL`.
 */

export {
  LEGAL_ENTITY_TYPES,
  LEGAL_ENTITY_TYPE_LABEL,
  type LegalEntityType,
} from "./legal-entity-types";

export interface LegalEntityInput {
  legalName: string;
  entityType: LegalEntityType;
  reraPromoterRegistrationNumber: string | null;
}

type FieldErrors = Partial<Record<keyof LegalEntityInput, string>>;

export type LegalEntityInputResult =
  { ok: true; value: LegalEntityInput } | { ok: false; errors: FieldErrors };

const collapse = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export const parseLegalEntityInput = (raw: {
  legalName?: unknown;
  entityType?: unknown;
  reraPromoterRegistrationNumber?: unknown;
}): LegalEntityInputResult => {
  const errors: FieldErrors = {};

  const legalName = collapse(raw.legalName);
  if (legalName.length < 2 || legalName.length > 160) {
    errors.legalName = "Enter the legal name (2–160 characters).";
  }

  if (
    typeof raw.entityType !== "string" ||
    !LEGAL_ENTITY_TYPES.includes(raw.entityType as LegalEntityType)
  ) {
    errors.entityType = "Choose the type of entity.";
  }

  const rera = collapse(raw.reraPromoterRegistrationNumber);
  if (rera.length > 64) {
    errors.reraPromoterRegistrationNumber =
      "That RERA promoter number is too long.";
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          legalName,
          entityType: raw.entityType as LegalEntityType,
          reraPromoterRegistrationNumber: rera || null,
        },
      };
};

export interface LegalEntity {
  id: string;
  developerId: string;
  legalName: string;
  entityType: LegalEntityType;
  reraPromoterRegistrationNumber: string | null;
  /** Live properties registered under this entity. */
  properties: number;
}

export const listLegalEntities = async (
  database: PostgresJsDatabase,
  developerId: string,
): Promise<LegalEntity[]> => {
  if (!/^[0-9a-f-]{36}$/i.test(developerId)) return [];
  return database
    .select({
      id: developerLegalEntities.id,
      developerId: developerLegalEntities.developerId,
      legalName: developerLegalEntities.legalName,
      entityType: developerLegalEntities.entityType,
      reraPromoterRegistrationNumber:
        developerLegalEntities.reraPromoterRegistrationNumber,
      properties: sql<number>`(select count(*)::int from ${properties} where ${properties.legalEntityId} = ${developerLegalEntities.id})`,
    })
    .from(developerLegalEntities)
    .where(eq(developerLegalEntities.developerId, developerId))
    .orderBy(asc(developerLegalEntities.legalName));
};

export type LegalEntityWriteResult =
  | { ok: true; id: string }
  | { ok: false; code: "developer_not_found" | "entity_not_found" }
  | { ok: false; code: "invalid"; errors: FieldErrors };

/**
 * A promoter registration number identifies one company, so it may be recorded
 * once. Checked before writing, so the admin gets a clear message rather than a
 * database error.
 */
const findReraConflict = async (
  database: PostgresJsDatabase,
  number: string,
  exceptEntityId?: string,
): Promise<string | null> => {
  const [entity] = await database
    .select({
      name: developerLegalEntities.legalName,
      developer: developers.name,
    })
    .from(developerLegalEntities)
    .innerJoin(
      developers,
      eq(developers.id, developerLegalEntities.developerId),
    )
    .where(
      and(
        eq(developerLegalEntities.reraPromoterRegistrationNumber, number),
        exceptEntityId
          ? ne(developerLegalEntities.id, exceptEntityId)
          : undefined,
      ),
    )
    .limit(1);
  return entity ? `${entity.name} (${entity.developer})` : null;
};

const findNameConflict = async (
  database: PostgresJsDatabase,
  developerId: string,
  legalName: string,
  exceptEntityId?: string,
): Promise<boolean> => {
  const [row] = await database
    .select({ id: developerLegalEntities.id })
    .from(developerLegalEntities)
    .where(
      and(
        eq(developerLegalEntities.developerId, developerId),
        sql`lower(${developerLegalEntities.legalName}) = lower(${legalName})`,
        exceptEntityId
          ? ne(developerLegalEntities.id, exceptEntityId)
          : undefined,
      ),
    )
    .limit(1);
  return row !== undefined;
};

const conflictErrors = async (
  database: PostgresJsDatabase,
  developerId: string,
  input: LegalEntityInput,
  exceptEntityId?: string,
): Promise<FieldErrors> => {
  const errors: FieldErrors = {};
  if (
    await findNameConflict(
      database,
      developerId,
      input.legalName,
      exceptEntityId,
    )
  ) {
    errors.legalName = "This developer already has an entity with that name.";
  }
  if (input.reraPromoterRegistrationNumber) {
    const owner = await findReraConflict(
      database,
      input.reraPromoterRegistrationNumber,
      exceptEntityId,
    );
    if (owner) {
      errors.reraPromoterRegistrationNumber = `Already recorded for ${owner}.`;
    }
  }
  return errors;
};

export const createLegalEntity = async (
  database: PostgresJsDatabase,
  developerId: string,
  input: LegalEntityInput,
): Promise<LegalEntityWriteResult> => {
  if (!/^[0-9a-f-]{36}$/i.test(developerId)) {
    return { ok: false, code: "developer_not_found" };
  }
  const [developer] = await database
    .select({ id: developers.id })
    .from(developers)
    .where(eq(developers.id, developerId));
  if (!developer) return { ok: false, code: "developer_not_found" };

  const errors = await conflictErrors(database, developerId, input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, code: "invalid", errors };
  }
  const [created] = await database
    .insert(developerLegalEntities)
    .values({ developerId, ...input })
    .returning({ id: developerLegalEntities.id });
  return { ok: true, id: created.id };
};

export const updateLegalEntity = async (
  database: PostgresJsDatabase,
  entityId: string,
  input: LegalEntityInput,
): Promise<LegalEntityWriteResult> => {
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    return { ok: false, code: "entity_not_found" };
  }
  const [existing] = await database
    .select({ developerId: developerLegalEntities.developerId })
    .from(developerLegalEntities)
    .where(eq(developerLegalEntities.id, entityId));
  if (!existing) return { ok: false, code: "entity_not_found" };

  const errors = await conflictErrors(
    database,
    existing.developerId,
    input,
    entityId,
  );
  if (Object.keys(errors).length > 0) {
    return { ok: false, code: "invalid", errors };
  }
  await database
    .update(developerLegalEntities)
    .set(input)
    .where(eq(developerLegalEntities.id, entityId));
  return { ok: true, id: entityId };
};

/** Whether an entity exists and belongs to the developer (used before linking it to a property). */
export const legalEntityBelongsToDeveloper = async (
  database: Pick<PostgresJsDatabase, "select">,
  entityId: string,
  developerId: string | null,
): Promise<boolean> => {
  if (!developerId || !/^[0-9a-f-]{36}$/i.test(entityId)) return false;
  const [row] = await database
    .select({ id: developerLegalEntities.id })
    .from(developerLegalEntities)
    .where(
      and(
        eq(developerLegalEntities.id, entityId),
        eq(developerLegalEntities.developerId, developerId),
      ),
    );
  return row !== undefined;
};
