-- Runs once, on first container creation, per docker-entrypoint-initdb.d convention.
-- Sets up the two-schema split described in ARCHITECTURE.md and docs/schema/schema.v1.md:
-- `public` for everything app-facing, `private` for commercial/price data.

CREATE SCHEMA IF NOT EXISTS private;

-- Deny-by-default: RLS is enabled with zero policies, so only the service-role
-- connection (which bypasses RLS via row-level BYPASSRLS or superuser-equivalent
-- ownership) can read/write this schema. Actual tables + their RLS enablement
-- are created by the application's Drizzle migrations, not here — this script
-- only establishes the schema and the default privilege posture.

REVOKE ALL ON SCHEMA private FROM PUBLIC;
