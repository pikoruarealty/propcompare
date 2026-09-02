# Local database setup

Every connection is read from the environment — nothing in the codebase hard-codes a
host, port, or credential. Copy `.env.example` to `.env` and point the three URLs at
whatever Postgres you run locally. `.env` is gitignored, so each developer's local
setup stays their own.

```bash
cp .env.example .env
```

The three connections exist to enforce the privilege split described in
[`ARCHITECTURE.md`](../ARCHITECTURE.md). Keep them distinct even locally, because a
local setup that collapses them cannot catch a permission bug that production would:

| Variable               | Role                  | May read `private`?             |
| ---------------------- | --------------------- | ------------------------------- |
| `DATABASE_URL`         | `propcompare_app`     | **No** — the application role.  |
| `DATABASE_ADMIN_URL`   | `propcompare`         | Owner; migrations only.         |
| `DATABASE_SERVICE_URL` | `propcompare_service` | Yes — Phase 3 matching service. |

## Option A — Docker (the documented default)

```bash
docker compose up -d
```

`docker-compose.yml` provisions Postgres 17 on port 5432 and runs
`docker/postgres-init/*.sql` on first container creation, which creates the `private`
schema and the three roles. Requires WSL2 on Windows.

## Option B — an existing native Postgres install

If you already run Postgres locally (or cannot use Docker), create the database and
roles by hand. The container's init scripts assume `propcompare` is the container
superuser and owns everything, so a native install needs ownership granted explicitly.
As a superuser:

```sql
CREATE ROLE propcompare LOGIN PASSWORD 'propcompare_dev_only' NOSUPERUSER CREATEDB NOCREATEROLE;
CREATE ROLE propcompare_app LOGIN PASSWORD 'propcompare_app_dev_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE propcompare_service LOGIN PASSWORD 'propcompare_service_dev_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;

CREATE DATABASE propcompare OWNER propcompare;
```

Then, connected to `propcompare` as a superuser, apply
[`docker/postgres-init/01-schemas.sql`](../docker/postgres-init/01-schemas.sql) and
[`02-roles.sql`](../docker/postgres-init/02-roles.sql), plus the ownership grants the
container gets for free:

```sql
ALTER SCHEMA private OWNER TO propcompare;
ALTER SCHEMA public  OWNER TO propcompare;

ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO propcompare_app, propcompare_service;
ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO propcompare_app, propcompare_service;
ALTER DEFAULT PRIVILEGES FOR ROLE propcompare IN SCHEMA private
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO propcompare_service;
```

Update the `localhost:5432` in your `.env` if your instance listens elsewhere.

## Schema and seed data

```bash
bun run db:migrate      # see the caveat below
bun run db:seed         # lookup catalogs: property/BHK/layout types, amenities, specs, OCR field contract
bun run db:seed:private # the 16 fixed internal budget buckets
```

Both seeds are required before the test suite passes: the read-layer and publisher
tests resolve real lookup keys, and the budget-bucket mapping test needs the private
seed.

> **Caveat — `db:migrate` does not work on a fresh checkout.** `.gitignore` excludes
> `drizzle/meta/`, so Drizzle's migration journal and snapshots are not in the
> repository and `drizzle-kit` cannot determine what to apply. Until that is resolved,
> apply `drizzle/*.sql` in filename order with `psql` as `DATABASE_ADMIN_URL`'s role.
> Note this also means `db:generate` has no snapshot to diff against and may emit a
> migration that duplicates existing ones — check its output before committing.

## Verifying the privilege split

Worth running once after setup: the application role must be refused, and the
service role allowed.

```bash
psql "$DATABASE_URL"         -c 'select count(*) from private.budget_buckets;'  # must ERROR
psql "$DATABASE_SERVICE_URL" -c 'select count(*) from private.budget_buckets;'  # must return 16
```
