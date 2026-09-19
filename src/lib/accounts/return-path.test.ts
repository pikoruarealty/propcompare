import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps a same-site path, query and hash included", () => {
    expect(safeReturnPath("/properties/x?a=1#b", "/")).toBe(
      "/properties/x?a=1#b",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "properties",
    "/a\nb",
    "",
  ])("falls back for %j", (candidate) => {
    expect(safeReturnPath(candidate, "/home")).toBe("/home");
  });

  it("falls back when there is no candidate", () => {
    expect(safeReturnPath(null, "/home")).toBe("/home");
    expect(safeReturnPath(undefined, "/home")).toBe("/home");
  });
});
