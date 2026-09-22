/**
 * `postgres` (the driver) auto-parses `jsonb`/`json` columns into native JS
 * values on its own, before Drizzle ever sees them. Drizzle's `jsonb()` column
 * then calls `JSON.parse` again on whatever it receives, on the assumption
 * that a driver hands it raw, unparsed text (true for `pg`, not for
 * `postgres`). For an object or array this second parse is a harmless no-op:
 * `JSON.parse(JSON.stringify(x))` round-trips. For a JSON **string whose own
 * text also happens to be valid JSON** — a six-digit PIN code, `"true"`,
 * `"null"` — the second parse silently turns it into a different type (a PIN
 * code becomes a number). Found 2026-09-22 when `property.pincode` on a real
 * submission was read back as `382481` (number) instead of `"382481"`
 * (string), because it is the first contract field whose legitimate string
 * values are always pure digits.
 *
 * The fix is to stop the driver from parsing `jsonb` at all, so Drizzle's own
 * parse is the only one. This changes behaviour only for scalar `jsonb`
 * values that are themselves valid bare JSON; every other `jsonb` column in
 * this schema stores an object or an array (`unit_variants.dimensions`,
 * `rera_fetch_jobs.fetched_payload`, `property_revisions.snapshot`, and so
 * on), which round-trip identically either way.
 */
export const JSONB_DRIVER_TYPES = {
  jsonb_raw_text: {
    to: 3802,
    from: [3802],
    serialize: (value: unknown) => JSON.stringify(value),
    parse: (value: string) => value,
  },
};
