import type { AnalyticsDashboard } from "./dashboard";
import { FUNNEL_KEYS, FUNNEL_LABEL, type FunnelKey } from "./visitors";

/**
 * A few plain sentences about what the figures show, each with where to look for
 * the visitors behind it. Rule-built from the same numbers as the tables, for the
 * admin only. None of them scores a property or names a winner: they say what
 * buyers did (`DECISIONS.md` 2026-09-23, 2026-09-26).
 */

export interface Insight {
  text: string;
  /** A visitors list narrowed to what the sentence is about, or null. */
  query: string | null;
}

const MAX_INSIGHTS = 5;

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

export const insightsOf = (data: AnalyticsDashboard): Insight[] => {
  const found: Insight[] = [];

  // Where the most visitors stop: the biggest fall between one step and the next.
  let worst: {
    key: FunnelKey;
    lost: number;
    before: number;
    after: number;
  } | null = null;
  const steps = data.funnel;
  for (let index = 0; index < steps.length - 1; index += 1) {
    const before = steps[index].visitors;
    const after = steps[index + 1].visitors;
    const lost = before - after;
    if (before >= 3 && lost >= 2 && (worst === null || lost > worst.lost)) {
      worst = { key: steps[index].key as FunnelKey, lost, before, after };
    }
  }
  if (worst && FUNNEL_KEYS.includes(worst.key)) {
    const next = FUNNEL_KEYS[FUNNEL_KEYS.indexOf(worst.key) + 1];
    found.push({
      text: `The biggest fall is after "${FUNNEL_LABEL[worst.key]}": ${worst.before} visitors got there and ${worst.after} went on to "${FUNNEL_LABEL[next]}". ${plural(worst.lost, "visitor")} stopped.`,
      query: `stopped=${worst.key}`,
    });
  }

  const pair = data.pairs[0];
  if (pair && pair.comparisons >= 2) {
    const enquiries = pair.enquiriesA + pair.enquiriesB;
    found.push({
      text: `${pair.aName} and ${pair.bName} are the pair compared most: ${plural(pair.comparisons, "time")} by ${plural(pair.visitors, "visitor")}${
        enquiries > 0
          ? `; enquiries while comparing them: ${pair.aName} ${pair.enquiriesA}, ${pair.bName} ${pair.enquiriesB}.`
          : ", with no enquiry yet."
      }`,
      query: `pair=${pair.aId},${pair.bId}`,
    });
  }

  const dropped = [...data.properties]
    .filter((row) => row.removed >= 2)
    .sort((x, y) => y.removed - x.removed)[0];
  if (dropped) {
    found.push({
      text: `${dropped.name} was dropped from a comparison ${plural(dropped.removed, "time")} and added ${plural(dropped.added, "time")}.`,
      query: `property=${dropped.id}`,
    });
  }

  const unseen = [...data.properties]
    .filter((row) => row.views >= 3 && row.inComparisons === 0)
    .sort((x, y) => y.views - x.views)[0];
  if (unseen) {
    found.push({
      text: `${unseen.name} was opened ${plural(unseen.views, "time")} and has not been in a comparison.`,
      query: `property=${unseen.id}`,
    });
  }

  if (data.gate.reached >= 2) {
    found.push({
      text: `${data.gate.unlocked} of ${data.gate.reached} visitors who reached a locked comparison signed in.`,
      query: "reached=gate",
    });
  }

  const section = data.groupsOpened[0];
  if (section && section.count >= 3) {
    found.push({
      text: `"${section.label}" is the section opened most in comparisons (${section.count} times).`,
      query: null,
    });
  }

  return found.slice(0, MAX_INSIGHTS);
};
