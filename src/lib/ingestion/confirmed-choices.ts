import { parseOcrRoutingManifest } from "@/lib/ocr/routing";

/** One page's confirmed category, as the page-review screen shows it. */
export interface ConfirmedChoice {
  pageNumber: number;
  category:
    | "project_details"
    | "amenities"
    | "specifications"
    | "floor_plan"
    | "ignore";
  /** The caption carried into this page's `OcrRoutedPage.label` at confirm time, if any. */
  label?: string;
}

/**
 * The page choices a saved routing manifest was built from, so the screen can
 * show them again. Each page has exactly one category.
 *
 * A page can sit in more than one scope: the amenities step also reads the
 * project-details pages (`buildConfirmedRoutingManifest`), so a page in both was
 * chosen as project details. Reading it back as amenities would show the wrong
 * choice and, on the next save, quietly move the page out of the project-details
 * step. Project-details pages therefore claim their pages first; the first claim
 * of any page wins.
 */
export const readConfirmedChoices = (
  manifest: unknown,
  pageCount: number,
): ConfirmedChoice[] | null => {
  try {
    const parsed = parseOcrRoutingManifest(manifest, pageCount);
    const order = [...parsed.scopes].sort(
      (a, b) =>
        Number(b.kind === "property_details") -
        Number(a.kind === "property_details"),
    );
    const claimed = new Set<number>();
    const choices: ConfirmedChoice[] = [];
    for (const scope of order) {
      const category: ConfirmedChoice["category"] =
        scope.kind === "property_details"
          ? "project_details"
          : scope.kind === "floor_plans" || scope.kind === "unit_variant"
            ? "floor_plan"
            : scope.kind;
      for (const page of scope.pages) {
        if (claimed.has(page.pageNumber)) continue;
        claimed.add(page.pageNumber);
        choices.push({
          pageNumber: page.pageNumber,
          category,
          ...(page.label === undefined ? {} : { label: page.label }),
        });
      }
    }
    return choices.sort((a, b) => a.pageNumber - b.pageNumber);
  } catch {
    return null;
  }
};
