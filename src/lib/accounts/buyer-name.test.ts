import { describe, expect, it } from "vitest";
import {
  cleanBuyerName,
  cleanOptionalEmail,
  isPlaceholderEmail,
  isPlaceholderName,
} from "./buyer-name";

describe("buyer name and email helpers", () => {
  it("treats the placeholder and blanks as not-yet-named", () => {
    expect(isPlaceholderName("Buyer")).toBe(true);
    expect(isPlaceholderName("")).toBe(true);
    expect(isPlaceholderName(null)).toBe(true);
    expect(isPlaceholderName("Riya")).toBe(false);
  });

  it("cleans a real name and rejects the rest", () => {
    expect(cleanBuyerName("  Riya   Shah ")).toBe("Riya Shah");
    expect(cleanBuyerName("R")).toBeNull();
    expect(cleanBuyerName("Buyer")).toBeNull();
    expect(cleanBuyerName("x".repeat(61))).toBeNull();
  });

  it("recognises the stand-in email", () => {
    expect(isPlaceholderEmail("9198@buyers.propcompare.invalid")).toBe(true);
    expect(isPlaceholderEmail("riya@example.com")).toBe(false);
  });

  it("accepts a blank email, normalises a good one, flags a bad one", () => {
    expect(cleanOptionalEmail("  ")).toBeNull();
    expect(cleanOptionalEmail(" Riya@Example.com ")).toBe("riya@example.com");
    expect(cleanOptionalEmail("nope")).toBeUndefined();
  });

  it("accepts ordinary addresses that contain the letter s", () => {
    // A mistyped character class once rejected any address containing "s".
    expect(cleanOptionalEmail("testuser@gmail.com")).toBe("testuser@gmail.com");
    expect(cleanOptionalEmail("sunil@sun.in")).toBe("sunil@sun.in");
  });

  it("rejects addresses that are not addresses", () => {
    expect(cleanOptionalEmail("a b@example.com")).toBeUndefined();
    expect(cleanOptionalEmail("a@@example.com")).toBeUndefined();
    expect(cleanOptionalEmail("a@examplexcom")).toBeUndefined();
    expect(cleanOptionalEmail("@example.com")).toBeUndefined();
    expect(cleanOptionalEmail(`${"a".repeat(250)}@x.com`)).toBeUndefined();
  });
});
