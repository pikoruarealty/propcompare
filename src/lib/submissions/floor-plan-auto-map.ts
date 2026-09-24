import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { OcrRoutedPage } from "@/lib/ocr/routing";
import type { StorageAdapter } from "@/lib/storage/adapter";
import { addBrochurePageImage } from "./brochure-page-media";
import { SubmissionMediaError } from "./media";

/**
 * Ties each extracted unit type to its own floor-plan page(s) of the brochure, so
 * an admin approves a picture instead of hunting for the page and retyping the
 * unit type ("Use as image" by hand).
 *
 * The key is the router's caption on each confirmed page: it was read off that
 * page's own printed heading. The model's cited page numbers are only a
 * tie-breaker, because they are the less reliable of the two: on Anamika High
 * Point the model cited the wrong page (off by one) for both Block B & E unit
 * types, while every router caption was right (checked against the rendered
 * pages). A unit type is tied to a page only when the caption names it; nothing
 * is guessed from position or order.
 *
 * Every image this creates is a private, unreviewed candidate, never public
 * (`asCandidate` in `addBrochurePageImage`): an admin still looks at it and
 * approves or deletes it, and only the `property_submissions` publish
 * transaction can make it live.
 */

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== "");

/** A unit type's identity is its name without the parenthetical, which prints
 * unit numbers ("(Units 201)") a floor plan's caption does not repeat. */
const identityTokens = (variantName: string): string[] =>
  tokens(variantName.replace(/\([^)]*\)/g, " "));

/** Words that name a kind of unit; what follows one is that unit's own name. */
const LABEL_WORDS = new Set(["type", "unit", "block", "tower", "wing"]);

/**
 * Whether a caption names this unit type. Every identity word must be in the
 * caption, and a name that follows a label word ("type 2", "block b") must
 * follow it in the caption too: the "2" in "2 BHK - Type 1" is not "Type 2".
 */
const captionNames = (identity: string[], caption: string[]): boolean => {
  if (identity.length === 0) return false;
  const words = new Set(caption);
  if (!identity.every((token) => words.has(token))) return false;
  return identity.every((token, i) => {
    const next = identity[i + 1];
    if (!LABEL_WORDS.has(token) || next === undefined) return true;
    return caption.some((word, j) => word === token && caption[j + 1] === next);
  });
};

export interface FloorPlanVariant {
  variantName: string;
  /** Pages the model cited for this unit type, when it cited any. */
  evidencePages: number[];
}

export interface FloorPlanMatch {
  variantName: string;
  pageNumber: number;
  label: string;
}

/**
 * Pure. For each page, the unit type(s) whose identity tokens all appear in the
 * page's caption, keeping only the most specific (most tokens); a tie between
 * different unit types drops the page. A unit type left with several pages keeps
 * those the model also cited; if it cited none of them, none are tied.
 */
export const matchFloorPlanPages = (
  variants: FloorPlanVariant[],
  pages: OcrRoutedPage[],
): FloorPlanMatch[] => {
  const identities = variants.map((variant) => ({
    variant,
    tokens: identityTokens(variant.variantName),
  }));

  const byVariant = new Map<string, { page: number; label: string }[]>();
  for (const page of pages) {
    if (!page.label) continue;
    const label = tokens(page.label);
    const matching = identities.filter((identity) =>
      captionNames(identity.tokens, label),
    );
    if (matching.length === 0) continue;
    const most = Math.max(...matching.map((m) => new Set(m.tokens).size));
    const best = matching.filter((m) => new Set(m.tokens).size === most);
    if (best.length !== 1) continue;
    const name = best[0].variant.variantName;
    byVariant.set(name, [
      ...(byVariant.get(name) ?? []),
      { page: page.pageNumber, label: page.label },
    ]);
  }

  const matches: FloorPlanMatch[] = [];
  for (const { variant } of identities) {
    const found = byVariant.get(variant.variantName) ?? [];
    const chosen =
      found.length <= 1
        ? found
        : found.filter((entry) => variant.evidencePages.includes(entry.page));
    for (const entry of chosen) {
      matches.push({
        variantName: variant.variantName,
        pageNumber: entry.page,
        label: entry.label,
      });
    }
  }
  return matches;
};

/**
 * Adds each matched page to the submission as a needs-review floor-plan
 * candidate for its unit type. A page already added (by hand, or by an earlier
 * run) is left as it is. Returns how many were added.
 */
export const autoMapFloorPlanImages = async (
  deps: { database: PostgresJsDatabase; storage: StorageAdapter },
  input: {
    submissionId: string;
    variants: FloorPlanVariant[];
    pages: OcrRoutedPage[];
  },
): Promise<{ added: FloorPlanMatch[]; skipped: FloorPlanMatch[] }> => {
  const added: FloorPlanMatch[] = [];
  const skipped: FloorPlanMatch[] = [];
  for (const match of matchFloorPlanPages(input.variants, input.pages)) {
    try {
      await addBrochurePageImage(deps, {
        submissionId: input.submissionId,
        uploadedBy: null,
        pageNumber: match.pageNumber,
        mediaType: "floor_plan",
        unitVariantName: match.variantName,
        caption: match.label,
        asCandidate: true,
      });
      added.push(match);
    } catch (cause) {
      if (
        cause instanceof SubmissionMediaError &&
        cause.code === "already_added"
      ) {
        skipped.push(match);
        continue;
      }
      throw cause;
    }
  }
  return { added, skipped };
};
