import type { AnalyticsEvent, BudgetBand } from "./events";

/**
 * Sending an analytics event from the browser (schema v20). Fire and forget: a
 * beacon, which the browser delivers even as the page closes, and nothing at all
 * where beacons are missing, storage is blocked or the visitor has asked not to be
 * tracked. It can never break the page or delay what the buyer is doing.
 */

export const EVENTS_URL = "/api/v1/events";
const SOURCE_KEY = "propcompare.analytics.source";
const BAND_KEY = "propcompare.analytics.band";

interface VisitSource {
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
  };
  referrer: string | null;
}

/**
 * Where this visit came from, captured once per tab from the address it landed on
 * and the page that linked to it, so later events keep crediting the same source.
 */
const visitSource = (): VisitSource => {
  try {
    const held = window.sessionStorage.getItem(SOURCE_KEY);
    if (held) return JSON.parse(held) as VisitSource;
  } catch {
    // Storage blocked: fall through and read it from this page.
  }
  const params = new URLSearchParams(window.location.search);
  const source: VisitSource = {
    utm: {
      source: params.get("utm_source"),
      medium: params.get("utm_medium"),
      campaign: params.get("utm_campaign"),
    },
    referrer: document.referrer || null,
  };
  try {
    window.sessionStorage.setItem(SOURCE_KEY, JSON.stringify(source));
  } catch {
    // Not kept: the next event reads the page again.
  }
  return source;
};

/** Remembers the band of the budget ceiling stated in guided intake. */
export const rememberBudgetBand = (band: BudgetBand): void => {
  try {
    window.localStorage.setItem(BAND_KEY, band);
  } catch {
    // Not kept: later events carry no band.
  }
};

const heldBand = (): string | null => {
  try {
    return window.localStorage.getItem(BAND_KEY);
  } catch {
    return null;
  }
};

export interface TrackPayload {
  slug?: string;
  slugs?: string[];
  engagedMs?: number;
  detail?: Record<string, unknown>;
}

export const trackEvent = (
  event: AnalyticsEvent,
  payload: TrackPayload = {},
): void => {
  try {
    if (typeof window === "undefined") return;
    if (typeof navigator.sendBeacon !== "function") return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return;
    const body = JSON.stringify({
      event,
      ...payload,
      band: heldBand(),
      ...visitSource(),
    });
    navigator.sendBeacon(
      EVENTS_URL,
      new Blob([body], { type: "application/json" }),
    );
  } catch {
    // Telemetry never gets in the buyer's way.
  }
};
