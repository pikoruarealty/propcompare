import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The usage ledger is admin-only (DECISIONS.md 2026-09-20). This guard walks the
 * source tree and fails if anything outside the places allowed to touch it
 * imports the ledger or its table, so a cost can't leak into a developer or
 * buyer surface by someone reaching for a convenient query.
 *
 * Allowed: the ledger itself, its schema, the admin console (`src/app/admin`,
 * `src/components/admin`), the admin-only API under `src/app/api/v1/admin`, and
 * the ingestion code that records spend. Everything else — the developer portal
 * (`src/app/developers`), the buyer app and every other API route — is not.
 */
const root = path.resolve(__dirname, "../..");

const ALLOWED = [
  "lib/usage/",
  "db/schema/usage.ts",
  "app/admin/",
  "components/admin/",
  "app/api/v1/admin/",
  "lib/ingestion/page-suggestions",
  "lib/ocr/ingestion",
];

const FORBIDDEN_IMPORT =
  /@\/lib\/usage|@\/db\/schema\/usage|ai_usage_events|aiUsageEvents/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });

describe("usage ledger isolation", () => {
  it("is referenced only by admin and ingestion code", () => {
    const offenders = walk(root)
      .map((file) => path.relative(root, file).replaceAll("\\", "/"))
      .filter(
        (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
      )
      .filter((file) => !ALLOWED.some((allowed) => file.startsWith(allowed)))
      .filter((file) =>
        FORBIDDEN_IMPORT.test(readFileSync(path.join(root, file), "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("keeps cost figures out of the developer portal and the buyer app entirely", () => {
    const surfaces = [
      "app/developers/",
      "components/buyer/",
      "app/properties/",
      "app/intake/",
    ];
    const offenders = walk(root)
      .map((file) => path.relative(root, file).replaceAll("\\", "/"))
      .filter((file) => surfaces.some((s) => file.startsWith(s)))
      .filter(
        (file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"),
      )
      .filter((file) =>
        /costUsd|cost_usd/.test(readFileSync(path.join(root, file), "utf8")),
      );
    expect(offenders).toEqual([]);
  });
});
