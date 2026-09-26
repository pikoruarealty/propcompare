import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "./src"),
};

/**
 * Three projects:
 *
 * - `node` runs the unit tests (`.test.ts`, not `.integration.test.ts`) in a node
 *   environment, in parallel. None of them touches the database.
 * - `integration` runs the database-backed tests (`.integration.test.ts`), one
 *   file at a time. They all share one database, and several read totals across
 *   whole tables (the usage ledger, RERA refresh counts) or list rows another
 *   file may be adding, so files running at the same moment failed one test per
 *   run, a different one each time (`DECISIONS.md` 2026-09-26). One at a time
 *   is slower and deterministic.
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
          exclude: ["src/**/*.integration.test.ts", "**/node_modules/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          fileParallelism: false,
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
