-- Local development roles. Production credentials/role provisioning belong to
-- deployment infrastructure, but the access split must be identical:
--
-- - propcompare_app: normal application connection; cannot access `private`.
-- - propcompare_service: the future matching-service connection; BYPASSRLS is
--   required because private tables deliberately have RLS enabled with zero
--   policies.
-- - propcompare_developer_reader: developer analytics code's connection; migration
--   0025 grants it SELECT on the two released-analytics tables and nothing else
--   (schema v21, DECISIONS.md 2026-09-26). No default privileges, so no future
--   table reaches it by accident.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'propcompare_app') THEN
    CREATE ROLE propcompare_app LOGIN PASSWORD 'propcompare_app_dev_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'propcompare_service') THEN
    CREATE ROLE propcompare_service LOGIN PASSWORD 'propcompare_service_dev_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'propcompare_developer_reader') THEN
    CREATE ROLE propcompare_developer_reader LOGIN PASSWORD 'propcompare_developer_reader_dev_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM propcompare_app;

REVOKE ALL ON SCHEMA private FROM propcompare_developer_reader;

GRANT CONNECT ON DATABASE propcompare TO propcompare_app, propcompare_service, propcompare_developer_reader;
GRANT USAGE ON SCHEMA public TO propcompare_app, propcompare_service, propcompare_developer_reader;
GRANT USAGE ON SCHEMA private TO propcompare_service;

-- `propcompare` is the Docker bootstrap/admin role and runs Drizzle migrations.
-- These defaults grant normal public-table access to the app while allowing the
-- dedicated service connection to query the private bucket view/table.
ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO propcompare_app;
ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO propcompare_app;
ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA private
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO propcompare_service;
ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA private
  GRANT USAGE, SELECT ON SEQUENCES TO propcompare_service;
