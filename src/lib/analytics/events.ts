import { FOCUS_OPTIONS, type FocusKey } from "@/lib/compare/focus";
import { PRIORITY_KEYS } from "@/lib/properties/intake";

/**
 * The analytics vocabulary and the rules for what an event may carry (schema v20,
 * `DECISIONS.md` 2026-09-25). Pure, shared by the route that records events and
 * by the tests, so the rule "no price, no personal detail, nothing free-form"
 * holds in one place.
 */

export const ANALYTICS_EVENTS = [
  "property_viewed",
  "comparison_started",
  "comparison_removed",
  "compare_opened",
  "compare_group_opened",
  "compare_unit_switched",
  "compare_focus_set",
  "comparison_shared",
  "comparison_saved",
  "property_saved",
  "dossier_unlocked",
  "enquiry_submitted",
  "intake_completed",
  "page_engaged",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/**
 * A coarse, public band of the ceiling a buyer states in guided intake. Never the
 * figure itself: the slider moves in five-lakh notches, so its value is too fine
 * to record, and the private budget buckets never leave `private`.
 */
export const BUDGET_BANDS = [
  "Up to ₹50 lakh",
  "₹50–75 lakh",
  "₹75 lakh–1 crore",
  "₹1–1.5 crore",
  "₹1.5–2 crore",
  "₹2–3 crore",
  "₹3–5 crore",
  "₹5 crore or more",
] as const;

export type BudgetBand = (typeof BUDGET_BANDS)[number];

/** The band a stated ceiling (in lakh) falls in; the slider's top end is open. */
export const budgetBandOf = (ceilingLakh: number): BudgetBand => {
  if (ceilingLakh <= 50) return "Up to ₹50 lakh";
  if (ceilingLakh <= 75) return "₹50–75 lakh";
  if (ceilingLakh <= 100) return "₹75 lakh–1 crore";
  if (ceilingLakh <= 150) return "₹1–1.5 crore";
  if (ceilingLakh <= 200) return "₹1.5–2 crore";
  if (ceilingLakh <= 300) return "₹2–3 crore";
  if (ceilingLakh < 500) return "₹3–5 crore";
  return "₹5 crore or more";
};

/** The longest visible stretch one ping may report (the table's own limit). */
export const MAX_ENGAGED_MS = 30 * 60 * 1000;

const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[a-z0-9_]{1,40}$/;

/** A comparison group a buyer can open (`GroupKey` in the comparison model). */
const GROUP_KEYS = new Set([
  "timeline",
  "unit_type",
  "rooms",
  "unit_amenities",
  "project",
  "amenities",
  "specifications",
  "location",
  "trust",
]);
const FOCUS_KEYS = new Set<string>(FOCUS_OPTIONS.map((option) => option.key));
const PRIORITY_SET = new Set<string>(PRIORITY_KEYS);

export interface EventInput {
  event: AnalyticsEvent;
  slug: string | null;
  slugs: string[];
  engagedMs: number | null;
  detail: Record<string, unknown> | null;
  budgetBand: BudgetBand | null;
  utm: {
    source: string | null;
    medium: string | null;
    campaign: string | null;
  };
  referrer: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const slugOf = (value: unknown): string | null =>
  typeof value === "string" && SLUG.test(value) ? value : null;

/** A campaign tag, lower-cased and reduced to a safe token, or null. */
export const cleanTag = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned === "" ? null : cleaned;
};

/** The referring site's domain only, never the page or its query, and not our own. */
export const referrerDomainOf = (
  referrer: string | null,
  ownHost: string | null,
): string | null => {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const own = ownHost
      ?.toLowerCase()
      .replace(/:\d+$/, "")
      .replace(/^www\./, "");
    if (host === "" || host === own) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
};

/**
 * The event-specific detail, reduced to what that event may carry, or `undefined`
 * when what arrived does not fit (the event is then not recorded).
 */
const detailFor = (
  event: AnalyticsEvent,
  raw: unknown,
): Record<string, unknown> | null | undefined => {
  const detail = isRecord(raw) ? raw : {};
  switch (event) {
    case "comparison_removed": {
      const where = detail.where;
      return where === "tray" || where === "compare" ? { where } : undefined;
    }
    case "compare_group_opened":
      return typeof detail.group === "string" && GROUP_KEYS.has(detail.group)
        ? { group: detail.group }
        : undefined;
    case "compare_unit_switched":
      return typeof detail.unitVariantId === "string" &&
        UUID.test(detail.unitVariantId)
        ? { unitVariantId: detail.unitVariantId.toLowerCase() }
        : undefined;
    case "compare_focus_set": {
      const focus = Array.isArray(detail.focus) ? detail.focus : null;
      if (!focus || !focus.every((key) => FOCUS_KEYS.has(String(key)))) {
        return undefined;
      }
      return { focus: [...new Set(focus as FocusKey[])] };
    }
    case "page_engaged":
      return detail.page === "dossier" || detail.page === "compare"
        ? { page: detail.page }
        : undefined;
    case "intake_completed": {
      const priorities = Array.isArray(detail.priorities)
        ? detail.priorities.filter(
            (key): key is string =>
              typeof key === "string" && PRIORITY_SET.has(key),
          )
        : [];
      const bhk =
        typeof detail.bhk === "string" && TOKEN.test(detail.bhk)
          ? detail.bhk
          : null;
      const city =
        typeof detail.city === "string" &&
        /^[\p{L} .'-]{1,60}$/u.test(detail.city.trim())
          ? detail.city.trim()
          : null;
      return { priorities: [...new Set(priorities)], bhk, city };
    }
    default:
      return null;
  }
};

/** What each event needs to mean anything. */
const NEEDS_SLUG = new Set<AnalyticsEvent>([
  "property_viewed",
  "comparison_started",
  "comparison_removed",
  "compare_unit_switched",
  "property_saved",
  "dossier_unlocked",
  "enquiry_submitted",
]);
const NEEDS_SET = new Set<AnalyticsEvent>([
  "compare_opened",
  "compare_group_opened",
  "compare_focus_set",
  "comparison_shared",
  "comparison_saved",
]);

/**
 * A request body as an event we may record, or null when it is not one. Nothing is
 * ever an error to the sender: telemetry that does not fit is simply not kept.
 */
export const readEventInput = (body: unknown): EventInput | null => {
  if (!isRecord(body)) return null;
  const event = body.event;
  if (
    typeof event !== "string" ||
    !(ANALYTICS_EVENTS as readonly string[]).includes(event)
  ) {
    return null;
  }
  const name = event as AnalyticsEvent;
  const slug = slugOf(body.slug);
  const slugs = Array.isArray(body.slugs)
    ? [
        ...new Set(
          body.slugs.map(slugOf).filter((s): s is string => s !== null),
        ),
      ].slice(0, 4)
    : [];
  if (NEEDS_SLUG.has(name) && slug === null) return null;
  if (NEEDS_SET.has(name) && slugs.length === 0) return null;

  let engagedMs: number | null = null;
  if (name === "page_engaged") {
    const ms = body.engagedMs;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 1000) {
      return null;
    }
    engagedMs = Math.min(Math.round(ms), MAX_ENGAGED_MS);
  }

  const detail = detailFor(name, body.detail);
  if (detail === undefined) return null;

  const band =
    typeof body.band === "string" &&
    (BUDGET_BANDS as readonly string[]).includes(body.band)
      ? (body.band as BudgetBand)
      : null;
  const utm = isRecord(body.utm) ? body.utm : {};
  return {
    event: name,
    slug,
    slugs,
    engagedMs,
    detail,
    budgetBand: band,
    utm: {
      source: cleanTag(utm.source),
      medium: cleanTag(utm.medium),
      campaign: cleanTag(utm.campaign),
    },
    referrer: typeof body.referrer === "string" ? body.referrer : null,
  };
};

/** Phone, tablet or desktop, from the browser's own description of itself. */
export const deviceOf = (userAgent: string | null): string => {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) {
    return "tablet";
  }
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "mobile";
  return "desktop";
};

/** Crawlers, link previews and headless browsers are not visitors. */
export const isAutomated = (userAgent: string | null): boolean =>
  !userAgent ||
  /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests|node-fetch|axios/i.test(
    userAgent,
  );

/** Global Privacy Control or Do Not Track: nothing is recorded. */
export const optedOut = (headers: Headers): boolean =>
  headers.get("sec-gpc") === "1" || headers.get("dnt") === "1";
