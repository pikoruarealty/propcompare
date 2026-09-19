"use client";

import * as React from "react";
import { BrochureViewer } from "@/components/admin/pdf/brochure-viewer";

/**
 * The page-review workbench for a brochure draft. This first version is the
 * viewing and selection layer — every page as a thumbnail, any page selectable
 * or deselectable, any page openable large with zoom. Assigning each selected
 * page to what it contains (project details, amenities, specifications, a unit
 * type, or ignore), the auto-suggestions, and the confirm-before-paid-OCR step
 * build on this in the next slice (docs/tasklists/2026-09-19-admin-portal.md).
 */
export function PageReview({
  pdfUrl,
  pageCount,
}: {
  pdfUrl: string;
  pageCount: number;
}) {
  const [selected, setSelected] = React.useState<ReadonlySet<number>>(
    () => new Set(),
  );

  const toggle = React.useCallback((page: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        <span className="data-tabular text-foreground">{selected.size}</span> of{" "}
        <span className="data-tabular">{pageCount}</span> pages selected. Click
        a page to view it larger; use the checkbox to select it.
      </p>

      <BrochureViewer
        pdfUrl={pdfUrl}
        pageCount={pageCount}
        selected={selected}
        onToggle={toggle}
        renderLightboxFooter={(page) => (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(page)}
              onChange={() => toggle(page)}
              className="size-4 accent-[var(--color-terracotta)]"
            />
            Select page {page}
          </label>
        )}
      />
    </div>
  );
}
