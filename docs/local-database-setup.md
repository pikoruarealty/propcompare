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
[`02-roles.sql`](../docker/postgres-init/02-roles.sql), plus the schema ownership the
container gets for free by running Postgres as `propcompare`:

```sql
CREATE SCHEMA private AUTHORIZATION propcompare;
ALTER SCHEMA public OWNER TO propcompare;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM propcompare_app;
GRANT CONNECT ON DATABASE propcompare TO propcompare_app, propcompare_service;
```

**Stop there — do not add blanket `ALTER DEFAULT PRIVILEGES` grants.** The migrations
grant table privileges deliberately and narrowly: `propcompare_app` gets CRUD on the
public tables, while `propcompare_service` gets `SELECT` on `public.unit_variants` and
write access to the two `private` tables, and nothing else. A convenience grant here
silently widens the service role across all 36 public tables and defeats the split the
next section asks you to verify.

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

> **Note on `drizzle/meta/`.** The journal and the latest schema snapshot are tracked
> in git and must stay that way — they are the migration history, not build output.
> Snapshots for migrations `0000`–`0003` were never committed and are not
> reconstructible, so only `0004_snapshot.json` exists. That is sufficient:
> `drizzle-kit generate` diffs against the newest snapshot only. See `DECISIONS.md`
> (2026-09-02).

## Verifying the privilege split

Worth running once after setup: the application role must be refused, and the
service role allowed.

```bash
psql "$DATABASE_URL"         -c 'select count(*) from private.budget_buckets;'  # must ERROR
psql "$DATABASE_SERVICE_URL" -c 'select count(*) from private.budget_buckets;'  # must return 16
```
