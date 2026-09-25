import { describe, expect, it } from "vitest";
import {
  describeInr,
  describeInrRange,
  groupIndian,
  parsePriceInr,
} from "./format";

describe("parsePriceInr", () => {
  it.each([
    ["25000000", "25000000"],
    ["2,50,00,000", "25000000"],
    [" 25 000 000 ", "25000000"],
    [25000000, "25000000"],
    ["1", "1"],
  ])("reads %j as %s", (input, expected) => {
    expect(parsePriceInr(input)).toBe(expected);
  });

  it.each([
    "",
    "0",
    "-5",
    "2.5",
    "2.5 Cr",
    "₹25000000",
    "abc",
    "0123",
    "12345678901234",
    null,
    undefined,
    {},
  ])("refuses %j", (input) => {
    expect(parsePriceInr(input)).toBeNull();
  });

  it("never turns a large figure into a float", () => {
    // 13 digits is under a lakh crore and stays exact as text.
    expect(parsePriceInr("9999999999999")).toBe("9999999999999");
  });
});

describe("groupIndian", () => {
  it("groups as lakh and crore", () => {
    expect(groupIndian("25000000")).toBe("2,50,00,000");
    expect(groupIndian("125000")).toBe("1,25,000");
    expect(groupIndian("999")).toBe("999");
    expect(groupIndian("")).toBe("");
  });
});

describe("describeInr", () => {
  it("says crore, lakh or rupees", () => {
    expect(describeInr("25000000")).toBe("₹2.5 crore");
    expect(describeInr("22573000")).toBe("₹2.26 crore");
    expect(describeInr("66319200")).toBe("₹6.63 crore");
    expect(describeInr("10000000")).toBe("₹1 crore");
    expect(describeInr("8500000")).toBe("₹85 lakh");
    expect(describeInr("95000")).toBe("₹95,000");
  });

  it("says nothing for something that is not a price", () => {
    expect(describeInr(null)).toBeNull();
    expect(describeInr("")).toBeNull();
    expect(describeInr("0")).toBeNull();
    expect(describeInr("abc")).toBeNull();
  });
});

describe("describeInrRange", () => {
  it("joins the two ends", () => {
    expect(describeInrRange("22573000", "66319200")).toBe(
      "₹2.26 crore to ₹6.63 crore",
    );
    expect(describeInrRange("x", "66319200")).toBeNull();
  });
});
