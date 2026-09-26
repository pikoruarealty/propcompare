/** Shared by the admin Analytics screens and the sentences built for them. */

export const percent = (part: number, whole: number): string =>
  whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`;

export const duration = (seconds: number | null): string => {
  if (seconds === null) return "–";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
};
