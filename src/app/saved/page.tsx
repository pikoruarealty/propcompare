import type { Metadata } from "next";
import { db } from "@/db";
import { SavedScreen } from "@/components/buyer/saved-screen";
import { requireBuyerPageSession } from "@/lib/buyer/page-session";
import { listComparisons } from "@/lib/buyer/comparisons";
import { listSavedProperties } from "@/lib/buyer/saved-properties";
import { assertNoExcludedData } from "@/lib/properties/no-price";

export const metadata: Metadata = {
  title: "Saved | PropCompare",
  robots: { index: false },
};

/** A person's own list: never cached, never shared. */
export const dynamic = "force-dynamic";

/** The most a list shows at once; a buyer's list is small. */
const PAGE_SIZE = 50;

export default async function SavedPage() {
  const { userId } = await requireBuyerPageSession("/saved");
  const [saved, comparisons] = await Promise.all([
    listSavedProperties(db, userId, 1, PAGE_SIZE),
    listComparisons(db, userId),
  ]);

  return (
    <SavedScreen
      properties={assertNoExcludedData(saved.data)}
      comparisons={assertNoExcludedData(comparisons)}
    />
  );
}
