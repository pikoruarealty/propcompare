/**
 * The `?next=` a login screen returns to. Only a same-site path is honoured: an
 * absolute URL, a protocol-relative `//host`, or a backslash trick would turn a
 * login link into an open redirect. Anything else falls back to `fallback`.
 */
export const safeReturnPath = (
  candidate: string | null | undefined,
  fallback: string,
): string => {
  if (!candidate || !candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  for (const char of candidate) {
    if (char.charCodeAt(0) < 32) return fallback;
  }
  return candidate;
};
