import { describe, expect, it } from "vitest";
import { normaliseIndianMobile } from "./phone";

describe("normaliseIndianMobile", () => {
  it.each([
    ["9825012345", "+919825012345"],
    ["98250 12345", "+919825012345"],
    ["98250-12345", "+919825012345"],
    ["+91 98250 12345", "+919825012345"],
    ["919825012345", "+919825012345"],
    ["09825012345", "+919825012345"],
  ])("accepts %j as %s", (input, expected) => {
    expect(normaliseIndianMobile(input)).toBe(expected);
  });

  it.each([
    "",
    "12345",
    "5825012345",
    "98250123456",
    "abcdefghij",
    "+1 9825012345",
  ])("rejects %j", (input) => {
    expect(normaliseIndianMobile(input)).toBeNull();
  });
});
