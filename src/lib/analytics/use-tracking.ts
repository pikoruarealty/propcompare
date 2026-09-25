"use client";

import { useEffect, useRef } from "react";
import type { AnalyticsEvent } from "./events";
import { trackEvent, type TrackPayload } from "./track";

/** Sends an event once for each distinct `key` (a page view, a comparison opened). */
export const useTrackOnce = (
  event: AnalyticsEvent,
  payload: TrackPayload,
  key: string,
): void => {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === key) return;
    sent.current = key;
    trackEvent(event, payload);
    // `key` stands for the payload.
  }, [event, key]); // eslint-disable-line react-hooks/exhaustive-deps
};

/**
 * Counts the time a page is actually in front of the buyer (visible, not a
 * background tab) and reports it when the page is hidden, left or changes what it
 * shows (`key`). A stretch under a second is not reported.
 */
export const useEngagedTime = (
  page: "dossier" | "compare",
  payload: TrackPayload,
  key: string,
): void => {
  const latest = useRef(payload);
  useEffect(() => {
    latest.current = payload;
  });

  useEffect(() => {
    let visibleSince: number | null =
      document.visibilityState === "visible" ? Date.now() : null;
    let banked = 0;

    const flush = () => {
      const now = Date.now();
      const total = banked + (visibleSince === null ? 0 : now - visibleSince);
      banked = 0;
      visibleSince = document.visibilityState === "visible" ? now : null;
      if (total >= 1000) {
        trackEvent("page_engaged", {
          ...latest.current,
          engagedMs: total,
          detail: { page },
        });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else visibleSince = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [page, key]);
};
