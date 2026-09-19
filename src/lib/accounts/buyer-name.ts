/**
 * Better Auth requires a name when it creates an account, and a buyer's first
 * verified OTP creates one before we have asked. This placeholder stands in for
 * "not asked yet": the sign-in form prompts for a real name whenever it sees it
 * (so a buyer who closes the tab mid-way is asked again next time), and the
 * header never displays it.
 */
export const PLACEHOLDER_BUYER_NAME = "Buyer";

export const isPlaceholderName = (name: string | null | undefined): boolean =>
  !name || name === PLACEHOLDER_BUYER_NAME;

/** A real name: trimmed, 2–60 characters. Returns null when it isn't one. */
export const cleanBuyerName = (input: string): string | null => {
  const name = input.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 60 && !isPlaceholderName(name)
    ? name
    : null;
};

/** The stand-in email a phone-only buyer is created with (see `src/lib/auth.ts`). */
export const isPlaceholderEmail = (email: string | null | undefined): boolean =>
  !email || email.endsWith("@buyers.propcompare.invalid");

/** A plausible email, or null. Deliberately loose: real validation is delivery. */
export const cleanOptionalEmail = (
  input: string,
): string | null | undefined => {
  const email = input.trim().toLowerCase();
  if (!email) return null; // left blank — fine
  return /^[^s@]+@[^s@]+.[^s@]+$/.test(email) && email.length <= 254
    ? email
    : undefined; // present but not an email
};
