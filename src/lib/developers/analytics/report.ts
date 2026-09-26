import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { properties } from "@/db/schema/catalog";
import {
  RELEASE_BUDGET_BANDS,
  RELEASE_DEVICES,
  developerAnalyticsReleased,
  developerAnalyticsRuns,
} from "@/db/schema/developer-analytics";
import { dossierFactCount } from "@/lib/properties/dossier";
import { getPublishedPropertyBySlug } from "@/lib/properties/queries";
import { isListed } from "@/lib/properties/visibility";
import {
  DIMENSION_LABELS,
  FIGURE_LABELS,
  FIGURE_OF_METRIC,
  FIGURE_UNITS,
  METRIC_OF_FIGURE,
  PORTFOLIO_FIGURES,
  SPLIT_FIGURES,
  type FigureKey,
} from "./metrics";
import {
  WINDOW_LABELS,
  windowCoverage,
  type ReportWindowKey,
  type WindowCoverage,
} from "./windows";

/**
 * What a signed-in developer sees of their own analytics (schema v21,
 * `DECISIONS.md` 2026-09-26). Every figure comes from the released table through
 * the read-only reader connection, so a raw event, a visitor id or a number that
 * did not meet the 5-visitor gate cannot reach here: a withheld figure arrives
 * with no number and is returned that way, never as a zero.
 *
 * `developerId` is always the signed-in developer's own (from
 * `requirePortalRole("developer", …)` or the API session), never from a request.
 * The reader connection can select every developer's rows, so filtering by that
 * id is this module's job, and every query below does it.
 *
 * Both connections are parameters: `@/db` and `@/db/developer-reader` throw at
 * import without their environment variables, which would make this untestable.
 */

export type ReaderDb = PostgresJsDatabase<Record<string, never>>;
export type CatalogDb = PostgresJsDatabase<Record<string, never>>;

export interface Connections {
  /** `propcompare_developer_reader`: released figures only. */
  reader: ReaderDb;
  /** The normal application connection: the developer's own listed properties. */
  catalog: CatalogDb;
}

/** A released daily job that has not finished for this long is called stale. */
export const STALE_AFTER_HOURS = 36;

/** A figure: its number when it met the gate, otherwise no number at all. */
export interface Figure {
  released: boolean;
  value: number | null;
}

const WITHHELD: Figure = { released: false, value: null };

export interface ReportMeta {
  window: {
    key: ReportWindowKey;
    label: string;
    /** First day, India time; null only if the run wrote nothing for it. */
    start: string | null;
    /** Last complete day, India time. */
    end: string;
  };
  /** When the job last finished. */
  generatedAt: string;
  /** Tracking began on or after this instant; nothing earlier is implied. */
  trackingSince: string | null;
  coverage: WindowCoverage;
  /** The distinct-visitor gate behind every figure. */
  minVisitors: number;
  rulesVersion: string;
  /** The last successful run is older than `STALE_AFTER_HOURS`. */
  stale: boolean;
}

export interface SplitCell {
  key: string;
  figure: Figure;
}

export interface Split {
  figure: FigureKey;
  dimension: "budget_band" | "device";
  cells: SplitCell[];
}

export type PropertyFigures = Record<FigureKey, Figure>;

export interface PropertyRef {
  id: string;
  slug: string;
  name: string;
  city: string;
  locality: string;
}

export interface Completeness {
  stated: number;
  total: number;
}

export interface PortfolioReport {
  /** Null until the release job has succeeded once. */
  meta: ReportMeta | null;
  portfolio: Record<(typeof PORTFOLIO_FIGURES)[number], Figure>;
  properties: (PropertyRef & {
    figures: PropertyFigures;
    completeness: Completeness;
  })[];
}

export interface PropertyReport {
  meta: ReportMeta | null;
  property: PropertyRef;
  figures: PropertyFigures;
  splits: Split[];
  completeness: Completeness;
}

interface Run {
  id: string;
  finishedAt: Date;
  dataThrough: string;
  trackingSince: Date | null;
  minVisitors: number;
  rulesVersion: string;
}

interface ReleasedRow {
  propertyId: string | null;
  metric: string;
  dimension: string;
  dimensionValue: string | null;
  released: boolean;
  value: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The latest run that succeeded; a failed or running one is never reported. */
export const latestRun = async (reader: ReaderDb): Promise<Run | null> => {
  const [run] = await reader
    .select({
      id: developerAnalyticsRuns.id,
      finishedAt: developerAnalyticsRuns.finishedAt,
      dataThrough: developerAnalyticsRuns.dataThrough,
      trackingSince: developerAnalyticsRuns.trackingSince,
      minVisitors: developerAnalyticsRuns.minVisitors,
      rulesVersion: developerAnalyticsRuns.rulesVersion,
    })
    .from(developerAnalyticsRuns)
    .where(eq(developerAnalyticsRuns.status, "succeeded"))
    .orderBy(desc(developerAnalyticsRuns.finishedAt))
    .limit(1);
  if (!run || !run.finishedAt) return null;
  return { ...run, finishedAt: run.finishedAt };
};

const buildMeta = async (
  reader: ReaderDb,
  run: Run,
  key: ReportWindowKey,
  now: Date,
): Promise<ReportMeta> => {
  // The first day of the window is the same for everyone; the row carries only
  // dates, so this reveals nothing about any developer.
  const [dates] = await reader
    .select({ start: developerAnalyticsReleased.windowStart })
    .from(developerAnalyticsReleased)
    .where(
      and(
        eq(developerAnalyticsReleased.runId, run.id),
        eq(developerAnalyticsReleased.window, key),
      ),
    )
    .limit(1);
  const start = dates?.start ?? null;
  return {
    window: { key, label: WINDOW_LABELS[key], start, end: run.dataThrough },
    generatedAt: run.finishedAt.toISOString(),
    trackingSince: run.trackingSince?.toISOString() ?? null,
    coverage: start
      ? windowCoverage(run.trackingSince, { start, end: run.dataThrough })
      : "none",
    minVisitors: run.minVisitors,
    rulesVersion: run.rulesVersion,
    stale:
      now.getTime() - run.finishedAt.getTime() >
      STALE_AFTER_HOURS * 60 * 60 * 1000,
  };
};

/** Released rows for one developer and window, optionally one property. */
const loadRows = async (
  reader: ReaderDb,
  runId: string,
  developerId: string,
  key: ReportWindowKey,
  propertyId?: string,
  limit?: number,
): Promise<ReleasedRow[]> => {
  const query = reader
    .select({
      propertyId: developerAnalyticsReleased.propertyId,
      metric: developerAnalyticsReleased.metric,
      dimension: developerAnalyticsReleased.dimension,
      dimensionValue: developerAnalyticsReleased.dimensionValue,
      released: developerAnalyticsReleased.released,
      value: developerAnalyticsReleased.value,
    })
    .from(developerAnalyticsReleased)
    .where(
      and(
        eq(developerAnalyticsReleased.runId, runId),
        eq(developerAnalyticsReleased.window, key),
        eq(developerAnalyticsReleased.developerId, developerId),
        propertyId === undefined
          ? undefined
          : eq(developerAnalyticsReleased.propertyId, propertyId),
      ),
    )
    .orderBy(
      asc(developerAnalyticsReleased.propertyId),
      asc(developerAnalyticsReleased.metric),
      asc(developerAnalyticsReleased.dimension),
      asc(developerAnalyticsReleased.dimensionValue),
    );
  const rows = await (limit === undefined ? query : query.limit(limit));
  return rows.map((row) => ({
    ...row,
    // A figure is released only with a number, and a number only if released.
    released: row.released && row.value !== null,
    value: row.released && row.value !== null ? Number(row.value) : null,
  }));
};

const figureFrom = (row: ReleasedRow | undefined): Figure =>
  row && row.released && row.value !== null
    ? { released: true, value: row.value }
    : WITHHELD;

const unsplit = (rows: ReleasedRow[], propertyId: string | null) => {
  const byMetric = new Map<string, ReleasedRow>();
  for (const row of rows) {
    if (row.dimension === "none" && row.propertyId === propertyId) {
      byMetric.set(row.metric, row);
    }
  }
  return byMetric;
};

/** All eleven figures of one property; one with no row is withheld. */
export const propertyFigures = (
  rows: ReleasedRow[],
  propertyId: string,
): PropertyFigures => {
  const byMetric = unsplit(rows, propertyId);
  return Object.fromEntries(
    (Object.keys(FIGURE_LABELS) as FigureKey[]).map((figure) => {
      return [figure, figureFrom(byMetric.get(METRIC_OF_FIGURE[figure]))];
    }),
  ) as PropertyFigures;
};

const portfolioFigures = (rows: ReleasedRow[]) => {
  const byMetric = unsplit(rows, null);
  return Object.fromEntries(
    PORTFOLIO_FIGURES.map((figure) => {
      return [figure, figureFrom(byMetric.get(METRIC_OF_FIGURE[figure]))];
    }),
  ) as PortfolioReport["portfolio"];
};

const SPLIT_ORDER: Record<string, readonly string[]> = {
  budget_band: RELEASE_BUDGET_BANDS,
  device: RELEASE_DEVICES,
};

/** The counted splits of one property, in a fixed order; none are invented. */
export const propertySplits = (
  rows: ReleasedRow[],
  propertyId: string,
): Split[] => {
  const splits: Split[] = [];
  for (const { figure, dimensions } of SPLIT_FIGURES) {
    const metric = METRIC_OF_FIGURE[figure];
    for (const dimension of dimensions) {
      const order = SPLIT_ORDER[dimension];
      const cells = rows
        .filter(
          (row) =>
            row.propertyId === propertyId &&
            row.metric === metric &&
            row.dimension === dimension &&
            row.dimensionValue !== null,
        )
        .map((row) => ({
          key: row.dimensionValue as string,
          figure: figureFrom(row),
        }))
        .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
      if (cells.length > 0) splits.push({ figure, dimension, cells });
    }
  }
  return splits;
};

/** The developer's own listed properties, by name. Nobody else's. */
export const listOwnProperties = async (
  catalog: CatalogDb,
  developerId: string,
): Promise<PropertyRef[]> =>
  catalog
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      city: properties.city,
      locality: properties.locality,
    })
    .from(properties)
    .where(and(eq(properties.developerId, developerId), isListed))
    .orderBy(asc(properties.name), asc(properties.id));

/**
 * How much of a property's record is stated: the dossier's own "facts stated"
 * count (`dossierFactCount`), so a developer sees the same number a buyer's page
 * is built from. It measures completeness of the record and is not a score.
 */
export const propertyCompleteness = async (
  catalog: CatalogDb,
  slug: string,
): Promise<Completeness> => {
  const dossier = await getPublishedPropertyBySlug(catalog, slug);
  return dossier ? dossierFactCount(dossier) : { stated: 0, total: 0 };
};

export const getPortfolioReport = async (
  { reader, catalog }: Connections,
  developerId: string,
  key: ReportWindowKey,
  now: Date = new Date(),
): Promise<PortfolioReport> => {
  const [own, run] = await Promise.all([
    listOwnProperties(catalog, developerId),
    latestRun(reader),
  ]);
  const [rows, meta, completeness] = await Promise.all([
    run ? loadRows(reader, run.id, developerId, key) : Promise.resolve([]),
    run ? buildMeta(reader, run, key, now) : Promise.resolve(null),
    Promise.all(own.map((p) => propertyCompleteness(catalog, p.slug))),
  ]);
  return {
    meta,
    portfolio: portfolioFigures(rows),
    properties: own.map((property, index) => ({
      ...property,
      figures: propertyFigures(rows, property.id),
      completeness: completeness[index],
    })),
  };
};

/**
 * One of the developer's own listed properties, or `null`. A property that
 * belongs to another developer, is not listed or does not exist gives the same
 * `null`, so the answer never confirms that someone else's property exists.
 */
export const getPropertyReport = async (
  { reader, catalog }: Connections,
  developerId: string,
  propertyId: string,
  key: ReportWindowKey,
  now: Date = new Date(),
): Promise<PropertyReport | null> => {
  if (!UUID.test(propertyId)) return null;
  const [property] = await catalog
    .select({
      id: properties.id,
      slug: properties.slug,
      name: properties.name,
      city: properties.city,
      locality: properties.locality,
    })
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.developerId, developerId),
        isListed,
      ),
    )
    .limit(1);
  if (!property) return null;

  const run = await latestRun(reader);
  const [rows, meta, completeness] = await Promise.all([
    run
      ? loadRows(reader, run.id, developerId, key, property.id)
      : Promise.resolve([]),
    run ? buildMeta(reader, run, key, now) : Promise.resolve(null),
    propertyCompleteness(catalog, property.slug),
  ]);
  return {
    meta,
    property,
    figures: propertyFigures(rows, property.id),
    splits: propertySplits(rows, property.id),
    completeness,
  };
};

/** The most rows one export carries; a developer with more exports one property. */
export const MAX_EXPORT_ROWS = 10000;

export interface ExportRow {
  property: string;
  figure: string;
  unit: string;
  split: string;
  splitValue: string;
  status: "released" | "not enough data";
  value: number | null;
}

export type ExportResult =
  | { ok: true; meta: ReportMeta | null; rows: ExportRow[] }
  | { ok: false; reason: "too_large" };

/**
 * Every figure of the window as flat rows: one row per figure, split cell and
 * property, with the portfolio first. A withheld figure is a row with the status
 * "not enough data" and an empty value. Pass `propertyId` (already checked as the
 * developer's own) to export one property.
 */
export const getExportRows = async (
  { reader, catalog }: Connections,
  developerId: string,
  key: ReportWindowKey,
  propertyId?: string,
  now: Date = new Date(),
): Promise<ExportResult> => {
  const [own, run] = await Promise.all([
    listOwnProperties(catalog, developerId),
    latestRun(reader),
  ]);
  if (!run) return { ok: true, meta: null, rows: [] };

  const rows = await loadRows(
    reader,
    run.id,
    developerId,
    key,
    propertyId,
    MAX_EXPORT_ROWS + 1,
  );
  if (rows.length > MAX_EXPORT_ROWS) return { ok: false, reason: "too_large" };

  const names = new Map(own.map((p) => [p.id, p.name]));
  const figureOrder = Object.keys(FIGURE_LABELS);
  const out: ExportRow[] = [];
  for (const row of rows) {
    const figure = FIGURE_OF_METRIC[row.metric];
    // A row for a property that is no longer this developer's listed one is not
    // exported; the release job replaces it on the next run.
    const name =
      row.propertyId === null ? "All properties" : names.get(row.propertyId);
    if (!figure || name === undefined) continue;
    out.push({
      property: name,
      figure: FIGURE_LABELS[figure],
      unit: FIGURE_UNITS[figure],
      split:
        row.dimension === "none"
          ? ""
          : DIMENSION_LABELS[row.dimension as keyof typeof DIMENSION_LABELS],
      splitValue: row.dimensionValue ?? "",
      status: row.released ? "released" : "not enough data",
      value: row.value,
    });
  }
  out.sort(
    (a, b) =>
      (a.property === "All properties" ? 0 : 1) -
        (b.property === "All properties" ? 0 : 1) ||
      a.property.localeCompare(b.property) ||
      figureOrder.findIndex((k) => FIGURE_LABELS[k as FigureKey] === a.figure) -
        figureOrder.findIndex(
          (k) => FIGURE_LABELS[k as FigureKey] === b.figure,
        ) ||
      a.split.localeCompare(b.split),
  );
  return { ok: true, meta: await buildMeta(reader, run, key, now), rows: out };
};
