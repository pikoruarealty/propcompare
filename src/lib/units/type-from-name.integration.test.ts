import "dotenv/config";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { bhkTypes, layoutTypes } from "@/db/schema/catalog";
import { unitTypeKeysFromName } from "./type-from-name";

describe("the keys a unit type's name can give", () => {
  it("are all in the real bedroom and layout vocabularies, so a publish never refuses one", async () => {
    const bhk = new Set(
      (await db.select({ key: bhkTypes.key }).from(bhkTypes)).map(
        (row) => row.key,
      ),
    );
    const layout = new Set(
      (await db.select({ key: layoutTypes.key }).from(layoutTypes)).map(
        (row) => row.key,
      ),
    );

    for (const name of [
      "1 BHK",
      "2 BHK",
      "3 BHK",
      "4 BHK",
      "5 BHK",
      "9 BHK",
      "Studio",
    ]) {
      expect(bhk.has(unitTypeKeysFromName(name).bhkTypeKey!)).toBe(true);
    }
    for (const name of ["Penthouse", "Duplex", "Simplex"]) {
      expect(layout.has(unitTypeKeysFromName(name).layoutTypeKey!)).toBe(true);
    }
  });
});
