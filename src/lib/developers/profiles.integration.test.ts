import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { developers } from "@/db/schema/catalog";
import { createDeveloper, getDeveloper, listDevelopers } from "./profiles";

const created: string[] = [];
afterAll(async () => {
  if (created.length) {
    await db.delete(developers).where(inArray(developers.id, created));
  }
});

describe("developer profiles", () => {
  it("creates a profile, lists it, and reads it back", async () => {
    const name = `Test Developer ${randomUUID()}`;
    const result = await createDeveloper(db, {
      name,
      reraDeveloperId: `RERA-${randomUUID()}`,
      website: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    created.push(result.id);

    const listed = (await listDevelopers(db)).find((d) => d.id === result.id);
    expect(listed).toMatchObject({ name, linkedUsers: 0, properties: 0 });

    const detail = await getDeveloper(db, result.id);
    expect(detail?.name).toBe(name);
    expect(detail?.propertyCount).toBe(0);
  });

  it("refuses a second profile with the same RERA developer id", async () => {
    const rera = `RERA-${randomUUID()}`;
    const first = await createDeveloper(db, {
      name: `First ${randomUUID()}`,
      reraDeveloperId: rera,
      website: null,
    });
    if (first.ok) created.push(first.id);

    const second = await createDeveloper(db, {
      name: "Second",
      reraDeveloperId: rera,
      website: null,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.errors.reraDeveloperId).toMatch(/already/i);
    const rows = await db
      .select()
      .from(developers)
      .where(eq(developers.reraDeveloperId, rera));
    expect(rows).toHaveLength(1);
  });

  it("returns null for an unknown or malformed id", async () => {
    expect(await getDeveloper(db, randomUUID())).toBeNull();
    expect(await getDeveloper(db, "not-a-uuid")).toBeNull();
  });
});
