import type { DayRow } from "./dashboard";

/** India has no daylight saving, so a day is a fixed offset from UTC. */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Indian calendar day (YYYY-MM-DD) a moment falls on. */
export const istDay = (moment: Date): string =>
  new Date(moment.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * One row for every day of the period, in order, with the days that had no
 * events as zeros. The daily chart draws this, so a quiet day is a short bar
 * rather than a missing one, and one busy day among thirty is one bar of thirty.
 */
export const fillDays = (
  days: DayRow[],
  range: { from: Date; to: Date },
): DayRow[] => {
  const held = new Map(days.map((day) => [day.day, day]));
  const last = istDay(new Date(range.to.getTime() - 1));
  const filled: DayRow[] = [];
  let cursor = Date.parse(`${istDay(range.from)}T00:00:00Z`);
  for (let guard = 0; guard < 800; guard += 1) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    if (key > last) break;
    filled.push(
      held.get(key) ?? { day: key, visitors: 0, comparisons: 0, enquiries: 0 },
    );
    cursor += DAY_MS;
  }
  return filled;
};
