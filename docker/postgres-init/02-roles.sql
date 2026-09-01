-- Local development roles. Production credentials/role provisioning belong to
-- deployment infrastructure, but the access split must be identical:
--
-- - propcompare_app: normal application connection; cannot access `private`.
-- - propcompare_service: the future matching-service connection; BYPASSRLS is
--   required because private tables deliberately have RLS enabled with zero
--   policies.

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
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM propcompare_app;

GRANT CONNECT ON DATABASE propcompare TO propcompare_app, propcompare_service;
GRANT USAGE ON SCHEMA public TO propcompare_app, propcompare_service;
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
