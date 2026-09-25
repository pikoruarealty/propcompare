"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MAX_COMPARED } from "./model";

/**
 * The properties a buyer has picked to compare, kept in the browser so comparing
 * needs no sign-in and survives navigation and reloads (specification:
 * `docs/design/comparison.v1.md`, principle 11). Only what is needed to draw the
 * tray is stored: the slug, the name and the picture id. Nothing here is a
 * price or a personal detail.
 *
 * Storage can be missing or blocked (private windows, blocked site data), so every
 * read and write is guarded and the page works without it.
 */

export interface CompareChoice {
  slug: string;
  name: string;
  mediaId: string | null;
}

const KEY = "propcompare.compare.v1";
const CHANGED = "propcompare:compare-changed";
const EMPTY: CompareChoice[] = [];

const isChoice = (value: unknown): value is CompareChoice =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as CompareChoice).slug === "string" &&
  typeof (value as CompareChoice).name === "string" &&
  ((value as CompareChoice).mediaId === null ||
    typeof (value as CompareChoice).mediaId === "string");

const readRaw = (): string | null => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const parse = (raw: string | null): CompareChoice[] => {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return EMPTY;
    return value.filter(isChoice).slice(0, MAX_COMPARED);
  } catch {
    return EMPTY;
  }
};

let cachedRaw: string | null | undefined;
let cachedItems: CompareChoice[] = EMPTY;

/** A stable snapshot: the same array until the stored text changes. */
const snapshot = (): CompareChoice[] => {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = parse(raw);
  }
  return cachedItems;
};

/** The slugs in the comparison set right now, read outside React (analytics). */
export const currentCompareSlugs = (): string[] => {
  try {
    return snapshot().map((item) => item.slug);
  } catch {
    return [];
  }
};

const write = (items: CompareChoice[]) => {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(items.slice(0, MAX_COMPARED)),
    );
  } catch {
    // Storage unavailable: the selection simply does not persist.
  }
  window.dispatchEvent(new Event(CHANGED));
};

const subscribe = (listener: () => void) => {
  window.addEventListener(CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
};

export const compareAddress = (slugs: string[]): string =>
  `/compare?p=${slugs.map(encodeURIComponent).join(",")}`;

export const useCompareSelection = () => {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  const add = useCallback((choice: CompareChoice) => {
    const current = snapshot();
    if (current.some((item) => item.slug === choice.slug)) return;
    if (current.length >= MAX_COMPARED) return;
    write([...current, choice]);
  }, []);
  const remove = useCallback((slug: string) => {
    write(snapshot().filter((item) => item.slug !== slug));
  }, []);
  const replace = useCallback((choices: CompareChoice[]) => {
    write(choices);
  }, []);
  const clear = useCallback(() => write([]), []);

  return {
    items,
    add,
    remove,
    replace,
    clear,
    has: (slug: string) => items.some((item) => item.slug === slug),
    full: items.length >= MAX_COMPARED,
  };
};
