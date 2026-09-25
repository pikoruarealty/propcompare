import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberBudgetBand, trackEvent } from "./track";

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const beacons = () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const sendBeacon = vi.fn((url: string, data: Blob) => {
    void data.text().then((text) => sent.push({ url, body: JSON.parse(text) }));
    return true;
  });
  Object.defineProperty(navigator, "sendBeacon", {
    value: sendBeacon,
    configurable: true,
  });
  return { sent, sendBeacon };
};

describe("trackEvent", () => {
  it("beacons the event with the remembered band and this visit's source", async () => {
    const { sent } = beacons();
    rememberBudgetBand("₹2–3 crore");
    trackEvent("property_viewed", { slug: "amaris" });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].url).toBe("/api/v1/events");
    expect(sent[0].body).toMatchObject({
      event: "property_viewed",
      slug: "amaris",
      band: "₹2–3 crore",
      utm: { source: null, medium: null, campaign: null },
    });
  });

  it("sends nothing when the visitor asks not to be tracked", () => {
    const { sendBeacon } = beacons();
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: true,
      configurable: true,
    });
    trackEvent("property_viewed", { slug: "amaris" });
    expect(sendBeacon).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: undefined,
      configurable: true,
    });
  });

  it("never throws, even without beacons or storage", () => {
    Object.defineProperty(navigator, "sendBeacon", {
      value: undefined,
      configurable: true,
    });
    expect(() =>
      trackEvent("property_viewed", { slug: "amaris" }),
    ).not.toThrow();
  });
});
