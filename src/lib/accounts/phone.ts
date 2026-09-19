/**
 * The catalog is Ahmedabad/Gujarat only (DECISIONS.md 2026-08-31), so buyer
 * sign-in accepts an Indian mobile number: ten digits starting 6–9, with an
 * optional +91 / 91 / 0 prefix and spaces or dashes. The result is E.164
 * (`+91XXXXXXXXXX`), the one shape Better Auth stores and matches on, so
 * "98250 12345" and "+91 9825012345" reach the same account.
 */
export const normaliseIndianMobile = (input: string): string | null => {
  let digits = input.replace(/[\s-]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
};
