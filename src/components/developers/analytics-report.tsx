import Link from "next/link";
import {
  Empty,
  Panel,
  StatTiles,
  td,
  tdNum,
  th,
} from "@/components/admin/analytics/panels";
import {
  BodyText,
  DisplayHeading,
  Eyebrow,
} from "@/components/buyer/typography";
import {
  DIMENSION_LABELS,
  FIGURE_LABELS,
  type FigureKey,
} from "@/lib/developers/analytics/metrics";
import type {
  Figure,
  PortfolioReport,
  PropertyReport,
  ReportMeta,
} from "@/lib/developers/analytics/report";
import {
  DEFAULT_REPORT_WINDOW,
  REPORT_WINDOW_KEYS,
  WINDOW_LABELS,
  type ReportWindowKey,
} from "@/lib/developers/analytics/windows";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const figureText = (figure: Figure, seconds = false): string =>
  figure.released && figure.value !== null
    ? `${number.format(figure.value)}${seconds ? " seconds" : ""}`
    : "Not enough data";

export function WindowNav({
  window,
  base,
}: {
  window: ReportWindowKey;
  base: string;
}) {
  return (
    <nav aria-label="Report period" className="mt-8 flex flex-wrap gap-2">
      {REPORT_WINDOW_KEYS.map((key) => (
        <Link
          key={key}
          href={key === DEFAULT_REPORT_WINDOW ? base : `${base}?window=${key}`}
          aria-current={key === window ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm transition-colors",
            key === window
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {WINDOW_LABELS[key]}
        </Link>
      ))}
    </nav>
  );
}

export function ReportStatus({ meta }: { meta: ReportMeta | null }) {
  if (meta === null) {
    return (
      <p
        role="status"
        className="border-border bg-card mt-8 rounded-lg border p-5 text-sm"
      >
        Tracking has just started. The first daily report has not run yet.
      </p>
    );
  }
  return (
    <div className="border-border mt-8 border-y py-4 text-sm">
      <p>
        Data through{" "}
        {date.format(new Date(`${meta.window.end}T00:00:00+05:30`))}. Generated{" "}
        {dateTime.format(new Date(meta.generatedAt))}.
      </p>
      {meta.trackingSince ? (
        <p className="text-muted-foreground mt-1">
          Tracking started {date.format(new Date(meta.trackingSince))}.
          {meta.coverage === "partial"
            ? " This period includes days before tracking began."
            : meta.coverage === "none"
              ? " This period has no tracked days yet."
              : ""}
        </p>
      ) : (
        <p className="text-muted-foreground mt-1">
          No activity has been tracked for this period yet.
        </p>
      )}
      {meta.stale ? (
        <p role="status" className="text-primary mt-2 font-medium">
          This report is stale. The last successful daily release is more than
          36 hours old.
        </p>
      ) : null}
      <p className="text-muted-foreground mt-2 text-xs">
        A figure needs {meta.minVisitors} distinct identified visitors before it
        is shown. Page views and comparisons opened also include anonymous
        activity from browsers that asked not to be tracked with a lasting
        identifier.
      </p>
    </div>
  );
}

function Completeness({ stated, total }: { stated: number; total: number }) {
  return (
    <span className="data-tabular">
      {stated} of {total} facts stated
    </span>
  );
}

export function PortfolioView({
  report,
  window,
}: {
  report: PortfolioReport;
  window: ReportWindowKey;
}) {
  return (
    <>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Buyer activity</Eyebrow>
          <DisplayHeading level={1} className="mt-2">
            Your portfolio
          </DisplayHeading>
        </div>
        <Link
          href={`/api/v1/developer/export?window=${window}`}
          className="text-primary text-sm underline underline-offset-4"
        >
          Download CSV
        </Link>
      </div>
      <BodyText className="text-muted-foreground mt-4">
        How buyers engage with your listed properties. Figures are released
        daily after enough distinct visitors have contributed.
      </BodyText>
      <WindowNav window={window} base="/developers" />
      <ReportStatus meta={report.meta} />
      {report.properties.length === 0 ? (
        <Panel title="Listed properties">
          <Empty>No listed properties are linked to this developer yet.</Empty>
        </Panel>
      ) : (
        <>
          <section aria-label="Portfolio figures" className="mt-10">
            <StatTiles
              tiles={[
                {
                  label: "Visitors",
                  value: figureText(report.portfolio.visitors),
                },
                { label: "Visits", value: figureText(report.portfolio.visits) },
                {
                  label: "Returning visitors",
                  value: figureText(report.portfolio.returningVisitors),
                },
                {
                  label: "Listed properties",
                  value: number.format(report.properties.length),
                },
              ]}
            />
          </section>
          <Panel
            title="Listed properties"
            description="Open a property for its comparisons, buyer demand, nearby peer medians and facts stated."
          >
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border bg-muted/50 border-b">
                  <th scope="col" className={th}>
                    Property
                  </th>
                  <th scope="col" className={th}>
                    Locality
                  </th>
                  <th scope="col" className={cn(th, "text-right")}>
                    Visitors
                  </th>
                  <th scope="col" className={cn(th, "text-right")}>
                    Comparers
                  </th>
                  <th scope="col" className={th}>
                    Record
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.properties.map((property) => (
                  <tr
                    key={property.id}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className={td}>
                      <Link
                        href={`/developers/properties/${property.id}${window === DEFAULT_REPORT_WINDOW ? "" : `?window=${window}`}`}
                        className="text-primary font-medium underline-offset-4 hover:underline"
                      >
                        {property.name}
                      </Link>
                    </td>
                    <td className={td}>
                      {property.locality}, {property.city}
                    </td>
                    <td className={tdNum}>
                      {figureText(property.figures.visitors)}
                    </td>
                    <td className={tdNum}>
                      {figureText(property.figures.comparers)}
                    </td>
                    <td className={td}>
                      <Completeness {...property.completeness} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </>
  );
}

const FUNNEL: FigureKey[] = ["viewers", "comparers", "savers", "unlockers"];
const ENGAGEMENT: FigureKey[] = [
  "views",
  "comparisons",
  "medianDossierSeconds",
  "medianCompareSeconds",
];
const BENCHMARK_LABEL = {
  visitors: "Visitors",
  viewers: "Viewers",
  comparers: "Comparers",
  savers: "Savers",
} as const;

export function PropertyView({
  report,
  window,
}: {
  report: PropertyReport;
  window: ReportWindowKey;
}) {
  const base = `/developers/properties/${report.property.id}`;
  const funnelScale = Math.max(
    0,
    ...FUNNEL.map((key) =>
      report.figures[key].released ? (report.figures[key].value ?? 0) : 0,
    ),
  );
  return (
    <>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/developers"
            className="text-primary text-sm underline underline-offset-4"
          >
            All properties
          </Link>
          <DisplayHeading level={1} className="mt-3">
            {report.property.name}
          </DisplayHeading>
          <p className="text-muted-foreground mt-2 text-sm">
            {report.property.locality}, {report.property.city}
          </p>
        </div>
        <Link
          href={`/api/v1/developer/export?window=${window}&property=${report.property.id}`}
          className="text-primary text-sm underline underline-offset-4"
        >
          Download this property as CSV
        </Link>
      </div>
      <WindowNav window={window} base={base} />
      <ReportStatus meta={report.meta} />
      <section aria-label="Property figures" className="mt-10">
        <StatTiles
          tiles={[
            { label: "Visitors", value: figureText(report.figures.visitors) },
            { label: "Page views", value: figureText(report.figures.views) },
            {
              label: "Comparisons opened",
              value: figureText(report.figures.comparisons),
            },
            {
              label: "Facts stated",
              value: `${report.completeness.stated} of ${report.completeness.total}`,
            },
          ]}
        />
      </section>
      <Panel
        title="From viewing to a decision"
        description="Distinct visitors at each step. A withheld figure has no number; steps are not inferred from one another."
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border bg-muted/50 border-b">
              <th scope="col" className={th}>
                Step
              </th>
              <th scope="col" className={th}>
                Activity
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Visitors
              </th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL.map((key) => (
              <tr key={key} className="border-border border-b last:border-b-0">
                <td className={td}>{FIGURE_LABELS[key]}</td>
                <td className={td}>
                  {report.figures[key].released &&
                  report.figures[key].value !== null &&
                  funnelScale > 0 ? (
                    <span
                      aria-hidden="true"
                      className="bg-muted block h-2 w-full min-w-24 rounded-full"
                    >
                      <span
                        className="bg-primary block h-2 rounded-full"
                        style={{
                          width: `${(report.figures[key].value / funnelScale) * 100}%`,
                        }}
                      />
                    </span>
                  ) : null}
                </td>
                <td className={tdNum}>{figureText(report.figures[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel
        title="Engagement"
        description="Time is the median per visitor in this period, counted while the page was visible."
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-border bg-muted/50 border-b">
              <th scope="col" className={th}>
                Measure
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {ENGAGEMENT.map((key) => (
              <tr key={key} className="border-border border-b last:border-b-0">
                <td className={td}>{FIGURE_LABELS[key]}</td>
                <td className={tdNum}>
                  {figureText(report.figures[key], key.endsWith("Seconds"))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel
        title="Buyer demand"
        description="Released visitor counts by budget band, device and earlier guided-intake BHK or city. Intake choices are counted only when that visitor later viewed or compared this property. Empty or withheld cells are not treated as zero."
      >
        {report.splits.length === 0 ? (
          <Empty>No released demand splits in this period yet.</Empty>
        ) : (
          report.splits.map((split) => (
            <div
              key={`${split.figure}-${split.dimension}`}
              className="border-border border-b p-5 last:border-b-0"
            >
              <h3 className="font-display text-xl">
                {FIGURE_LABELS[split.figure]} by{" "}
                {DIMENSION_LABELS[split.dimension].toLowerCase()}
              </h3>
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="border-border border-b">
                    <th scope="col" className={th}>
                      {DIMENSION_LABELS[split.dimension]}
                    </th>
                    <th scope="col" className={cn(th, "text-right")}>
                      Visitors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {split.cells.map((cell) => (
                    <tr
                      key={cell.key}
                      className="border-border border-b last:border-b-0"
                    >
                      <td className={td}>
                        {split.dimension === "intake_bhk"
                          ? cell.key
                              .replace(/^(\d+)bhk$/, "$1 BHK")
                              .replace(/^5bhk_plus$/, "5 BHK or more")
                          : cell.key}
                      </td>
                      <td className={tdNum}>{figureText(cell.figure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </Panel>
      <Panel
        title="Compared alongside"
        description="Named listed properties opened in the same comparison by at least five distinct identified visitors. The count belongs to the pairing, not the other property."
      >
        {report.rivals.length === 0 ? (
          <Empty>Not enough comparison data for a named pairing yet.</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Other property
                </th>
                <th scope="col" className={th}>
                  Developer
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Visitors who compared both
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rivals.map((rival) => (
                <tr
                  key={rival.property.id}
                  className="border-border border-b last:border-b-0"
                >
                  <td className={td}>{rival.property.name}</td>
                  <td className={td}>
                    {rival.developerName}
                    {rival.own ? " (yours)" : ""}
                  </td>
                  <td className={tdNum}>{number.format(rival.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel
        title="Nearby peer medians"
        description="Each figure is the median across other developers' listed properties in the same locality, or city when the locality does not qualify. At least five properties from three other developers are needed."
      >
        {report.benchmarks.length === 0 ? (
          <Empty>Not enough comparable properties for a peer median yet.</Empty>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th scope="col" className={th}>
                  Measure
                </th>
                <th scope="col" className={th}>
                  Area
                </th>
                <th scope="col" className={th}>
                  Peer group
                </th>
                <th scope="col" className={cn(th, "text-right")}>
                  Median
                </th>
              </tr>
            </thead>
            <tbody>
              {report.benchmarks.map((benchmark) => (
                <tr
                  key={benchmark.figure}
                  className="border-border border-b last:border-b-0"
                >
                  <td className={td}>{BENCHMARK_LABEL[benchmark.figure]}</td>
                  <td className={td}>{benchmark.cohort}</td>
                  <td className={td}>
                    {benchmark.cohortProperties} properties from{" "}
                    {benchmark.cohortDevelopers} developers
                  </td>
                  <td className={tdNum}>{number.format(benchmark.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel
        title="Record completeness"
        description="The same facts-stated count shown on the buyer dossier. It describes the record, not how buyers value this property."
      >
        <p className="p-5 text-sm">
          <Completeness {...report.completeness} />
        </p>
      </Panel>
    </>
  );
}
