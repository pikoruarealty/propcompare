import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PaginationMeta, PropertySummary } from "@/lib/properties/types";

/**
 * The buyer-account read/write contract: saved properties, comparisons,
 * enquiries, dossier unlocks (`docs/tasklists/2026-09-18-buyer-account-routes.md`).
 * Unlike `@/lib/properties/types.ts`, this is not a guarded public-listing
 * contract with its own frozen filter set — these are simple owned records,
 * scoped by session `userId` rather than by query parameters.
 */
export type AppDb = PostgresJsDatabase<Record<string, never>>;

export interface SavedPropertyEntry {
  savedAt: string;
  property: PropertySummary;
}

export interface SavedPropertyListResult {
  data: SavedPropertyEntry[];
  pagination: PaginationMeta;
}

export interface ComparisonItemResult {
  propertyId: string;
  unitVariantId: string | null;
  displayOrder: number;
  property: PropertySummary;
}

export interface ComparisonResult {
  id: string;
  createdAt: string;
  items: ComparisonItemResult[];
}

export interface EnquiryResult {
  id: string;
  propertyId: string;
  unitVariantId: string | null;
  /** Always `new` when created; triage after that is the admin's. */
  status: "new" | "contacted" | "forwarded" | "closed";
  message: string | null;
  createdAt: string;
}

export interface DossierUnlockResult {
  propertyId: string;
  otpVerifiedAt: string;
}
