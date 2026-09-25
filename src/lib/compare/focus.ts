import type { CompareGroup, GroupKey, SummaryLine } from "./model";

/**
 * The focus lens (`docs/design/comparison.v1.md`, item 10): chips that bring the
 * groups a buyer cares about to the top and lead the summary with them. It only
 * reorders. Nothing is hidden, scored or weighted, and no row changes.
 */
export type FocusKey = "space" | "timeline" | "amenities" | "build" | "trust";

/**
 * Where guided intake leaves the buyer's priorities (and nothing else: never the
 * stated range) for the comparison to read. It lives in this browser tab only.
 */
export const INTAKE_PRIORITIES_KEY = "propcompare.intake-priorities";

export const FOCUS_OPTIONS: {
  key: FocusKey;
  label: string;
  groups: GroupKey[];
}[] = [
  { key: "space", label: "Space", groups: ["unit_type", "rooms"] },
  { key: "timeline", label: "Timeline", groups: ["timeline"] },
  {
    key: "amenities",
    label: "Amenities",
    groups: ["amenities", "unit_amenities"],
  },
  { key: "build", label: "Build", groups: ["specifications"] },
  { key: "trust", label: "Trust", groups: ["trust", "project"] },
];

const FOCUS_KEYS = new Set<string>(FOCUS_OPTIONS.map((option) => option.key));

/** The focus keys in a string such as `space,timeline`; anything else is dropped. */
export const parseFocus = (value: string | null | undefined): FocusKey[] => {
  if (!value) return [];
  const seen = new Set<FocusKey>();
  for (const part of value.split(",")) {
    const key = part.trim();
    if (FOCUS_KEYS.has(key)) seen.add(key as FocusKey);
  }
  return FOCUS_OPTIONS.map((o) => o.key).filter((key) => seen.has(key));
};

/**
 * Guided intake's priorities, as focus chips. A priority no comparison group
 * speaks to (the locality, privacy) has no chip and is simply not carried over.
 */
const PRIORITY_TO_FOCUS: Record<string, FocusKey> = {
  family_space: "space",
  possession_speed: "timeline",
  amenities: "amenities",
  build_quality: "build",
};

export const focusFromPriorities = (
  priorities: readonly string[],
): FocusKey[] =>
  parseFocus(
    priorities
      .map((priority) => PRIORITY_TO_FOCUS[priority])
      .filter(Boolean)
      .join(","),
  );

const groupsOf = (focus: FocusKey[]): GroupKey[] =>
  FOCUS_OPTIONS.filter((option) => focus.includes(option.key)).flatMap(
    (option) => option.groups,
  );

/** Focused groups first (in chip order), the rest in their original order. */
export const orderGroups = (
  groups: CompareGroup[],
  focus: FocusKey[],
): CompareGroup[] => {
  if (focus.length === 0) return groups;
  const first = groupsOf(focus);
  const rank = (group: CompareGroup) => {
    const at = first.indexOf(group.key);
    return at === -1 ? first.length : at;
  };
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => rank(a.group) - rank(b.group) || a.index - b.index)
    .map(({ group }) => group);
};

/** Summary lines about a focused group first; the order within each part is kept. */
export const orderSummary = (
  summary: SummaryLine[],
  groups: CompareGroup[],
  focus: FocusKey[],
): SummaryLine[] => {
  if (focus.length === 0) return summary;
  const focused = new Set(groupsOf(focus));
  const focusedRows = new Set(
    groups
      .filter((group) => focused.has(group.key))
      .flatMap((group) => group.rows.map((row) => row.key)),
  );
  return [
    ...summary.filter((line) => focusedRows.has(line.rowKey)),
    ...summary.filter((line) => !focusedRows.has(line.rowKey)),
  ];
};
