/**
 * A rupee amount as an admin reads it: "2.5 crore", "85 lakh", "₹95,000". Display
 * only, for the private Prices tab; the stored figure is always the exact whole-rupee
 * `numeric`. Nothing here is ever sent to a buyer.
 */
const CRORE = 10_000_000;
const LAKH = 100_000;

const trim = (value: number): string =>
  value
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");

/** Indian digit grouping: 25000000 becomes "2,50,00,000". */
export const groupIndian = (digits: string): string => {
  const clean = digits.replace(/\D/g, "");
  if (clean.length <= 3) return clean;
  const last3 = clean.slice(-3);
  const rest = clean.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
};

export const describeInr = (amount: string | null): string | null => {
  if (amount === null || !/^\d{1,13}(\.\d+)?$/.test(amount)) return null;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= CRORE) return `₹${trim(value / CRORE)} crore`;
  if (value >= LAKH) return `₹${trim(value / LAKH)} lakh`;
  return `₹${groupIndian(String(Math.round(value)))}`;
};

/** "₹2.26 crore to ₹6.63 crore". */
export const describeInrRange = (min: string, max: string): string | null => {
  const from = describeInr(min);
  const to = describeInr(max);
  return from && to ? `${from} to ${to}` : null;
};

/** Whole rupees, positive, at most 13 digits (under a lakh crore). Money stays text
 * until it is a `numeric`; it is never a float. */
const PRICE = /^[1-9]\d{0,12}$/;

/** Reads what the admin typed ("2,50,00,000", "₹ 2.5 Cr" is not accepted: digits only). */
export const parsePriceInr = (input: unknown): string | null => {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const cleaned = String(input).replace(/[\s,]/g, "");
  return PRICE.test(cleaned) ? cleaned : null;
};
