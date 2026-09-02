import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Soft Gold is reserved strictly for verified/trust badges and is never
 * decorative (`AGENTS.md`, `docs/design/design-tokens.md`).
 *
 * `src/app/design-tokens.test.ts` keeps it out of every shadcn colour slot.
 * That is necessary but not sufficient: nothing there stops a component
 * reaching for `--color-verified-gold` directly to make a card feel premium.
 * This test closes that gap by scanning the source itself, so the reservation
 * is enforced across the whole surface rather than at one chokepoint.
 *
 * If a second genuinely verified fact earns a badge later, add its file here
 * deliberately — the point is that widening the reservation is a decision
 * someone makes on purpose, not a diff nobody notices.
 */

const SRC_ROOT = path.resolve(import.meta.dirname, "..");

/** Files allowed to name the token, and why. */
const PERMITTED = new Map([
  ["app/globals.css", "declares the token"],
  ["components/buyer/verified-badge.tsx", "is the verified badge"],
]);

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".css"];

const collectSourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) return [];
    // Tests naturally name the token in order to assert against it.
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [absolute];
  });
};

describe("Soft Gold reservation", () => {
  it("is referenced only by the token declaration and the verified badge", () => {
    const offenders = collectSourceFiles(SRC_ROOT)
      .filter((file) => readFileSync(file, "utf8").includes("verified-gold"))
      .map((file) => path.relative(SRC_ROOT, file).replaceAll(path.sep, "/"))
      .filter((relative) => !PERMITTED.has(relative));

    expect(
      offenders,
      "Soft Gold is reserved for verified/trust badges — never decorative",
    ).toEqual([]);
  });

  it("still finds the files it is meant to be guarding", () => {
    // A scan that matches nothing would pass forever. Prove it can see.
    const referencing = collectSourceFiles(SRC_ROOT)
      .filter((file) => readFileSync(file, "utf8").includes("verified-gold"))
      .map((file) => path.relative(SRC_ROOT, file).replaceAll(path.sep, "/"));

    for (const permitted of PERMITTED.keys()) {
      expect(referencing).toContain(permitted);
    }
  });
});
