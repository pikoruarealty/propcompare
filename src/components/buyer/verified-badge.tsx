import { ShieldCheck } from "lucide-react";
import { TabularValue } from "./typography";

/**
 * The Soft Gold trust badge.
 *
 * Soft Gold (`--color-verified-gold`) is reserved strictly for verified/trust
 * badges and is never decorative — `AGENTS.md` says so, and
 * `src/app/design-tokens.test.ts` keeps it out of every component colour slot.
 * This file is the one place in the buyer surface that may use it.
 *
 * The rule that matters is stronger than "use gold sparingly": the badge
 * cannot be rendered without the concrete fact that justifies it. So it takes
 * no boolean, no `variant`, no `children`, and no `className` — there is no
 * shape of this component that renders gold decoratively. It takes a verified
 * *fact* or `null`, and `null` renders nothing.
 *
 * `docs/app-flows/buyer.md`: a RERA Verified indicator denotes the specific
 * verified fact the catalog supports; it is not a general-quality guarantee.
 * The badge therefore shows the registration number it is asserting, which is
 * the evidence path `design.v1.md` requires of a trust signal.
 */

export interface ReraVerifiedFact {
  kind: "rera";
  registrationNumber: string;
  /** ISO-8601, when the catalog records a verification date. */
  lastVerifiedAt: string | null;
}

/** Any fact that can justify the badge. Only RERA qualifies in v1. */
export type VerifiedFact = ReraVerifiedFact;

export interface ReraFactSource {
  registered: boolean;
  registrationNumber: string | null;
  lastVerifiedAt: string | null;
}

/**
 * Derives the verified fact from a property's RERA data, or `null` when there
 * is nothing concrete to assert.
 *
 * `registered: true` on its own is deliberately **not** enough. A registration
 * flag with no registration number is a claim with no evidence behind it, and
 * a gold badge on an unevidenced claim is exactly the decorative trust signal
 * the design guide rules out. Absent the number, the property still shows its
 * RERA facts through `FactValue` — it just does not wear the badge.
 */
export const reraVerifiedFact = (
  rera: ReraFactSource,
): ReraVerifiedFact | null => {
  if (!rera.registered) return null;

  const registrationNumber = rera.registrationNumber?.trim() ?? "";
  if (registrationNumber === "") return null;

  return {
    kind: "rera",
    registrationNumber,
    lastVerifiedAt: rera.lastVerifiedAt,
  };
};

const formatVerifiedDate = (isoString: string): string | null => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export interface VerifiedBadgeProps {
  /** The fact being asserted. `null` renders nothing at all. */
  fact: VerifiedFact | null;
}

export function VerifiedBadge({ fact }: VerifiedBadgeProps) {
  if (fact === null) return null;

  const verifiedOn =
    fact.lastVerifiedAt === null
      ? null
      : formatVerifiedDate(fact.lastVerifiedAt);

  return (
    <span
      data-slot="verified-badge"
      data-verified-kind={fact.kind}
      title={
        verifiedOn === null
          ? `RERA registration ${fact.registrationNumber}`
          : `RERA registration ${fact.registrationNumber}, last verified ${verifiedOn}`
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-verified-gold)] bg-[color-mix(in_oklab,var(--color-verified-gold)_12%,var(--color-chalk))] px-2 py-0.5 text-xs font-medium text-[var(--color-ink)]"
    >
      <ShieldCheck
        aria-hidden="true"
        className="size-3.5 text-[var(--color-verified-gold)]"
      />
      RERA Verified
      <TabularValue className="text-muted-foreground">
        {fact.registrationNumber}
      </TabularValue>
    </span>
  );
}
