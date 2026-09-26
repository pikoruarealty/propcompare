/**
 * What each released figure is called and how it is counted, in the words a
 * developer sees (schema v21 `release-v1`, `docs/schema/schema.v21.md`). One
 * table, so the portal, the API's CSV and the tests never name a figure two ways.
 *
 * "Visitors" are browsers PropCompare could tell apart by an anonymous id. A
 * browser that asked not to be tracked (Global Privacy Control, Do Not Track) is
 * recorded without one, so it is never a visitor here; `views` and `comparisons`
 * count what happened and so include it. Nothing here is a score.
 */

export const FIGURE_LABELS = {
  visitors: "Visitors",
  viewers: "Viewers",
  comparers: "Comparers",
  savers: "Savers",
  unlockers: "Sign-ins to see detail",
  visits: "Visits",
  returningVisitors: "Returning visitors",
  medianDossierSeconds: "Time on the property page, per visitor",
  medianCompareSeconds: "Time comparing it, per visitor",
  views: "Page views",
  comparisons: "Comparisons opened",
} as const;

export type FigureKey = keyof typeof FIGURE_LABELS;

/** Whole seconds, or a median in seconds, so the CSV states its unit. */
export const FIGURE_UNITS: Record<FigureKey, "people" | "count" | "seconds"> = {
  visitors: "people",
  viewers: "people",
  comparers: "people",
  savers: "people",
  unlockers: "people",
  visits: "count",
  returningVisitors: "people",
  medianDossierSeconds: "seconds",
  medianCompareSeconds: "seconds",
  views: "count",
  comparisons: "count",
};

/** The released metric names (`developer_analytics_released.metric`) by figure. */
export const METRIC_OF_FIGURE: Record<FigureKey, string> = {
  visitors: "visitors",
  viewers: "viewers",
  comparers: "comparers",
  savers: "savers",
  unlockers: "unlockers",
  visits: "visits",
  returningVisitors: "returning_visitors",
  medianDossierSeconds: "median_dossier_seconds",
  medianCompareSeconds: "median_compare_seconds",
  views: "views",
  comparisons: "comparisons",
};

export const FIGURE_OF_METRIC: Record<string, FigureKey> = Object.fromEntries(
  Object.entries(METRIC_OF_FIGURE).map(([figure, metric]) => [
    metric,
    figure as FigureKey,
  ]),
);

/** Figures that also exist for a developer's whole portfolio. */
export const PORTFOLIO_FIGURES = [
  "visitors",
  "visits",
  "returningVisitors",
] as const satisfies readonly FigureKey[];

/** The figures split by budget band or device, and by which. */
export const SPLIT_FIGURES = [
  {
    figure: "visitors",
    dimensions: ["budget_band", "device", "intake_bhk", "intake_city"],
  },
  { figure: "viewers", dimensions: ["budget_band", "device"] },
  { figure: "comparers", dimensions: ["budget_band"] },
] as const satisfies readonly {
  figure: FigureKey;
  dimensions: readonly (
    "budget_band" | "device" | "intake_bhk" | "intake_city"
  )[];
}[];

export const DIMENSION_LABELS = {
  budget_band: "Budget band",
  device: "Device",
  intake_bhk: "BHK wanted",
  intake_city: "City searched",
} as const;
