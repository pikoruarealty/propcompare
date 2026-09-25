import type { CompareModel } from "./model";

/**
 * The comparison as a signed-out visitor is allowed to receive it (`AGENTS.md`,
 * "Comparison depth is gated behind sign-in"): who each column is and the name of
 * every row. The differences-first summary is withheld too (owner direction,
 * `DECISIONS.md` 2026-09-25): which way two properties differ is itself the
 * comparison. The row names remain so the locked skeleton
 * can say what it is hiding (and, for amenities and specifications, the catalog category heading each row sits under). No cell value, no floor-plan reference, no photo strip, and no
 * per-row status (which rows differ or are gaps is itself a fact about the
 * data) leaves the server.
 *
 * This runs on the server, before the model is handed to the client. Hiding
 * rows in the browser is not a gate: the values would already be in the page.
 */
export const lockComparison = (model: CompareModel): CompareModel => ({
  columns: model.columns.map((column) => ({
    ...column,
    floorPlans: [],
    photos: [],
  })),
  groups: model.groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      key: row.key,
      label: row.label,
      cells: [],
      status: "same" as const,
      // The vocabulary's own heading, not a fact about any property.
      ...(row.category === undefined ? {} : { category: row.category }),
    })),
  })),
  summary: [],
});
