import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

/**
 * Two projects, split by file extension:
 *
 * - `node` runs the existing data-layer, OCR, and submission tests (`.test.ts`)
 *   in a node environment, exactly as before this split.
 * - `ui` runs buyer component tests (`.test.tsx`) in jsdom with Testing Library,
 *   so the price-restraint and honest-incompleteness guardrails are asserted on
 *   rendered output. See the 2026-09-02 entry in DECISIONS.md.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          // The default `forks` pool fails to spawn workers when the repository
          // path contains a space (this checkout lives under "PropCompare V2").
          pool: "threads",
        },
      },
    ],
  },
});
