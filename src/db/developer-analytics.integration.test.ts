import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbClient } from "@/db";
import { developerReaderDbClient } from "@/db/developer-reader";

/**
 * Schema v21 against the real database (`docs/schema/schema.v21.md`,
 * `DECISIONS.md` 2026-09-26): the developer reader role sees the released
 * figures and nothing else, the application role can run the release job, and
 * the table refuses a figure that breaks a release rule.
 */

const DENIED = "42501";
const CHECK = "23514";
const UNIQUE = "23505";

const app = dbClient;
const reader = developerReaderDbClient;

let developerId: string;
let runId: string;

/** One released-table row; each test overrides what it is about. */
const insertFigure = (row: Record<string, unknown>) =>
  app`insert into developer_analytics_released ${app({
    run_id: runId,
    window: "30d",
    window_start: "2026-08-27",
    window_end: "2026-09-25",
    developer_id: developerId,
    property_id: null,
    metric: "visitors",
    dimension: "none",
    dimension_value: null,
    released: true,
    value: 12,
    ...row,
  })}`;

beforeAll(async () => {
  [{ id: developerId }] = await app`
    insert into developers (name) values (${`Release Test Developer ${randomUUID()}`})
    returning id`;
  [{ id: runId }] = await app`
    insert into developer_analytics_runs
      (status, finished_at, data_through, min_visitors, rules_version)
    values ('succeeded', now(), '2026-09-25', 5, 'release-v1')
    returning id`;
});

afterAll(async () => {
  await app`delete from developer_analytics_runs where id = ${runId}`;
  await app`delete from developers where id = ${developerId}`;
  await reader.end();
});

describe("the developer reader role", () => {
  it("reads released figures and runs", async () => {
    await insertFigure({ metric: "viewers", value: 7 });
    const rows = await reader`
      select metric, released, value from developer_analytics_released
      where run_id = ${runId} and metric = 'viewers'`;
    expect(rows).toEqual([{ metric: "viewers", released: true, value: "7" }]);
    const runs = await reader`
      select status from developer_analytics_runs where id = ${runId}`;
    expect(runs).toEqual([{ status: "succeeded" }]);
  });

  it.each([
    "analytics_events",
    "analytics_event_monthly",
    "analytics_pair_monthly",
    "properties",
    "developers",
    "users",
    "enquiries",
    "private.budget_buckets",
  ])("cannot read %s", async (table) => {
    await expect(
      reader.unsafe(`select 1 from ${table} limit 1`),
    ).rejects.toMatchObject({ code: DENIED });
  });

  it("cannot write released figures or runs", async () => {
    await expect(
      reader`delete from developer_analytics_released where run_id = ${runId}`,
    ).rejects.toMatchObject({ code: DENIED });
    await expect(
      reader`update developer_analytics_runs set status = 'failed' where id = ${runId}`,
    ).rejects.toMatchObject({ code: DENIED });
  });

  it("holds no other table privilege and no role membership", async () => {
    // From the catalog itself: `information_schema` only lists grants the
    // querying role takes part in, so it would show nothing here.
    const grants = await app`
      select n.nspname as table_schema, c.relname as table_name,
             acl.privilege_type
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) acl
      join pg_roles r on r.oid = acl.grantee
      where r.rolname = 'propcompare_developer_reader'
      order by c.relname, acl.privilege_type`;
    expect(grants).toEqual([
      {
        table_schema: "public",
        table_name: "developer_analytics_released",
        privilege_type: "SELECT",
      },
      {
        table_schema: "public",
        table_name: "developer_analytics_runs",
        privilege_type: "SELECT",
      },
    ]);
    const [role] = await app`
      select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit,
             (select count(*)::int from pg_auth_members m where m.member = r.oid) as memberships
      from pg_roles r where rolname = 'propcompare_developer_reader'`;
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolinherit: false,
      memberships: 0,
    });
  });
});

describe("the released table's rules", () => {
  it("stores a withheld figure with no number, and never a number without release", async () => {
    await insertFigure({ metric: "savers", released: false, value: null });
    await expect(
      insertFigure({ metric: "unlockers", released: false, value: 0 }),
    ).rejects.toMatchObject({ code: CHECK });
    await expect(
      insertFigure({ metric: "comparers", released: true, value: null }),
    ).rejects.toMatchObject({ code: CHECK });
  });

  it("keeps enquiry figures at portfolio level", async () => {
    await insertFigure({ metric: "enquirers", value: 6 });
    await expect(
      insertFigure({
        metric: "enquirers_comparing",
        dimension: "device",
        dimension_value: "mobile",
      }),
    ).rejects.toMatchObject({ code: CHECK });
  });

  it("accepts only known splits", async () => {
    await insertFigure({
      metric: "visitors",
      dimension: "budget_band",
      dimension_value: "₹1–1.5 crore",
    });
    await expect(
      insertFigure({
        metric: "visitors",
        dimension: "budget_band",
        dimension_value: "₹1.25 crore",
      }),
    ).rejects.toMatchObject({ code: CHECK });
    await expect(
      insertFigure({
        metric: "visitors",
        dimension: "none",
        dimension_value: "x",
      }),
    ).rejects.toMatchObject({ code: CHECK });
  });

  it("accepts only known windows and metrics", async () => {
    await expect(insertFigure({ window: "13m" })).rejects.toMatchObject({
      code: CHECK,
    });
    await expect(insertFigure({ metric: "score" })).rejects.toMatchObject({
      code: CHECK,
    });
  });

  it("holds one figure per window, property, metric and split in a run", async () => {
    await insertFigure({ metric: "visits", value: 20 });
    await expect(
      insertFigure({ metric: "visits", value: 21 }),
    ).rejects.toMatchObject({ code: UNIQUE });
  });

  it("allows one running job at a time, and a failure only with a short code", async () => {
    const [{ id }] = await app`
      insert into developer_analytics_runs (status, data_through, min_visitors, rules_version)
      values ('running', '2026-09-26', 5, 'release-v1') returning id`;
    try {
      await expect(
        app`insert into developer_analytics_runs (status, data_through, min_visitors, rules_version)
            values ('running', '2026-09-26', 5, 'release-v1')`,
      ).rejects.toMatchObject({ code: UNIQUE });
      await expect(
        app`update developer_analytics_runs
            set status = 'failed', finished_at = now(), error_code = 'Stack trace: ...'
            where id = ${id}`,
      ).rejects.toMatchObject({ code: CHECK });
    } finally {
      await app`delete from developer_analytics_runs where id = ${id}`;
    }
  });
});
