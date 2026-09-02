/**
 * A structural guard for the buyer read contract's exclusion list
 * (`docs/api/api-spec.v1.md`): no buyer response body, at any nesting level,
 * may carry a price, price-per-square-foot, private budget bucket,
 * submission/review status, provenance, evidence, or OCR confidence.
 *
 * This exists as runtime code rather than as a test-only helper so that the
 * fixtures, the fixture-path tests, and the database integration tests all
 * assert the same rule against the same implementation. The rule is the
 * product's central promise to developers who publish here, and the prior
 * attempt at this product proved that a rule enforced only by convention is a
 * rule that eventually breaks.
 *
 * It matches on key names, so it catches a leak introduced by a careless
 * `select()` spread — the realistic failure — rather than attempting to infer
 * meaning from values.
 */

const FORBIDDEN_KEY_PATTERNS: readonly RegExp[] = [
  /price/i,
  /bucket/i,
  /\bcost\b/i,
  /amount/i,
  /inr/i,
  /rupee/i,
  /confidence/i,
  /provenance/i,
  /evidence/i,
  /submission/i,
  /reviewstatus/i,
  /reviewedby/i,
];

export interface ForbiddenKeyMatch {
  /** Dotted path to the offending key, e.g. `data.0.unitVariants.1.priceInr`. */
  path: string;
  key: string;
}

/**
 * Walks an arbitrary value and returns every key whose name suggests excluded
 * data. Returns an empty array when the value is clean.
 */
export const findForbiddenKeys = (value: unknown): ForbiddenKeyMatch[] => {
  const matches: ForbiddenKeyMatch[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    // Guards against a cyclic graph; a fixture or an ORM row could carry one.
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, index) =>
        walk(item, `${path}${path ? "." : ""}${index}`),
      );
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}${path ? "." : ""}${key}`;
      if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        matches.push({ path: childPath, key });
      }
      walk(child, childPath);
    }
  };

  walk(value, "");
  return matches;
};

export class BuyerResponseLeakError extends Error {
  constructor(matches: ForbiddenKeyMatch[]) {
    super(
      `buyer response carries excluded data at: ${matches
        .map((match) => match.path)
        .join(", ")}`,
    );
    this.name = "BuyerResponseLeakError";
  }
}

/** Throws if `value` carries any excluded key. Returns `value` unchanged. */
export const assertNoExcludedData = <T>(value: T): T => {
  const matches = findForbiddenKeys(value);
  if (matches.length > 0) {
    throw new BuyerResponseLeakError(matches);
  }
  return value;
};
