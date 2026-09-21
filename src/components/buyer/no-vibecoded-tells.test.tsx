import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  propertyListFixture,
  richSummaryFixture,
} from "@/lib/properties/fixtures";
import { LandingScreen } from "./landing-screen";
import { PropertyCard } from "./property-card";

/**
 * Keeps the buyer surface off the generic-template look, for the rules a machine
 * can see (`docs/design/no-vibecoded-tells.v1.md`): no shadows, no large corner
 * radii, no hover lift or zoom, no coloured side stripes, and no em dashes or
 * emoji in what a buyer reads.
 *
 * Files that predate the rule and have not been restyled yet are listed in
 * `LEGACY`. A file leaves the set when the visual pass reaches it; nothing is
 * added to it. If a legacy file no longer breaks a rule, this test says so, so
 * the set only shrinks.
 */

const BUYER_DIR = import.meta.dirname;

const LEGACY = new Set<string>([]);

const BANNED: { name: string; pattern: RegExp }[] = [
  {
    name: "a drop shadow",
    pattern: /(?<![\w-])(?:hover:|focus:)?shadow(?:-(?!none)\S+)?(?=[\s"'`])/,
  },
  { name: "a corner radius above 12px", pattern: /rounded-(?:2xl|3xl)/ },
  {
    name: "a hover lift, zoom or slide",
    pattern: /(?:group-)?hover(?:\/[\w-]+)?:(?:-?translate|scale)/,
  },
  { name: "a coloured side stripe", pattern: /border-[lr]-[2-9]/ },
  {
    name: "a radial or conic gradient (an orb)",
    pattern: /(?:radial|conic)-gradient|bg-radial|bg-conic/,
  },
  {
    name: "backdrop-blur glass beyond the header",
    pattern: /backdrop-blur-(?:lg|xl|2xl|3xl)/,
  },
];

/** The buyer components and the sign-in screens a buyer sees. */
const SCANNED_DIRS = [BUYER_DIR, path.resolve(BUYER_DIR, "../auth")];

const sources = SCANNED_DIRS.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name))
    .map((name) => ({
      name,
      text: readFileSync(path.join(dir, name), "utf8"),
    })),
);

const violations = (text: string) =>
  BANNED.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);

describe("no generic-template tells in the buyer components", () => {
  for (const { name, text } of sources) {
    if (LEGACY.has(name)) continue;
    it(`${name} uses none of the banned styles`, () => {
      expect(violations(text)).toEqual([]);
    });
  }

  it("keeps the LEGACY list honest: every listed file still needs restyling", () => {
    const stale = [...LEGACY].filter((name) => {
      const file = sources.find((s) => s.name === name);
      return file !== undefined && violations(file.text).length === 0;
    });
    expect(stale).toEqual([]);
  });
});

describe("buyer copy", () => {
  const EMOJI = /\p{Extended_Pictographic}/u;

  it("the landing page has no em dash and no emoji", () => {
    const { container } = render(
      <LandingScreen recent={propertyListFixture.data} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).not.toMatch(EMOJI);
  });

  it("a property card has no em dash and no emoji", () => {
    const { container } = render(
      <PropertyCard property={richSummaryFixture} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).not.toMatch(EMOJI);
  });

  it("the landing page does not use the paired-negation headline", () => {
    const { container } = render(
      <LandingScreen recent={propertyListFixture.data} />,
    );
    const headings = [...container.querySelectorAll("h1, h2, h3")].map(
      (h) => h.textContent ?? "",
    );
    for (const heading of headings) {
      expect(heading).not.toMatch(/\bnot an? [\w ]+[,.]/i);
    }
  });
});
