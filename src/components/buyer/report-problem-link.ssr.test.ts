import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportProblemLink } from "./report-problem-link";

/**
 * The dossier is a server-rendered page, and a `"use client"` component is still
 * rendered on the server to produce its HTML. Reading `window` while rendering
 * threw there, so the dossier's server render failed and the whole page fell back
 * to client rendering. This runs in a node environment, where `window` genuinely
 * does not exist, so it fails if that ever returns.
 */
describe("ReportProblemLink, rendered on the server", () => {
  it("renders without a window", () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe(
      "undefined",
    );
    expect(() =>
      renderToString(
        createElement(ReportProblemLink, { propertyName: "Anamika" }),
      ),
    ).not.toThrow();
  });
});
