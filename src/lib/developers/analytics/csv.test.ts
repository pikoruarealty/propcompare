import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("developer CSV", () => {
  it.each(["=SUM(A1:A9)", "+1", "-1", "@cmd", "\tTab", "\rCR"])(
    "neutralises a cell that could run as a formula: %j",
    (text) => {
      expect(csvCell(text).replace(/^"/, "")).toMatch(/^'/);
    },
  );

  it("leaves numbers, empty cells and ordinary text alone", () => {
    expect(csvCell(12)).toBe("12");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell("Satellite")).toBe("Satellite");
  });

  it("quotes a comma, a quote and a line break", () => {
    expect(csvCell("Tower, A")).toBe('"Tower, A"');
    expect(csvCell('The "Big" One')).toBe('"The ""Big"" One"');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
  });

  it("guards a quoted formula too", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });

  it("ends every line with CRLF", () => {
    expect(toCsv(["a", "b"], [["x", 1]])).toBe("a,b\r\nx,1\r\n");
  });
});
