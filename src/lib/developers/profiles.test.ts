import { describe, expect, it } from "vitest";
import { parseDeveloperInput } from "./profiles";

describe("parseDeveloperInput", () => {
  it("accepts a name alone", () => {
    expect(parseDeveloperInput({ name: "  Adani   Realty " })).toEqual({
      ok: true,
      value: { name: "Adani Realty", reraDeveloperId: null, website: null },
    });
  });

  it("normalises a website without a scheme", () => {
    expect(
      parseDeveloperInput({
        name: "Kimana",
        website: "kimana.example.com",
        reraDeveloperId: " PR/GJ/AHMEDABAD/1 ",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Kimana",
        reraDeveloperId: "PR/GJ/AHMEDABAD/1",
        website: "https://kimana.example.com/",
      },
    });
  });

  it.each([{}, { name: "" }, { name: "A" }, { name: "x".repeat(121) }])(
    "requires a real name: %j",
    (raw) => {
      const result = parseDeveloperInput(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeDefined();
    },
  );

  it("rejects a website that is not one, and an over-long RERA id", () => {
    const result = parseDeveloperInput({
      name: "Valid Name",
      website: "not a url",
      reraDeveloperId: "x".repeat(65),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.website).toBeDefined();
      expect(result.errors.reraDeveloperId).toBeDefined();
    }
  });
});
