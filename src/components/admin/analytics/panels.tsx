import Link from "next/link";
import type * as React from "react";
import type {
  BreakdownRow,
  CountRow,
  DayRow,
  FunnelStep,
} from "@/lib/analytics/dashboard";
import { duration, percent } from "@/lib/analytics/format";
import { visitorsHref } from "@/lib/analytics/links";
import { cn } from "@/lib/utils";

export { duration, percent };

/**
 * The pieces of the admin Analytics screen. Server-rendered. Each chart is one
 * series in the primary ink (no categorical palette), carries a hover title on
 * every mark, and sits beside the same numbers as a table, so nothing is read
 * from colour or shape alone.
 */

export const th =
  "px-4 py-3 text-xs font-semibold tracking-[0.1em] uppercase text-muted-foreground";
export const td = "px-4 py-3";
export const tdNum = "data-tabular px-4 py-3 text-right";

export function Panel({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mt-10 scroll-mt-6", className)}>
      <h2 className="font-display text-2xl">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1 mb-4 max-w-3xl text-sm">
          {description}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="border-border bg-card overflow-x-auto rounded-lg border">
        {children}
      </div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground p-8 text-center text-sm">{children}</p>
  );
}

export function StatTiles({
  tiles,
}: {
  tiles: {
    label: string;
    value: string;
    note?: string;
    /** Where the number opens to: the visitors or the table behind it. */
    link?: { href: string; label: string };
  }[];
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(({ label, value, note, link }) => (
        <div
          key={label}
          data-slot="analytics-stat"
          className={cn(
            "border-border bg-card relative flex flex-col rounded-lg border p-5",
            link && "hover:border-primary transition-colors",
          )}
        >
          <dt className="text-muted-foreground text-xs font-semibold tracking-[0.1em] uppercase">
            {label}
          </dt>
          <dd className="font-display data-tabular mt-2 text-3xl">{value}</dd>
          {note ? (
            <dd className="text-muted-foreground mt-1 text-xs">{note}</dd>
          ) : null}
          {link ? (
            <dd className="mt-3 text-sm">
              <Link
                href={link.href}
                className="text-primary underline underline-offset-4 after:absolute after:inset-0"
              >
                {link.label}
              </Link>
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/**
 * Each step as a bar against the first, with the share kept from the step before.
 * With `days`, a step's count opens the visitors who reached it and "stopped
 * here" opens those who got that far and no further.
 */
export function Funnel({
  steps,
  days,
}: {
  steps: FunnelStep[];
  days?: number;
}) {
  const top = steps[0]?.visitors ?? 0;
  return (
    <ol data-slot="analytics-funnel" className="flex flex-col gap-3 p-5">
      {steps.map((step, index) => {
        const previous =
          index === 0 ? step.visitors : steps[index - 1].visitors;
        const next = steps[index + 1];
        const stopped = next ? Math.max(step.visitors - next.visitors, 0) : 0;
        const width = top === 0 ? 0 : (step.visitors / top) * 100;
        const count = (
          <>
            {step.visitors}
            <span className="text-muted-foreground">
              {" "}
              · {index === 0 ? "100%" : percent(step.visitors, previous)}
            </span>
          </>
        );
        return (
          <li
            key={step.key}
            className="grid grid-cols-[minmax(10rem,14rem)_1fr_auto] items-center gap-4 text-sm"
            title={`${step.label}: ${step.visitors} visitors (${percent(step.visitors, top)} of all, ${percent(step.visitors, previous)} of the step before)`}
          >
            <span className="flex flex-col">
              <span>{step.label}</span>
              {days !== undefined && stopped > 0 ? (
                <Link
                  href={visitorsHref(days, `stopped=${step.key}`)}
                  className="text-primary text-xs underline underline-offset-4"
                >
                  {stopped} stopped here
                </Link>
              ) : null}
            </span>
            <span className="bg-muted h-3 rounded-full">
              <span
                className="bg-primary block h-3 rounded-full"
                style={{
                  width: `${Math.max(width, step.visitors > 0 ? 1 : 0)}%`,
                }}
              />
            </span>
            <span className="data-tabular w-32 text-right">
              {days !== undefined && step.visitors > 0 ? (
                <Link
                  href={visitorsHref(days, `reached=${step.key}`)}
                  className="underline-offset-4 hover:underline"
                >
                  {count}
                </Link>
              ) : (
                count
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Visitors per day as columns, one slot for every day of the period. A bar never
 * grows past a fixed width, so one busy day among thirty is one bar of thirty. The
 * scale is labelled, and comparisons and enquiries sit in the table below.
 */
export function DailyTrend({ days }: { days: DayRow[] }) {
  if (days.length === 0) return <Empty>No visits in this period yet.</Empty>;
  const max = Math.max(...days.map((day) => day.visitors), 1);
  const width = 720;
  const height = 160;
  const top = 20;
  const slot = width / days.length;
  const barWidth = Math.min(28, Math.max(2, slot - 2));
  return (
    <div className="p-5">
      <svg
        viewBox={`0 0 ${width} ${top + height + 22}`}
        role="img"
        aria-label="Visitors per day"
        className="h-auto w-full"
      >
        <line
          x1={0}
          x2={width}
          y1={top}
          y2={top}
          className="stroke-border"
          strokeWidth={1}
        />
        <line
          x1={0}
          x2={width}
          y1={top + height}
          y2={top + height}
          className="stroke-foreground"
          strokeWidth={1}
        />
        <text x={0} y={top - 6} className="fill-muted-foreground text-[11px]">
          {max} {max === 1 ? "visitor" : "visitors"}
        </text>
        {days.map((day, index) => {
          const h = (day.visitors / max) * height;
          const x = index * slot;
          return (
            <g key={day.day}>
              <title>{`${day.day}: ${day.visitors} visitors, ${day.comparisons} comparisons, ${day.enquiries} enquiries`}</title>
              {/* The whole slot is the hover target, not just the bar. */}
              <rect
                x={x}
                y={top}
                width={slot}
                height={height}
                fill="transparent"
              />
              <rect
                x={x + (slot - barWidth) / 2}
                y={top + height - h}
                width={barWidth}
                height={Math.max(h, day.visitors > 0 ? 2 : 0)}
                rx={Math.min(3, barWidth / 2)}
                className="fill-primary"
              />
            </g>
          );
        })}
        {days.length === 1 ? (
          <text
            x={width / 2}
            y={top + height + 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {days[0].day}
          </text>
        ) : (
          <>
            <text
              x={0}
              y={top + height + 16}
              className="fill-muted-foreground text-[11px]"
            >
              {days[0].day}
            </text>
            <text
              x={width}
              y={top + height + 16}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {days[days.length - 1].day}
            </text>
          </>
        )}
      </svg>
      <details className="mt-3">
        <summary className="text-muted-foreground cursor-pointer text-sm">
          The numbers, day by day
        </summary>
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="border-border border-b">
              <th scope="col" className={th}>
                Day
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Visitors
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Comparisons
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Enquiries
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr
                key={day.day}
                className="border-border border-b last:border-b-0"
              >
                <td className={td}>{day.day}</td>
                <td className={tdNum}>{day.visitors}</td>
                <td className={tdNum}>{day.comparisons}</td>
                <td className={tdNum}>{day.enquiries}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** A ranked count list with its share, as a table (sections opened, focus, bedrooms). */
export function CountTable({
  rows,
  what,
  empty,
}: {
  rows: CountRow[];
  what: string;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-border bg-muted/50 border-b">
          <th scope="col" className={th}>
            {what}
          </th>
          <th scope="col" className={cn(th, "text-right")}>
            Count
          </th>
          <th scope="col" className={cn(th, "text-right")}>
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className="border-border border-b last:border-b-0"
          >
            <td className={td}>{row.label}</td>
            <td className={tdNum}>{row.count}</td>
            <td className={tdNum}>{percent(row.count, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Visitors of a kind, and how many of them compared and enquired. */
export function BreakdownTable({
  rows,
  what,
  empty,
}: {
  rows: BreakdownRow[];
  what: string;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-border bg-muted/50 border-b">
          <th scope="col" className={th}>
            {what}
          </th>
          <th scope="col" className={cn(th, "text-right")}>
            Visitors
          </th>
          <th scope="col" className={cn(th, "text-right")}>
            Compared
          </th>
          <th scope="col" className={cn(th, "text-right")}>
            Enquired
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className="border-border border-b last:border-b-0"
          >
            <td className={td}>{row.label}</td>
            <td className={tdNum}>{row.visitors}</td>
            <td className={tdNum}>
              {row.comparers}{" "}
              <span className="text-muted-foreground">
                ({percent(row.comparers, row.visitors)})
              </span>
            </td>
            <td className={tdNum}>
              {row.enquirers}{" "}
              <span className="text-muted-foreground">
                ({percent(row.enquirers, row.visitors)})
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
