import { sql, type SQL } from "drizzle-orm";
import { specificationCatalog } from "@/db/schema/catalog";

/**
 * A specification whose contract field is still switched on. Retiring one (the
 * regulator now states the fact, `DECISIONS.md` 2026-09-25) switches its
 * `property_schema_fields` row off; a value already stored is kept, never
 * deleted (only the publish transaction writes live tables), but it is no longer
 * read out, so a fact has one live answer. Switching the field back on brings the
 * value back.
 */
export const specificationIsActive: SQL = sql`exists (
  select 1 from property_schema_fields
  where property_schema_fields.field_key = 'property.specifications.' || ${specificationCatalog.key}
    and property_schema_fields.is_active
)`;
