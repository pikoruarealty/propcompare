import { describe, expect, it } from "vitest";
import { shortUnitTypeName } from "./dossier";

describe("shortUnitTypeName", () => {
  it.each([
    ["Block A - 3rd Floor Unit (301 & 302)", "Block A - 3rd Floor"],
    [
      "Block A - Typical Floor Unit (401 to 2001 & 402 to 2002)",
      "Block A - Typical Floor",
    ],
    [
      "Block A Penthouse - Unit 2101 / 2102 (21st Floor Lower Level + 22nd Floor Upper Level)",
      "Block A Penthouse",
    ],
    ["Block B Penthouse - Unit 2101 / 2102", "Block B Penthouse"],
    ["Tower A — 2 BHK", "Tower A — 2 BHK"],
    ["3 BHK Premium", "3 BHK Premium"],
    ["Type A", "Type A"],
    ["Corner Unit", "Corner"],
    ["Unit", "Unit"],
    ["(301 & 302)", "(301 & 302)"],
  ])("%s -> %s", (name, expected) => {
    expect(shortUnitTypeName(name)).toBe(expected);
  });
});
