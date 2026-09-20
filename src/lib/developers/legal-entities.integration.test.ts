import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema/auth";
import { developers, propertySubmissions } from "@/db/schema/catalog";
import {
  createManualSubmission,
  editSubmissionField,
  ReconciliationError,
} from "@/lib/submissions/reconciliation";
import {
  createLegalEntity,
  legalEntityBelongsToDeveloper,
  listLegalEntities,
  parseLegalEntityInput,
  updateLegalEntity,
} from "./legal-entities";

const userId = `legal-entity-test-${randomUUID()}`;
const suffix = randomUUID().slice(0, 8);
let developerId: string;
let otherDeveloperId: string;
const submissionIds: string[] = [];

beforeAll(async () => {
  await db.insert(users).values({
    id: userId,
    name: "Legal Entity Test",
    email: `${userId}@example.test`,
  });
  const created = await db
    .insert(developers)
    .values([
      { name: `Entity Test Developer ${suffix}` },
      { name: `Entity Other Developer ${suffix}` },
    ])
    .returning({ id: developers.id });
  developerId = created[0].id;
  otherDeveloperId = created[1].id;
});

afterAll(async () => {
  for (const id of submissionIds) {
    await db.delete(propertySubmissions).where(eq(propertySubmissions.id, id));
  }
  await db.delete(developers).where(eq(developers.id, developerId));
  await db.delete(developers).where(eq(developers.id, otherDeveloperId));
  await db.delete(users).where(eq(users.id, userId));
});

const input = (overrides: Record<string, unknown> = {}) => {
  const parsed = parseLegalEntityInput({
    legalName: `Realty ${suffix}`,
    entityType: "company",
    reraPromoterRegistrationNumber: "",
    ...overrides,
  });
  if (!parsed.ok) throw new Error("bad test input");
  return parsed.value;
};

describe("parseLegalEntityInput", () => {
  it("normalises the name and treats a blank promoter number as none", () => {
    expect(
      parseLegalEntityInput({
        legalName: "  Adani   Realty  Ltd ",
        entityType: "company",
        reraPromoterRegistrationNumber: "   ",
      }),
    ).toEqual({
      ok: true,
      value: {
        legalName: "Adani Realty Ltd",
        entityType: "company",
        reraPromoterRegistrationNumber: null,
      },
    });
  });

  it("rejects a missing name and an unknown type", () => {
    const result = parseLegalEntityInput({ legalName: "A", entityType: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "entityType",
        "legalName",
      ]);
    }
  });
});

describe("developer legal entities", () => {
  it("records, lists and corrects entities, refusing duplicates", async () => {
    const created = await createLegalEntity(
      db,
      developerId,
      input({ reraPromoterRegistrationNumber: `PR/${suffix}/1` }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sameNameDifferentCase = await createLegalEntity(
      db,
      developerId,
      input({ legalName: `REALTY ${suffix}` }),
    );
    expect(sameNameDifferentCase).toMatchObject({
      ok: false,
      code: "invalid",
      errors: { legalName: expect.stringContaining("already") },
    });

    const reusedNumber = await createLegalEntity(
      db,
      otherDeveloperId,
      input({
        legalName: `Other ${suffix}`,
        reraPromoterRegistrationNumber: `PR/${suffix}/1`,
      }),
    );
    expect(reusedNumber).toMatchObject({
      ok: false,
      code: "invalid",
      errors: {
        reraPromoterRegistrationNumber: expect.stringContaining(
          `Realty ${suffix}`,
        ),
      },
    });

    expect(
      await updateLegalEntity(
        db,
        created.id,
        input({
          legalName: `Realty Renamed ${suffix}`,
          entityType: "llp",
          reraPromoterRegistrationNumber: `PR/${suffix}/1`,
        }),
      ),
    ).toEqual({ ok: true, id: created.id });

    const list = await listLegalEntities(db, developerId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      legalName: `Realty Renamed ${suffix}`,
      entityType: "llp",
      properties: 0,
    });
    expect(await listLegalEntities(db, otherDeveloperId)).toEqual([]);
  });

  it("says which developer an entity belongs to", async () => {
    const [entity] = await listLegalEntities(db, developerId);
    expect(
      await legalEntityBelongsToDeveloper(db, entity.id, developerId),
    ).toBe(true);
    expect(
      await legalEntityBelongsToDeveloper(db, entity.id, otherDeveloperId),
    ).toBe(false);
    expect(await legalEntityBelongsToDeveloper(db, entity.id, null)).toBe(
      false,
    );
    expect(
      await legalEntityBelongsToDeveloper(db, "not-an-id", developerId),
    ).toBe(false);
  });

  it("only lets a submission pick its own developer's entity", async () => {
    const { submissionId } = await createManualSubmission(db, {
      developerId,
      submittedBy: userId,
    });
    submissionIds.push(submissionId);
    const [entity] = await listLegalEntities(db, developerId);
    const foreign = await createLegalEntity(
      db,
      otherDeveloperId,
      input({ legalName: `Foreign ${suffix}` }),
    );
    if (!foreign.ok) throw new Error("setup failed");

    await expect(
      editSubmissionField(db, {
        submissionId,
        fieldKey: "property.legal_entity_id",
        value: foreign.id,
      }),
    ).rejects.toBeInstanceOf(ReconciliationError);
    await expect(
      editSubmissionField(db, {
        submissionId,
        fieldKey: "property.legal_entity_id",
        value: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ code: "invalid_value" });

    await editSubmissionField(db, {
      submissionId,
      fieldKey: "property.legal_entity_id",
      value: entity.id,
    });
  });
});
