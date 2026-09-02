import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Locks the "Soft Daylight" token contract in globals.css.
 *
 * shadcn/ui's generator writes its own neutral grayscale palette and a Geist
 * font binding. Per the 2026-09-02 decision in DECISIONS.md, that second
 * palette is not kept: every shadcn semantic token must resolve to a documented
 * Soft Daylight token. These assertions fail loudly if `shadcn init` is re-run
 * and overwrites the mapping, or if Soft Gold is ever wired into a component
 * colour.
 *
 * Source of truth: docs/design/design-tokens.md.
 */
const globalsCss = readFileSync(
  path.resolve(import.meta.dirname, "globals.css"),
  "utf8",
);

const readToken = (name: string): string => {
  const match = globalsCss.match(
    new RegExp(String.raw`^\s*--${name}:\s*([^;]+);`, "m"),
  );
  if (match === null) {
    throw new Error(`--${name} is not defined in globals.css`);
  }
  return match[1].trim();
};

/** Every shadcn semantic slot that carries a colour. */
const COMPONENT_COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
];

describe("Soft Daylight design tokens", () => {
  it("defines the documented palette", () => {
    expect(readToken("color-terracotta")).toBe("#8d4934");
    expect(readToken("color-sage")).toBe("#56624b");
    expect(readToken("color-pale-sky")).toBe("#cbd5e0");
    expect(readToken("color-chalk")).toBe("#f9f8f6");
    expect(readToken("color-ink")).toBe("#1a1a1a");
    expect(readToken("color-verified-gold")).toBe("#d4af37");
  });

  it("maps shadcn semantic colours onto the documented palette", () => {
    expect(readToken("background")).toBe("var(--color-chalk)");
    expect(readToken("foreground")).toBe("var(--color-ink)");
    expect(readToken("primary")).toBe("var(--color-terracotta)");
    expect(readToken("secondary")).toBe("var(--color-sage)");
    expect(readToken("border")).toBe("var(--color-pale-sky)");
    expect(readToken("ring")).toBe("var(--color-terracotta)");
  });

  it("keeps the 8px standard radius from the token spec", () => {
    expect(readToken("radius-standard")).toBe("8px");
    expect(readToken("radius")).toBe("var(--radius-standard)");
  });

  it("reserves Soft Gold for verified badges only", () => {
    for (const token of COMPONENT_COLOR_TOKENS) {
      expect(
        readToken(token),
        `--${token} must not use --color-verified-gold; Soft Gold is reserved for Verified/trust badges`,
      ).not.toContain("verified-gold");
    }
  });

  it("does not reintroduce the generated grayscale palette", () => {
    for (const token of COMPONENT_COLOR_TOKENS) {
      expect(
        readToken(token),
        `--${token} still holds a shadcn-generated oklch grayscale value instead of a Soft Daylight token`,
      ).not.toMatch(/^oklch\(/);
    }
  });
});
